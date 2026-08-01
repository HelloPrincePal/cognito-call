import argparse
import json
import os
import sys
import time
import gc
import psutil  # type: ignore
import traceback
from datetime import datetime

import torch
import mlx.core as mx
import mlx_whisper

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

def generate_intelligence(final_segments, folder_path, user_name="Me"):
    try:
        import mlx_lm
    except ImportError:
        log_diagnostic(folder_path, "[ERROR] mlx-lm library not installed. Skipping intelligence generation.")
        return

    if not final_segments:
        log_diagnostic(folder_path, "[WARNING] No transcript segments available for intelligence generation.")
        return

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
            response = mlx_lm.generate(model, tokenizer, prompt=formatted_prompt, max_tokens=384, temp=0.1, verbose=False)

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
            final_response = mlx_lm.generate(model, tokenizer, prompt=formatted_reduce_prompt, max_tokens=400, temp=0.1, verbose=False)
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
            log_diagnostic(folder_path, "[WARNING] Direct JSON parsing failed, attempting fallback cleanup...")
            clean_response_fixed = clean_response.replace(',\n}', '\n}').replace(',\n  }', '\n  }')
            try:
                intelligence_data = json.loads(clean_response_fixed)
            except Exception:
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
    duration = 0.0
    info = None
    try:
        import torchaudio
        info = torchaudio.info(audio_path)
        duration = info.num_frames / info.sample_rate
    except Exception as info_err:
        log_diagnostic(folder_path, f"[WARNING] Could not read audio duration for {os.path.basename(audio_path)}: {info_err}")

    if info is not None and duration > 1800.0:  # > 30 minutes call
        log_diagnostic(folder_path, f"Audio {os.path.basename(audio_path)} ({duration:.1f}s) > 30 mins. Running 15-minute windowed Whisper transcription...")
        import torchaudio
        window_sec = 900.0  # 15 minutes per slice
        sample_rate = info.sample_rate
        total_frames = info.num_frames
        window_frames = int(window_sec * sample_rate)

        frame_offset = 0
        win_index = 0
        all_window_segments = []

        while frame_offset < total_frames:
            frames_to_read = min(window_frames, total_frames - frame_offset)
            offset_sec = frame_offset / sample_rate

            log_diagnostic(folder_path, f"Transcribing Whisper window {win_index + 1} ({offset_sec/60:.1f}m - {(offset_sec + frames_to_read/sample_rate)/60:.1f}m)...")
            sig_chunk, sr = torchaudio.load(audio_path, frame_offset=frame_offset, num_frames=frames_to_read)
            tmp_wav = os.path.join(folder_path, f"_temp_whisper_{os.path.basename(audio_path)}_{win_index}.wav")
            torchaudio.save(tmp_wav, sig_chunk, sr)

            try:
                res = mlx_whisper.transcribe(tmp_wav, path_or_hf_repo=model_name, word_timestamps=True)
                for seg in res.get("segments", []):
                    seg["start"] = float(seg.get("start", 0.0)) + offset_sec
                    seg["end"] = float(seg.get("end", 0.0)) + offset_sec
                    all_window_segments.append(seg)
            except Exception as win_err:
                log_diagnostic(folder_path, f"[WARNING] Whisper window {win_index} failed: {win_err}")
            finally:
                if os.path.exists(tmp_wav):
                    try:
                        os.remove(tmp_wav)
                    except Exception:
                        pass
                try:
                    mx.metal.clear_cache()
                except Exception:
                    pass
                gc.collect()

            frame_offset += window_frames
            win_index += 1

        return {"segments": all_window_segments}
    else:
        return mlx_whisper.transcribe(audio_path, path_or_hf_repo=model_name, word_timestamps=True)

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
                diar = Diarizer(embed_model='xvec', cluster_method='sc')
                
                # Check audio duration for long call windowing strategy
                tab_duration = 0.0
                info = None
                try:
                    import torchaudio
                    info = torchaudio.info(tab_path)
                    tab_duration = info.num_frames / info.sample_rate
                except Exception as info_err:
                    log_diagnostic(folder_path, f"[WARNING] Could not check tab audio duration: {info_err}")

                if info is not None and tab_duration > 1800.0:  # > 30 minutes call
                    log_diagnostic(folder_path, f"Audio duration ({tab_duration:.1f}s) > 30 mins; running windowed diarization...")
                    import torchaudio
                    window_sec = 900.0  # 15 minutes per slice
                    sample_rate = info.sample_rate
                    total_frames = info.num_frames
                    window_frames = int(window_sec * sample_rate)
                    
                    frame_offset = 0
                    win_index = 0
                    while frame_offset < total_frames:
                        frames_to_read = min(window_frames, total_frames - frame_offset)
                        offset_sec = frame_offset / sample_rate
                        
                        log_diagnostic(folder_path, f"Diarizing window {win_index + 1} ({offset_sec/60:.1f}m - {(offset_sec + frames_to_read/sample_rate)/60:.1f}m)...")
                        sig_chunk, sr = torchaudio.load(tab_path, frame_offset=frame_offset, num_frames=frames_to_read)
                        tmp_wav_path = os.path.join(folder_path, f"_temp_diar_{win_index}.wav")
                        torchaudio.save(tmp_wav_path, sig_chunk, sr)
                        
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
                        
                        frame_offset += window_frames
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
            
        merge_time = time.perf_counter() - t_start
        log_diagnostic(folder_path, f"[TIMER] Merging, sorting and saving JSON took: {merge_time:.2f} seconds")
        
        emit_progress("transcription_complete", "Audio transcription complete. Loading local LLM...")
        gc.collect()
        
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
