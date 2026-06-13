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

def generate_intelligence(transcript_text, folder_path):
    try:
        import mlx_lm
    except ImportError:
        log_diagnostic(folder_path, "[ERROR] mlx-lm library not installed. Skipping intelligence generation.")
        return

    model_id = "mlx-community/gemma-2-2b-it-4bit"
    emit_progress("summarizing", "Generating meeting summary and action items with Gemma...")
    log_diagnostic(folder_path, f"Loading LLM {model_id} for intelligence generation...")
    
    try:
        model, tokenizer = mlx_lm.load(model_id)
        
        system_prompt = (
            "You are an executive assistant. Read the following meeting transcript. Provide a 1-paragraph summary of the meeting. "
            "Then, provide a bulleted list of any action items or tasks promised during the meeting. "
            "Format your output strictly as a JSON object with keys 'notes' (string) and 'action_items' (array of strings)."
        )
        
        messages = [
            {"role": "user", "content": f"{system_prompt}\n\nHere is the transcript:\n{transcript_text}"}
        ]
        formatted_prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        
        log_diagnostic(folder_path, "Generating intelligence summary from transcript...")
        response = mlx_lm.generate(model, tokenizer, prompt=formatted_prompt, max_tokens=1024, verbose=False)
        
        # Clean up model references and clear cache immediately
        del model
        try:
            mx.metal.clear_cache()
        except Exception:
            pass
        try:
            mx.clear_cache()
        except Exception:
            pass
        gc.collect()
        
        log_diagnostic(folder_path, f"Raw response from Gemma: {response}")
        
        # Parse JSON from response
        clean_response = response.strip()
        if "```json" in clean_response:
            clean_response = clean_response.split("```json")[1].split("```")[0].strip()
        elif "```" in clean_response:
            clean_response = clean_response.split("```")[1].split("```")[0].strip()
            
        try:
            intelligence_data = json.loads(clean_response)
        except json.JSONDecodeError:
            log_diagnostic(folder_path, "[WARNING] JSON decoding failed, trying custom cleanup...")
            # Try to handle trailing commas in lists
            clean_response_fixed = clean_response.replace(',\n}', '\n}').replace(',\n  }', '\n  }')
            intelligence_data = json.loads(clean_response_fixed)
        
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
                
        summary_path = os.path.join(folder_path, "summary.json")
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump({
                "notes": notes,
                "action_items": action_items
            }, f, indent=2, ensure_ascii=False)
            
        log_diagnostic(folder_path, "Intelligence summary successfully saved to summary.json")
        
    except Exception as e:
        log_diagnostic(folder_path, f"[ERROR] Intelligence generation failed: {e}")
        log_diagnostic(folder_path, traceback.format_exc())

def main(folder_path):
    psutil.cpu_percent(interval=None)
    psutil.Process(os.getpid()).cpu_percent(interval=None)
    
    init_diagnostic_log(folder_path)
    log_diagnostic(folder_path, "Starting MLX transcription process pipeline...")
    
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
        # PHASE 1: mic.opus (Local User - Hardcoded "Me")
        # ==========================================
        if os.path.exists(mic_path):
            t_start = time.perf_counter()
            try:
                emit_progress("mic_transcribing", "Transcribing your microphone audio with MLX-Whisper...")
                log_diagnostic(folder_path, f"Running mlx-whisper on {os.path.basename(mic_path)} using {model_name}")
                result_mic = mlx_whisper.transcribe(mic_path, path_or_hf_repo=model_name, word_timestamps=True)
                
                for segment in result_mic.get("segments", []):
                    segment["speaker"] = "Me"  # type: ignore
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
        mx.clear_cache()
        gc.collect()
            
        # ==========================================
        # PHASE 2: tab.opus (Remote Participants)
        # ==========================================
        if os.path.exists(tab_path):
            t_start = time.perf_counter()
            try:
                emit_progress("tab_transcribing", "Transcribing remote participants with MLX-Whisper...")
                log_diagnostic(folder_path, f"Running mlx-whisper on {os.path.basename(tab_path)} using {model_name}")
                result_tab = mlx_whisper.transcribe(tab_path, path_or_hf_repo=model_name, word_timestamps=True)
                
                tab_segments = result_tab.get("segments", [])
                tab_transcribe_time = time.perf_counter() - t_start
                log_diagnostic(folder_path, f"[TIMER] Transcribing tab audio took: {tab_transcribe_time:.2f} seconds")
            except Exception as e:
                tab_transcribe_time = time.perf_counter() - t_start
                log_diagnostic(folder_path, f"[ERROR] Failed during tab audio transcription: {e}")
                log_diagnostic(folder_path, traceback.format_exc())
        else:
            log_diagnostic(folder_path, "Tab audio file not found, skipping tab transcription.")
            
        # Clean up MLX memory cache immediately after tab transcription
        try:
            mx.metal.clear_cache()
        except Exception:
            pass
        mx.clear_cache()
        gc.collect()
            
        # Log resources immediately after transcription phase
        log_resources(folder_path, "Peak usage (after transcription)")
        
        # ==========================================
        # PHASE 3: simple-diarizer on tab audio (Tuned Parameters)
        # ==========================================
        diar_segments = []
        if os.path.exists(tab_path):
            t_start = time.perf_counter()
            diar = None
            try:
                emit_progress("tab_diarizing", "Running tuned diarization on remote audio...")
                # Initialize diarizer
                diar = Diarizer(embed_model='xvec', cluster_method='sc')
                # Run diarization:
                # - num_speakers=None (do not hardcode speaker limits)
                # - threshold=0.20 (conservative threshold to reduce speaker hallucinations)
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
        
        emit_progress("complete", "Transcription complete.")
        gc.collect()
        
        # Compile full transcript text for Gemma
        transcript_text = "\n".join([f"{seg['speaker']}: {seg['text']}" for seg in final_segments])
        generate_intelligence(transcript_text, folder_path)
        
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
    args = parser.parse_args()
    main(args.folder)
