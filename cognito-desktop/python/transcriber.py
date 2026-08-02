import argparse
import json
import re
import os
import sys
import shutil
import time
import gc
import psutil  # type: ignore
import traceback
from datetime import datetime

# ============================================================
# CRITICAL: Inject environment variables FIRST before any imports
# so all child subprocesses (mlx_whisper, ffmpeg, torchaudio,
# simple_diarizer) inherit a correct PATH and writable cache dir.
# ============================================================
_home = os.path.expanduser("~")
_local_bin = os.path.join(_home, ".cognitocall", "bin")
_user_local_bin = os.path.join(_home, ".local", "bin")  # user/pip installs land here (e.g. a static ffmpeg)
_brew_bins = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"]

# Build a comprehensive PATH that includes all common ffmpeg locations
_path_parts = os.environ.get("PATH", "").split(":")
for _p in [_local_bin, _user_local_bin] + _brew_bins:
    if _p not in _path_parts:
        _path_parts.insert(0, _p)
os.environ["PATH"] = ":".join(_path_parts)

# Tell SpeechBrain/simple_diarizer to cache pretrained models in a writeable dir
_speechbrain_cache = os.path.join(_home, ".cognitocall", "pretrained_models")
os.makedirs(_speechbrain_cache, exist_ok=True)
os.environ["SPEECHBRAIN_CACHE"] = _speechbrain_cache
os.environ["SPEECHBRAIN_FETCH_STRATEGY"] = "copy"

# Tell torch hub to also cache in a writeable location
os.environ["TORCH_HOME"] = os.path.join(_home, ".cognitocall", "torch")

import torch
import mlx.core as mx
import mlx_whisper
import mlx_whisper.audio  # ffmpeg-backed decode to 16kHz numpy; used for torchaudio-free windowing
import soundfile  # write 16kHz mono PCM WAV slices for windowed diarization

# Bypass interactive PyTorch Hub trusted repo warnings for headless execution
try:
    import torch.hub
    def _patched_check(*args, **kwargs):
        pass
    torch.hub._check_repo_is_trusted = _patched_check
except Exception:
    pass

import huggingface_hub
# Monkeypatch huggingface_hub.hf_hub_download to redirect 'use_auth_token' to 'token' (fixing legacy SpeechBrain 0.5.16 call bug)
original_hf_hub_download = huggingface_hub.hf_hub_download
def patched_hf_hub_download(*args, **kwargs):
    if 'use_auth_token' in kwargs:
        kwargs['token'] = kwargs.pop('use_auth_token')
    return original_hf_hub_download(*args, **kwargs)
huggingface_hub.hf_hub_download = patched_hf_hub_download

from simple_diarizer.diarizer import Diarizer

def emit_progress(status, message):
    # Print JSON directly to stdout for Rust to intercept and emit to frontend
    print(json.dumps({"status": status, "message": message}), flush=True)

def log_diagnostic(folder_path, message):
    log_path = os.path.join(folder_path, "diagnostic.log")
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    log_line = f"[{timestamp}] {message}\n"
    try:
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(log_line)
    except Exception as e:
        sys.stderr.write(f"Failed to write to diagnostic.log: {e}\n")
        sys.stderr.write(log_line)

def init_diagnostic_log(folder_path):
    os.makedirs(folder_path, exist_ok=True)
    log_path = os.path.join(folder_path, "diagnostic.log")
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    separator = (
        f"\n"
        f"================================================================================\n"
        f"DIAGNOSTIC LOG RUN (MLX PIPELINE) AT: {now_str}\n"
        f"================================================================================\n"
    )
    try:
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(separator)
    except Exception as e:
        sys.stderr.write(f"Failed to initialize diagnostic.log: {e}\n")

def log_file_metrics(folder_path, mic_path, tab_path):
    log_diagnostic(folder_path, "--- File Size Metrics ---")
    video_path = os.path.join(folder_path, "video.webm")
    log_file_size(folder_path, "video.webm", video_path)
    log_file_size(folder_path, os.path.basename(mic_path), mic_path)
    log_file_size(folder_path, os.path.basename(tab_path), tab_path)
    log_diagnostic(folder_path, "-------------------------")

def log_file_size(folder_path, label, file_path):
    if os.path.exists(file_path):
        size_bytes = os.path.getsize(file_path)
        size_mb = size_bytes / (1024 * 1024)
        log_diagnostic(folder_path, f"{label}: {size_mb:.2f} MB ({size_bytes} bytes)")
    else:
        log_diagnostic(folder_path, f"{label}: NOT FOUND")

def log_resources(folder_path, point_label):
    try:
        system_cpu = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        system_ram_used = mem.used / (1024 ** 3)
        system_ram_total = mem.total / (1024 ** 3)
        
        process = psutil.Process(os.getpid())
        process_cpu = process.cpu_percent(interval=None)
        process_ram_rss = process.memory_info().rss / (1024 ** 3)
        
        msg = (
            f"[RESOURCE] {point_label} -> "
            f"System CPU: {system_cpu:.1f}%, "
            f"System RAM: {system_ram_used:.2f} GB / {system_ram_total:.2f} GB | "
            f"Process CPU: {process_cpu:.1f}%, "
            f"Process RAM RSS: {process_ram_rss:.2f} GB"
        )
        log_diagnostic(folder_path, msg)
    except Exception as e:
        log_diagnostic(folder_path, f"[ERROR] Failed to log hardware resources at '{point_label}': {e}")

def salvage_json(text):
    """Best-effort recovery of a truncated/malformed JSON object from an LLM response.

    Returns a dict on success, or None if unrecoverable. Handles the common failure
    mode where generation hit max_tokens mid-object: trailing commas, an unterminated
    string, and unclosed { / [ brackets.
    """
    if not text:
        return None
    start = text.find("{")
    if start == -1:
        return None
    s = text[start:].strip()
    decoder = json.JSONDecoder()

    # 1. Fast path: parse a leading JSON object, ignoring any trailing prose after it.
    try:
        obj, _ = decoder.raw_decode(s)
        if isinstance(obj, dict):
            return obj
    except Exception:
        pass

    # 2. Strip trailing commas before a closer (e.g. `... ,\n}` or `..., ]`).
    s = re.sub(r",(\s*[}\]])", r"\1", s)

    # 3. Scan to find unterminated string + unclosed brackets, tracking string state.
    stack = []
    in_str = False
    escaped = False
    for ch in s:
        if in_str:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            stack.append(ch)
        elif ch == "}":
            if stack and stack[-1] == "{":
                stack.pop()
        elif ch == "]":
            if stack and stack[-1] == "[":
                stack.pop()

    repaired = s
    if in_str:
        repaired += '"'  # close a dangling string
    # Drop any trailing comma left after closing the string, then close open brackets.
    repaired = re.sub(r",\s*$", "", repaired.rstrip())
    for opener in reversed(stack):
        repaired += "}" if opener == "{" else "]"

    try:
        obj, _ = decoder.raw_decode(repaired)
        return obj if isinstance(obj, dict) else None
    except Exception:
        return None


def is_hallucinated_segment(seg):
    """Conservative detector for Whisper silence-hallucination (repeat-loops / no-speech).

    Defaults to False (keep the segment) — only returns True on a clear signal, and the
    caller restricts it to Whisper sources (mic/tab) so captions/refined text pass through.
    """
    # Strong no-speech signal from Whisper's own probability, when present.
    try:
        if float(seg.get("no_speech_prob", 0.0)) > 0.85:
            return True
    except (TypeError, ValueError):
        pass

    text = str(seg.get("text", "")).strip()
    tokens = text.split()
    if len(tokens) >= 6:
        lowered = [t.lower() for t in tokens]
        unique_ratio = len(set(lowered)) / len(lowered)
        # Degenerate repeat-loop: very few unique tokens (e.g. "I. I. I. ..." or "3.5-3.5").
        if unique_ratio < 0.3 or len(set(lowered)) == 1:
            return True
    return False


def collapse_consecutive_duplicates(segments):
    """Merge runs of consecutive segments that share a speaker and identical text into one.

    Repetitive back-channel ("Yes." repeated dozens of times) otherwise floods the LLM
    prompt and pushes the small model into a generation repeat-loop. The merged segment
    keeps the first start and the last end so the timeline stays intact.
    """
    collapsed = []
    for seg in segments:
        text_norm = str(seg.get("text", "")).strip().lower()
        if collapsed and text_norm:
            prev = collapsed[-1]
            if (str(prev.get("text", "")).strip().lower() == text_norm
                    and prev.get("speaker") == seg.get("speaker")):
                prev["end"] = seg.get("end", prev.get("end"))  # extend the run
                continue
        collapsed.append(dict(seg))
    return collapsed


def generate_intelligence(final_segments, folder_path, user_name="Me"):
    try:
        import mlx_lm
        from mlx_lm.sample_utils import make_sampler, make_logits_processors
    except ImportError:
        log_diagnostic(folder_path, "[ERROR] mlx-lm library not installed. Skipping intelligence generation.")
        return

    if not final_segments:
        log_diagnostic(folder_path, "[WARNING] No transcript segments available for intelligence generation.")
        return

    # Collapse runs of identical back-channel ("Yes." x40) so the repetitive input doesn't
    # push Gemma into a generation repeat-loop. Only affects the LLM prompt, not the saved
    # transcript's raw fidelity of what was refined.
    final_segments = collapse_consecutive_duplicates(final_segments)

    model_id = "mlx-community/gemma-2-2b-it-4bit"
    log_diagnostic(folder_path, f"Loading LLM {model_id} for user '{user_name}' transcript refinement and map-reduce intelligence...")

    # Group segments into chronological chunks (~15 minutes = 900 seconds per chunk)
    # Split transcript into 30-minute logical chunks (1800s) for ultra-fast GPU processing
    chunk_interval_sec = 1800.0
    chunks = []
    current_chunk = []
    chunk_start_time = 0.0

    for seg in final_segments:
        if not current_chunk:
            chunk_start_time = seg.get("start", 0.0)
            current_chunk.append(seg)
        elif (seg.get("start", 0.0) - chunk_start_time) < chunk_interval_sec:
            current_chunk.append(seg)
        else:
            chunks.append(current_chunk)
            current_chunk = [seg]
            chunk_start_time = seg.get("start", 0.0)

    if current_chunk:
        chunks.append(current_chunk)

    total_chunks = len(chunks)
    log_diagnostic(folder_path, f"Split transcript into {total_chunks} chunk(s) for fast LLM processing.")

    master_refined_segments = []
    chunk_summaries = []

    try:
        load_res = mlx_lm.load(model_id)
        model, tokenizer = load_res[0], load_res[1]

        # Low-temperature sampling + repetition penalty to stop the small model from
        # degenerating into a repeat-loop (e.g. emitting "Yes." until it exhausts max_tokens).
        gen_sampler = make_sampler(temp=0.3)
        gen_logits_processors = make_logits_processors(repetition_penalty=1.3, repetition_context_size=64)

        # MAP STAGE: Process each chunk for sentence-level refinement + local summary
        for idx, chunk in enumerate(chunks, 1):
            if total_chunks > 1:
                emit_progress("llm_processing", f"Refining sentences & analyzing section {idx} of {total_chunks} with Gemma...")
            else:
                emit_progress("llm_processing", "Refining transcript sentences and generating notes with Gemma...")

            chunk_text = "\n".join([f"[{seg.get('start', 0.0):.1f}s - {seg.get('end', 0.0):.1f}s] {seg.get('speaker', 'Unknown')}: {seg.get('text', '')}" for seg in chunk])
            if len(chunk_text) > 8000:
                chunk_text = chunk_text[:8000] + "... [truncated]"

            map_prompt = (
                "You are an expert transcript editor and executive assistant.\n"
                f"Note: The primary user attending this meeting is '{user_name}'.\n"
                "Analyze the following speech segments from a meeting.\n"
                "Your tasks:\n"
                "1. Restructure raw speech fragments into complete, clean, well-punctuated SENTENCES.\n"
                f"2. Infer speaker names from conversational context (e.g. if someone addresses '{user_name}' or another person, attribute their response to that person).\n"
                "3. Preserve estimated start and end timestamps for each sentence.\n"
                "4. Provide a 2-3 sentence summary of this section and list key action items.\n\n"
                "You MUST format your entire response strictly as a JSON object matching this schema:\n"
                "{\n"
                "  \"title\": \"3-to-5 word title\",\n"
                "  \"refined_sentences\": [\n"
                "    {\"speaker\": \"Speaker Name\", \"start\": 0.0, \"end\": 4.5, \"text\": \"Cleaned complete sentence.\"}\n"
                "  ],\n"
                "  \"summary\": \"Concise paragraph summary of this section.\",\n"
                "  \"action_items\": [\"Action item description\"]\n"
                "}\n\n"
                f"Transcript slice:\n{chunk_text}"
            )

            messages = [{"role": "user", "content": map_prompt}]
            formatted_prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)  # type: ignore

            log_diagnostic(folder_path, f"Processing sentence refinement & summary for chunk {idx}/{total_chunks}...")
            response = mlx_lm.generate(model, tokenizer, prompt=formatted_prompt, max_tokens=2048, verbose=False,
                                       sampler=gen_sampler, logits_processors=gen_logits_processors)

            # Clear intermediate caches immediately
            try:
                mx.metal.clear_cache()
            except Exception:
                pass
            gc.collect()

            # Parse response for refined sentences and section summary
            clean_chunk_resp = response.strip()
            if "```json" in clean_chunk_resp:
                clean_chunk_resp = clean_chunk_resp.split("```json")[1].split("```")[0].strip()
            elif "```" in clean_chunk_resp:
                clean_chunk_resp = clean_chunk_resp.split("```")[1].split("```")[0].strip()

            parsed_chunk = {}
            try:
                parsed_chunk = json.loads(clean_chunk_resp)
            except Exception:
                salvaged = salvage_json(clean_chunk_resp)
                if isinstance(salvaged, dict):
                    parsed_chunk = salvaged
                    log_diagnostic(folder_path, f"[INFO] Chunk {idx} JSON was truncated/malformed; salvaged successfully.")
                else:
                    log_diagnostic(folder_path, f"[WARNING] Chunk {idx} JSON parse failed; keeping raw segments as fallback.")

            refined_sents = parsed_chunk.get("refined_sentences", [])
            if isinstance(refined_sents, list) and len(refined_sents) > 0:
                for r_seg in refined_sents:
                    if isinstance(r_seg, dict) and "text" in r_seg:
                        master_refined_segments.append({
                            "id": f"seg_{len(master_refined_segments)}",
                            "speaker": str(r_seg.get("speaker", "Speaker")).strip() or "Speaker",
                            "start": float(r_seg.get("start", 0.0)),
                            "end": float(r_seg.get("end", 0.0)),
                            "text": str(r_seg.get("text", "")).strip(),
                            "source": "ai_refined",
                            "words": []
                        })
            else:
                # Fallback: keep raw chunk segments if AI parsing failed for this chunk
                for r_seg in chunk:
                    master_refined_segments.append({
                        "id": f"seg_{len(master_refined_segments)}",
                        "speaker": r_seg.get("speaker", "Speaker"),
                        "start": float(r_seg.get("start", 0.0)),
                        "end": float(r_seg.get("end", 0.0)),
                        "text": str(r_seg.get("text", "")).strip(),
                        "source": r_seg.get("source", "raw"),
                        "words": []
                    })

            sec_summary = parsed_chunk.get("summary", "")
            if not sec_summary:
                sec_summary = response.strip()[:300]
            chunk_summaries.append(f"--- Section {idx} (Mins {int(chunk[0].get('start', 0)//60)}-{int(chunk[-1].get('end', 0)//60)}) ---\n{sec_summary}")

        # REDUCE STAGE: Synthesize all chunk summaries into master meeting notes
        if total_chunks > 1:
            emit_progress("summarizing", "Synthesizing master executive summary and action items...")
            combined = "\n\n".join(chunk_summaries)
            if len(combined) > 12000:
                combined = combined[:12000] + "... [truncated]"

            reduce_prompt = (
                "You are an expert executive assistant. Below are section-by-section summaries of a long meeting call.\n"
                "Synthesize them into a master meeting summary.\n"
                "You MUST format your entire response strictly as a JSON object matching this schema:\n"
                "{\n"
                "  \"title\": \"3-to-5 word title\",\n"
                "  \"notes\": {\n"
                "    \"executive_summary\": \"A brief 2-3 sentence overview of the entire call\",\n"
                "    \"detailed_summary\": [\n"
                "      {\"phase\": \"Beginning\", \"content\": \"...\"},\n"
                "      {\"phase\": \"Middle\", \"content\": \"...\"},\n"
                "      {\"phase\": \"Conclusion\", \"content\": \"...\"}\n"
                "    ]\n"
                "  },\n"
                "  \"action_items\": [\n"
                "    {\"text\": \"Action item description\", \"done\": false}\n"
                "  ]\n"
                "}"
            )

            reduce_messages = [{"role": "user", "content": f"{reduce_prompt}\n\nSection Summaries:\n{combined}"}]
            formatted_reduce_prompt = tokenizer.apply_chat_template(reduce_messages, tokenize=False, add_generation_prompt=True)  # type: ignore

            log_diagnostic(folder_path, "Running final synthesis pass across all section summaries...")
            final_response = mlx_lm.generate(model, tokenizer, prompt=formatted_reduce_prompt, max_tokens=1024, verbose=False,
                                             sampler=gen_sampler, logits_processors=gen_logits_processors)
        else:
            final_response = response

        # Clean up model references and clear cache immediately
        del model
        try:
            mx.metal.clear_cache()
        except Exception:
            pass
        gc.collect()

        log_diagnostic(folder_path, f"Raw final response from Gemma: {final_response}")

        clean_response = final_response.strip()
        if "```json" in clean_response:
            clean_response = clean_response.split("```json")[1].split("```")[0].strip()
        elif "```" in clean_response:
            clean_response = clean_response.split("```")[1].split("```")[0].strip()

        try:
            intelligence_data = json.loads(clean_response)
        except json.JSONDecodeError:
            log_diagnostic(folder_path, "[WARNING] Direct JSON parsing failed, attempting salvage...")
            salvaged = salvage_json(clean_response)
            if isinstance(salvaged, dict):
                intelligence_data = salvaged
                log_diagnostic(folder_path, "[INFO] Final response JSON was truncated/malformed; salvaged successfully.")
            else:
                intelligence_data = {
                    "title": "Meeting Summary",
                    "notes": {
                        "executive_summary": clean_response[:300],
                        "detailed_summary": [{"phase": "Full Call", "content": clean_response}]
                    },
                    "action_items": []
                }

        raw_title = intelligence_data.get("title", "")
        title = str(raw_title).strip() if raw_title else "Meeting Summary"
        if not title:
            title = "Meeting Summary"

        notes = intelligence_data.get("notes", "")
        if not notes:
            # Single-chunk path: intelligence_data is the MAP output, whose schema uses
            # "summary" (a string) rather than "notes". Synthesize a notes object so
            # summary.json isn't left empty on short meetings.
            summary_text = str(intelligence_data.get("summary", "")).strip()
            if summary_text:
                notes = {
                    "executive_summary": summary_text,
                    "detailed_summary": [{"phase": "Full Call", "content": summary_text}]
                }
        raw_items = intelligence_data.get("action_items", [])

        action_items = []
        for item in raw_items:
            if isinstance(item, dict) and "text" in item:
                action_items.append({
                    "text": item["text"],
                    "done": item.get("done", False)
                })
            elif isinstance(item, str):
                action_items.append({
                    "text": item,
                    "done": False
                })

        # Overwrite transcript.json with sentence-level AI refined segments!
        if master_refined_segments:
            out_path = os.path.join(folder_path, "transcript.json")
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump({"segments": master_refined_segments}, f, indent=2, ensure_ascii=False)
            log_diagnostic(folder_path, f"Saved AI-refined sentence-level transcript ({len(master_refined_segments)} segments) to transcript.json")

        metadata_path = os.path.join(folder_path, "metadata.json")
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump({
                "name": title,
                "display_name": title
            }, f, indent=2, ensure_ascii=False)

        summary_path = os.path.join(folder_path, "summary.json")
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump({
                "notes": notes,
                "action_items": action_items
            }, f, indent=2, ensure_ascii=False)

        log_diagnostic(folder_path, "Intelligence summary, notes, and refined transcript successfully saved")

    except Exception as e:
        log_diagnostic(folder_path, f"[ERROR] Intelligence generation failed: {e}")
        log_diagnostic(folder_path, traceback.format_exc())

def transcribe_audio_file_windowed(audio_path, model_name, folder_path):
    # Anti-hallucination kwargs applied to every Whisper pass (Part C1):
    #  - condition_on_previous_text=False stops silence repeat-loops (junk fed back as context)
    #  - hallucination_silence_threshold=2.0 skips detected silent stretches (needs word_timestamps)
    transcribe_kwargs = dict(
        path_or_hf_repo=model_name,
        word_timestamps=True,
        condition_on_previous_text=False,
        hallucination_silence_threshold=2.0,
    )

    # Decode once via mlx_whisper's ffmpeg-backed loader. This works even where torchaudio's
    # native backend is unavailable, gives an accurate duration for headerless streaming WebM
    # (whose container reports no duration), and lets us slice long calls in-memory.
    try:
        audio = mlx_whisper.audio.load_audio(audio_path)
    except Exception as load_err:
        log_diagnostic(folder_path, f"[WARNING] Could not decode {os.path.basename(audio_path)} for duration check ({load_err}); transcribing whole file.")
        return mlx_whisper.transcribe(audio_path, **transcribe_kwargs)

    sr = mlx_whisper.audio.SAMPLE_RATE  # 16000
    duration = len(audio) / sr

    if duration > 1800.0:  # > 30 minutes call
        log_diagnostic(folder_path, f"Audio {os.path.basename(audio_path)} ({duration:.1f}s) > 30 mins. Running 15-minute windowed Whisper transcription...")
        window_samples = int(900.0 * sr)  # 15 minutes per slice
        all_window_segments = []
        win_index = 0

        for start in range(0, len(audio), window_samples):
            chunk = audio[start:start + window_samples]
            offset_sec = start / sr

            log_diagnostic(folder_path, f"Transcribing Whisper window {win_index + 1} ({offset_sec/60:.1f}m - {(offset_sec + len(chunk)/sr)/60:.1f}m)...")
            try:
                res = mlx_whisper.transcribe(chunk, **transcribe_kwargs)
                for seg in res.get("segments", []):
                    seg["start"] = float(seg.get("start", 0.0)) + offset_sec
                    seg["end"] = float(seg.get("end", 0.0)) + offset_sec
                    all_window_segments.append(seg)
            except Exception as win_err:
                log_diagnostic(folder_path, f"[WARNING] Whisper window {win_index} failed: {win_err}")
            finally:
                try:
                    mx.metal.clear_cache()
                except Exception:
                    pass
                gc.collect()

            win_index += 1

        return {"segments": all_window_segments}
    else:
        # Pass the already-decoded array to avoid a second ffmpeg decode.
        return mlx_whisper.transcribe(audio, **transcribe_kwargs)

def main(folder_path, user_name="Me"):
    try:
        import setproctitle  # type: ignore
        setproctitle.setproctitle("cognito-assistant")
    except Exception:
        pass

    psutil.cpu_percent(interval=None)
    psutil.Process(os.getpid()).cpu_percent(interval=None)
    
    init_diagnostic_log(folder_path)
    log_diagnostic(folder_path, f"Starting MLX transcription process pipeline for user '{user_name}'...")

    # Preflight: ffmpeg is mandatory — both mlx-whisper and simple-diarizer shell out to it to
    # decode audio. If it is not on PATH, fail loudly with a non-zero exit so the desktop app
    # marks the session failed (writes failed.txt) instead of silently re-running it in a loop.
    _ffmpeg = shutil.which("ffmpeg")
    if _ffmpeg is None:
        log_diagnostic(folder_path, "[FATAL] ffmpeg not found on PATH. Cannot decode audio — aborting. "
                                    "Reinstall Cognito Call or install ffmpeg (e.g. 'brew install ffmpeg').")
        emit_progress("error", "ffmpeg not found — cannot process audio. Please reinstall or install ffmpeg.")
        sys.exit(1)
    log_diagnostic(folder_path, f"ffmpeg located at: {_ffmpeg}")

    # Establish baseline with garbage collection first
    gc.collect()
    log_resources(folder_path, "Baseline")
    
    # MLX Quantized Whisper Model
    model_name = "mlx-community/whisper-base-mlx-q4"
    
    mic_path = os.path.join(folder_path, "mic.opus")
    if not os.path.exists(mic_path):
        mic_path = os.path.join(folder_path, "mic.webm")
        
    tab_path = os.path.join(folder_path, "tab.opus")
    if not os.path.exists(tab_path):
        tab_path = os.path.join(folder_path, "tab.webm")
        
    out_path = os.path.join(folder_path, "transcript.json")
    
    log_file_metrics(folder_path, mic_path, tab_path)
    
    total_start = time.perf_counter()
    mic_transcribe_time = 0.0
    tab_transcribe_time = 0.0
    diarize_time = 0.0
    merge_time = 0.0
    
    all_segments = []
    tab_segments = []
    
    try:
        # ==========================================
        # PHASE 1: mic.opus (Local User)
        # ==========================================
        if os.path.exists(mic_path):
            t_start = time.perf_counter()
            try:
                emit_progress("mic_transcribing", "Transcribing your microphone audio with MLX-Whisper...")
                log_diagnostic(folder_path, f"Running mlx-whisper on {os.path.basename(mic_path)} using {model_name}")
                result_mic = transcribe_audio_file_windowed(mic_path, model_name, folder_path)
                
                for segment in result_mic.get("segments", []):
                    segment["speaker"] = user_name  # type: ignore
                    segment["source"] = "mic"  # type: ignore
                    all_segments.append(segment)
                
                mic_transcribe_time = time.perf_counter() - t_start
                log_diagnostic(folder_path, f"[TIMER] Transcribing mic audio took: {mic_transcribe_time:.2f} seconds")
            except Exception as e:
                mic_transcribe_time = time.perf_counter() - t_start
                log_diagnostic(folder_path, f"[ERROR] Failed during mic audio transcription: {e}")
                log_diagnostic(folder_path, traceback.format_exc())
        else:
            log_diagnostic(folder_path, "Mic audio file not found, skipping mic transcription.")
            
        # Clean up MLX memory cache immediately after mic transcription
        try:
            mx.metal.clear_cache()
        except Exception:
            pass
        gc.collect()
            
        # Check for Google Meet captions.json fast-path
        captions_path = os.path.join(folder_path, "captions.json")
        has_valid_captions = False
        if os.path.exists(captions_path):
            try:
                log_diagnostic(folder_path, "Found Google Meet captions.json! Checking captions data...")
                with open(captions_path, "r", encoding="utf-8") as f:
                    cap_data = json.load(f)

                cap_segments = cap_data.get("segments", [])
                if cap_segments:
                    emit_progress("captions_processing", "Loaded Google Meet live captions. Bypassing heavy Whisper tab processing...")
                    for idx, c_seg in enumerate(cap_segments):
                        all_segments.append({
                            "id": f"seg_cap_{idx}",
                            "speaker": c_seg.get("speaker", "Speaker"),
                            "start": float(c_seg.get("start", 0.0)),
                            "end": float(c_seg.get("end", 0.0)),
                            "text": str(c_seg.get("text", "")).strip(),
                            "source": "captions",
                            "words": []
                        })
                    has_valid_captions = True
                    log_diagnostic(folder_path, f"[FAST PATH] Loaded {len(cap_segments)} caption segments from Google Meet.")
            except Exception as cap_err:
                log_diagnostic(folder_path, f"[WARNING] Failed to parse captions.json: {cap_err}. Falling back to standard Whisper pipeline.")

        # ==========================================
        # PHASE 2: tab.opus (Remote Participants)
        # ==========================================
        if not has_valid_captions and os.path.exists(tab_path):
            t_start = time.perf_counter()
            try:
                emit_progress("tab_transcribing", "Transcribing remote participants with MLX-Whisper...")
                log_diagnostic(folder_path, f"Running mlx-whisper on {os.path.basename(tab_path)} using {model_name}")
                result_tab = transcribe_audio_file_windowed(tab_path, model_name, folder_path)
                
                tab_segments = result_tab.get("segments", [])
                tab_transcribe_time = time.perf_counter() - t_start
                log_diagnostic(folder_path, f"[TIMER] Transcribing tab audio took: {tab_transcribe_time:.2f} seconds")
            except Exception as e:
                tab_transcribe_time = time.perf_counter() - t_start
                log_diagnostic(folder_path, f"[ERROR] Failed during tab audio transcription: {e}")
                log_diagnostic(folder_path, traceback.format_exc())
        elif has_valid_captions:
            log_diagnostic(folder_path, "Using Google Meet captions; skipping tab audio transcription.")
        else:
            log_diagnostic(folder_path, "Tab audio file not found, skipping tab transcription.")
            
        # Clean up MLX memory cache immediately after tab transcription
        try:
            mx.metal.clear_cache()
        except Exception:
            pass
        gc.collect()
            
        # Log resources immediately after transcription phase
        log_resources(folder_path, "Peak usage (after transcription)")
        
        # ==========================================
        # PHASE 3: simple-diarizer on tab audio (Tuned & Windowed Diarization)
        # ==========================================
        diar_segments = []
        if not has_valid_captions and os.path.exists(tab_path):
            t_start = time.perf_counter()
            diar = None
            try:
                emit_progress("tab_diarizing", "Running tuned diarization on remote audio...")
                # SPEECHBRAIN_CACHE env var (set at top of file) redirects model downloads to ~/.cognitocall/pretrained_models
                diar = Diarizer(embed_model='xvec', cluster_method='sc')
                
                # Check audio duration for long call windowing strategy.
                # Decode via mlx_whisper's ffmpeg loader (torchaudio-free; also works on
                # headerless streaming WebM whose container reports no duration).
                tab_audio = None
                try:
                    tab_audio = mlx_whisper.audio.load_audio(tab_path)
                except Exception as info_err:
                    log_diagnostic(folder_path, f"[WARNING] Could not decode tab audio for duration check ({info_err}); diarizing whole file.")

                sr = mlx_whisper.audio.SAMPLE_RATE  # 16000
                tab_duration = (len(tab_audio) / sr) if tab_audio is not None else 0.0

                if tab_audio is not None and tab_duration > 1800.0:  # > 30 minutes call
                    log_diagnostic(folder_path, f"Audio duration ({tab_duration:.1f}s) > 30 mins; running windowed diarization...")
                    window_samples = int(900.0 * sr)  # 15 minutes per slice
                    win_index = 0

                    for start in range(0, len(tab_audio), window_samples):
                        chunk = tab_audio[start:start + window_samples]
                        offset_sec = start / sr

                        log_diagnostic(folder_path, f"Diarizing window {win_index + 1} ({offset_sec/60:.1f}m - {(offset_sec + len(chunk)/sr)/60:.1f}m)...")
                        tmp_wav_path = os.path.join(folder_path, f"_temp_diar_{win_index}.wav")
                        # 16kHz mono PCM WAV — universally readable, no ffmpeg needed to read back.
                        soundfile.write(tmp_wav_path, chunk, sr, subtype="PCM_16")

                        try:
                            sub_diar = diar.diarize(tmp_wav_path, num_speakers=None, threshold=0.20)
                            for ds in sub_diar:
                                if isinstance(ds, dict):
                                    ds['start'] = float(ds.get('start', 0.0)) + offset_sec
                                    ds['end'] = float(ds.get('end', 0.0)) + offset_sec
                                    diar_segments.append(ds)
                        except Exception as win_err:
                            log_diagnostic(folder_path, f"[WARNING] Diarization failed for window {win_index}: {win_err}")
                        finally:
                            if os.path.exists(tmp_wav_path):
                                try:
                                    os.remove(tmp_wav_path)
                                except Exception:
                                    pass

                        win_index += 1
                else:
                    diar_segments = diar.diarize(tab_path, num_speakers=None, threshold=0.20)

                diarize_time = time.perf_counter() - t_start
                log_diagnostic(folder_path, f"[TIMER] Tuned diarization of tab audio took: {diarize_time:.2f} seconds")
            except AssertionError as e:
                diarize_time = time.perf_counter() - t_start
                log_diagnostic(folder_path, f"[WARNING] Diarization assertion (usually silence or lack of speech): {e}")
                log_diagnostic(folder_path, traceback.format_exc())
            except Exception as e:
                diarize_time = time.perf_counter() - t_start
                log_diagnostic(folder_path, f"[ERROR] Diarization failed: {e}")
                log_diagnostic(folder_path, traceback.format_exc())
            finally:
                # Explicitly delete the diarizer object and empty PyTorch MPS cache to free Unified Memory
                try:
                    if diar is not None:
                        del diar
                except Exception:
                    pass
                try:
                    if torch.backends.mps.is_available():
                        torch.mps.empty_cache()
                except Exception as d_err:
                    log_diagnostic(folder_path, f"[WARNING] Torch MPS cache clear error: {d_err}")
                gc.collect()
                
            # Stitch remote speakers to words
            if tab_segments:
                t_stitch_start = time.perf_counter()
                try:
                    emit_progress("tab_stitching", "Stitching remote speakers to words...")
                    for segment in tab_segments:
                        segment["source"] = "tab"  # type: ignore
                        segment_speaker = "Unknown"
                        
                        for word_obj in segment.get("words", []):  # type: ignore
                            word_start = word_obj.get("start")
                            word_end = word_obj.get("end")
                            
                            if word_start is None or word_end is None:
                                continue
                            
                            word_mid = (word_start + word_end) / 2.0
                            assigned_label = "Speaker ?"
                            for ds in diar_segments:
                                if ds['start'] <= word_mid <= ds['end']:  # type: ignore
                                    assigned_label = f"Speaker {ds['label']}"  # type: ignore
                                    break
                                    
                            word_obj['speaker'] = assigned_label  # type: ignore
                            if segment_speaker == "Unknown" or segment_speaker == "Speaker ?":
                                segment_speaker = assigned_label
                                
                        segment["speaker"] = segment_speaker  # type: ignore
                        all_segments.append(segment)
                    log_diagnostic(folder_path, f"[TIMER] Stitching remote speakers took: {time.perf_counter() - t_stitch_start:.2f} seconds")
                except Exception as e:
                    log_diagnostic(folder_path, f"[ERROR] Failed to stitch remote speakers: {e}")
                    log_diagnostic(folder_path, traceback.format_exc())
                    
        # ==========================================
        # PHASE 4: MERGE & SORT (JSON WRITE)
        # ==========================================
        t_start = time.perf_counter()
        emit_progress("merging", "Merging and sorting transcripts chronologically...")
        all_segments.sort(key=lambda x: x.get("start", 0))
        
        final_segments = []
        seg_counter = 0
        dropped_hallucinations = 0
        for seg in all_segments:
            text_val = seg.get("text", "").strip()
            if not text_val:
                continue
            # Drop Whisper silence-hallucination junk (repeat-loops / no-speech) before it
            # reaches transcript.json and the LLM. Restricted to Whisper sources so that
            # captions/other sources always pass through.
            if seg.get("source") in ("mic", "tab") and is_hallucinated_segment(seg):
                dropped_hallucinations += 1
                continue
            final_seg = {
                "id": f"seg_{seg_counter}",
                "speaker": seg.get("speaker", "Unknown"),
                "start": seg.get("start", 0),
                "end": seg.get("end", 0),
                "text": text_val,
                "source": seg.get("source", "unknown"),
                "words": []
            }
            for w in seg.get("words", []):
                if "start" in w and "end" in w:
                    final_seg["words"].append({
                        "word": w["word"],
                        "start": w["start"],
                        "end": w["end"]
                    })
            final_segments.append(final_seg)
            seg_counter += 1
            
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump({"segments": final_segments}, f, indent=2, ensure_ascii=False)
            
        if dropped_hallucinations:
            log_diagnostic(folder_path, f"Dropped {dropped_hallucinations} hallucinated/no-speech segment(s) before intelligence generation.")

        merge_time = time.perf_counter() - t_start
        log_diagnostic(folder_path, f"[TIMER] Merging, sorting and saving JSON took: {merge_time:.2f} seconds")
        
        emit_progress("transcription_complete", "Audio transcription complete. Loading local LLM...")
        gc.collect()

        # If transcription produced nothing at all, treat it as a hard failure (non-zero exit)
        # so the desktop app writes failed.txt and stops auto-re-running the session forever.
        if not final_segments:
            log_diagnostic(folder_path, "[FATAL] No transcript segments were produced — transcription failed. Aborting with error status.")
            emit_progress("error", "Transcription produced no output (check the recording and ffmpeg).")
            sys.exit(1)

        # Run map-reduce intelligence generation
        generate_intelligence(final_segments, folder_path, user_name=user_name)
        
    except Exception as e:
        log_diagnostic(folder_path, f"[CRITICAL ERROR] Pipeline crashed: {e}")
        log_diagnostic(folder_path, traceback.format_exc())
        
        # Fallback to write whatever segments we managed to extract
        if all_segments:
            try:
                log_diagnostic(folder_path, "[FALLBACK] Attempting to write partial transcript to json...")
                all_segments.sort(key=lambda x: x.get("start", 0))
                final_segments = []
                seg_counter = 0
                for seg in all_segments:
                    text_val = seg.get("text", "").strip()
                    if not text_val:
                        continue
                    final_seg = {
                        "id": f"seg_{seg_counter}",
                        "speaker": seg.get("speaker", "Unknown"),
                        "start": seg.get("start", 0),
                        "end": seg.get("end", 0),
                        "text": text_val,
                        "source": seg.get("source", "unknown"),
                        "words": []
                    }
                    for w in seg.get("words", []):
                        if "start" in w and "end" in w:
                            final_seg["words"].append({
                                "word": w["word"],
                                "start": w["start"],
                                "end": w["end"]
                            })
                    final_segments.append(final_seg)
                    seg_counter += 1
                with open(out_path, "w", encoding="utf-8") as f:
                    json.dump({"segments": final_segments}, f, indent=2, ensure_ascii=False)
                log_diagnostic(folder_path, "[FALLBACK] Partial transcript written successfully.")
            except Exception as fe:
                log_diagnostic(folder_path, f"[FALLBACK ERROR] Failed to write fallback JSON: {fe}")
                log_diagnostic(folder_path, traceback.format_exc())
                
        emit_progress("error", f"Pipeline crashed: {e}")
        
    finally:
        # Final cleanup before exit
        try:
            if torch.backends.mps.is_available():
                torch.mps.empty_cache()
        except Exception:
            pass
        try:
            mx.clear_cache()
        except Exception:
            pass
        gc.collect()
        log_resources(folder_path, "Post-cleanup")
        
        total_time = time.perf_counter() - total_start
        log_diagnostic(folder_path, f"[SUMMARY] Total Processing Time: {total_time:.2f} seconds")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", help="Path to workspace folder")
    parser.add_argument("--user-name", default="Me", help="Display name of the primary user")
    args = parser.parse_args()
    main(args.folder, user_name=args.user_name)
