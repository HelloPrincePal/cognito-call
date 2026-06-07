import argparse
import json
import os
import sys
import torch
import time
import psutil  # type: ignore
import traceback
from datetime import datetime

# Fix for PyTorch 2.6+ security changes when loading Pyannote VAD model inside WhisperX
original_load = torch.load
def safe_load(*args, **kwargs):
    kwargs['weights_only'] = False
    return original_load(*args, **kwargs)
torch.load = safe_load

import whisperx
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
    # Make sure parent directories exist
    os.makedirs(folder_path, exist_ok=True)
    log_path = os.path.join(folder_path, "diagnostic.log")
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    separator = (
        f"\n"
        f"================================================================================\n"
        f"DIAGNOSTIC LOG RUN AT: {now_str}\n"
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
        # System-wide metrics
        system_cpu = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        system_ram_used = mem.used / (1024 ** 3)
        system_ram_total = mem.total / (1024 ** 3)
        
        # Process-specific metrics
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

def main(folder_path):
    # Initialize CPU checks so next calls return correct delta
    psutil.cpu_percent(interval=None)
    psutil.Process(os.getpid()).cpu_percent(interval=None)
    
    init_diagnostic_log(folder_path)
    log_diagnostic(folder_path, "Starting transcription process pipeline...")
    log_resources(folder_path, "Baseline")
    
    device = "cpu" # Defaulting to CPU for Mac compatibility
    compute_type = "int8"
    
    # Support both .opus and .webm extensions depending on what the packager produced
    mic_path = os.path.join(folder_path, "mic.opus")
    if not os.path.exists(mic_path):
        mic_path = os.path.join(folder_path, "mic.webm")
        
    tab_path = os.path.join(folder_path, "tab.opus")
    if not os.path.exists(tab_path):
        tab_path = os.path.join(folder_path, "tab.webm")
        
    out_path = os.path.join(folder_path, "transcript.json")
    
    log_file_metrics(folder_path, mic_path, tab_path)
    
    total_start = time.perf_counter()
    load_model_time = 0.0
    mic_transcribe_time = 0.0
    tab_transcribe_time = 0.0
    diarize_time = 0.0
    merge_time = 0.0
    
    all_segments = []
    model = None
    tab_segments = []
    
    try:
        # ==========================================
        # PHASE 1: Load Whisper Model
        # ==========================================
        t_start = time.perf_counter()
        try:
            emit_progress("loading", "Loading WhisperX base model...")
            model = whisperx.load_model("base", device, compute_type=compute_type)
            load_model_time = time.perf_counter() - t_start
            log_diagnostic(folder_path, f"[TIMER] Loading Whisper model took: {load_model_time:.2f} seconds")
        except Exception as e:
            load_model_time = time.perf_counter() - t_start
            log_diagnostic(folder_path, f"[ERROR] Failed to load Whisper model: {e}")
            log_diagnostic(folder_path, traceback.format_exc())
            # Re-raise to crash outer try if we can't even load the model
            raise
            
        # ==========================================
        # PHASE 2: mic.opus (Local User)
        # ==========================================
        if os.path.exists(mic_path):
            t_start = time.perf_counter()
            try:
                emit_progress("mic_transcribing", "Transcribing your microphone audio...")
                audio_mic = whisperx.load_audio(mic_path)
                result_mic = model.transcribe(audio_mic, batch_size=16)
                
                emit_progress("mic_aligning", "Aligning word timestamps for microphone...")
                model_a_mic, metadata_mic = whisperx.load_align_model(language_code=result_mic["language"], device=device)
                result_aligned_mic = whisperx.align(result_mic["segments"], model_a_mic, metadata_mic, audio_mic, device, return_char_alignments=False)
                
                for segment in result_aligned_mic["segments"]:
                    segment["speaker"] = "Me"
                    segment["source"] = "mic"
                    all_segments.append(segment)
                
                mic_transcribe_time = time.perf_counter() - t_start
                log_diagnostic(folder_path, f"[TIMER] Transcribing mic audio took: {mic_transcribe_time:.2f} seconds")
            except Exception as e:
                mic_transcribe_time = time.perf_counter() - t_start
                log_diagnostic(folder_path, f"[ERROR] Failed during mic audio transcription/alignment: {e}")
                log_diagnostic(folder_path, traceback.format_exc())
        else:
            log_diagnostic(folder_path, "Mic audio file not found, skipping mic transcription.")
            
        # ==========================================
        # PHASE 3: tab.opus (Remote Participants)
        # ==========================================
        if os.path.exists(tab_path):
            t_start = time.perf_counter()
            try:
                emit_progress("tab_transcribing", "Transcribing remote participants...")
                audio_tab = whisperx.load_audio(tab_path)
                result_tab = model.transcribe(audio_tab, batch_size=16)
                
                emit_progress("tab_aligning", "Aligning word timestamps for remote participants...")
                model_a_tab, metadata_tab = whisperx.load_align_model(language_code=result_tab["language"], device=device)
                result_aligned_tab = whisperx.align(result_tab["segments"], model_a_tab, metadata_tab, audio_tab, device, return_char_alignments=False)
                
                tab_segments = result_aligned_tab["segments"]
                tab_transcribe_time = time.perf_counter() - t_start
                log_diagnostic(folder_path, f"[TIMER] Transcribing tab audio took: {tab_transcribe_time:.2f} seconds")
            except Exception as e:
                tab_transcribe_time = time.perf_counter() - t_start
                log_diagnostic(folder_path, f"[ERROR] Failed during tab audio transcription/alignment: {e}")
                log_diagnostic(folder_path, traceback.format_exc())
        else:
            log_diagnostic(folder_path, "Tab audio file not found, skipping tab transcription.")
            
        # LOG PEAK USAGE IMMEDIATELY AFTER TAB TRANSCRIPTION PHASE
        log_resources(folder_path, "Peak usage (after tab transcription)")
        
        # ==========================================
        # PHASE 4: simple-diarizer on tab audio
        # ==========================================
        diar_segments = []
        if os.path.exists(tab_path):
            t_start = time.perf_counter()
            try:
                emit_progress("tab_diarizing", "Running token-free diarization on remote audio...")
                diar = Diarizer(embed_model='xvec', cluster_method='sc')
                diar_segments = diar.diarize(tab_path)
                diarize_time = time.perf_counter() - t_start
                log_diagnostic(folder_path, f"[TIMER] Diarization of tab audio took: {diarize_time:.2f} seconds")
            except AssertionError as e:
                diarize_time = time.perf_counter() - t_start
                log_diagnostic(folder_path, f"[WARNING] Diarization assertion (usually silence or lack of speech): {e}")
                log_diagnostic(folder_path, traceback.format_exc())
            except Exception as e:
                diarize_time = time.perf_counter() - t_start
                log_diagnostic(folder_path, f"[ERROR] Diarization failed: {e}")
                log_diagnostic(folder_path, traceback.format_exc())
                
            # Stitch remote speakers to words
            if tab_segments:
                t_stitch_start = time.perf_counter()
                try:
                    emit_progress("tab_stitching", "Stitching remote speakers to words...")
                    for segment in tab_segments:
                        segment["source"] = "tab"
                        segment_speaker = "Unknown"
                        
                        for word_obj in segment.get("words", []):
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
                                    
                            word_obj['speaker'] = assigned_label
                            if segment_speaker == "Unknown" or segment_speaker == "Speaker ?":
                                segment_speaker = assigned_label
                                
                        segment["speaker"] = segment_speaker
                        all_segments.append(segment)
                    log_diagnostic(folder_path, f"[TIMER] Stitching remote speakers took: {time.perf_counter() - t_stitch_start:.2f} seconds")
                except Exception as e:
                    log_diagnostic(folder_path, f"[ERROR] Failed to stitch remote speakers: {e}")
                    log_diagnostic(folder_path, traceback.format_exc())
                    
        # ==========================================
        # PHASE 5: MERGE & SORT (JSON WRITE)
        # ==========================================
        t_start = time.perf_counter()
        emit_progress("merging", "Merging and sorting transcripts chronologically...")
        all_segments.sort(key=lambda x: x.get("start", 0))
        
        final_segments = []
        for i, seg in enumerate(all_segments):
            final_seg = {
                "id": f"seg_{i}",
                "speaker": seg.get("speaker", "Unknown"),
                "start": seg.get("start", 0),
                "end": seg.get("end", 0),
                "text": seg.get("text", "").strip(),
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
            
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump({"segments": final_segments}, f, indent=2, ensure_ascii=False)
            
        merge_time = time.perf_counter() - t_start
        log_diagnostic(folder_path, f"[TIMER] Merging, sorting and saving JSON took: {merge_time:.2f} seconds")
        
        emit_progress("complete", "Transcription complete.")
        
    except Exception as e:
        log_diagnostic(folder_path, f"[CRITICAL ERROR] Pipeline crashed: {e}")
        log_diagnostic(folder_path, traceback.format_exc())
        
        # Fallback to write whatever segments we managed to extract
        if all_segments:
            try:
                log_diagnostic(folder_path, "[FALLBACK] Attempting to write partial transcript to json...")
                all_segments.sort(key=lambda x: x.get("start", 0))
                final_segments = []
                for i, seg in enumerate(all_segments):
                    final_seg = {
                        "id": f"seg_{i}",
                        "speaker": seg.get("speaker", "Unknown"),
                        "start": seg.get("start", 0),
                        "end": seg.get("end", 0),
                        "text": seg.get("text", "").strip(),
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
                with open(out_path, "w", encoding="utf-8") as f:
                    json.dump({"segments": final_segments}, f, indent=2, ensure_ascii=False)
                log_diagnostic(folder_path, "[FALLBACK] Partial transcript written successfully.")
            except Exception as fe:
                log_diagnostic(folder_path, f"[FALLBACK ERROR] Failed to write fallback JSON: {fe}")
                log_diagnostic(folder_path, traceback.format_exc())
                
        emit_progress("error", f"Pipeline crashed: {e}")
        
    finally:
        import gc
        gc.collect()
        log_resources(folder_path, "Post-cleanup")
        
        total_time = time.perf_counter() - total_start
        log_diagnostic(folder_path, f"[SUMMARY] Total Processing Time: {total_time:.2f} seconds")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", help="Path to workspace folder")
    args = parser.parse_args()
    main(args.folder)
