import argparse
import json
import os
import sys
import torch

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

def main(folder_path):
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
    
    emit_progress("loading", "Loading WhisperX base model...")
    model = whisperx.load_model("base", device, compute_type=compute_type)
    
    all_segments = []
    
    # ==========================================
    # PASS 1: mic.opus (Local User)
    # ==========================================
    if os.path.exists(mic_path):
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
            
    # ==========================================
    # PASS 2: tab.opus (Remote Participants)
    # ==========================================
    if os.path.exists(tab_path):
        emit_progress("tab_transcribing", "Transcribing remote participants...")
        audio_tab = whisperx.load_audio(tab_path)
        result_tab = model.transcribe(audio_tab, batch_size=16)
        
        emit_progress("tab_aligning", "Aligning word timestamps for remote participants...")
        model_a_tab, metadata_tab = whisperx.load_align_model(language_code=result_tab["language"], device=device)
        result_aligned_tab = whisperx.align(result_tab["segments"], model_a_tab, metadata_tab, audio_tab, device, return_char_alignments=False)
        
        emit_progress("tab_diarizing", "Running token-free diarization on remote audio...")
        
        # Initialize simple-diarizer for token-free local clustering
        diar = Diarizer(embed_model='xvec', cluster_method='sc')
        # Returns a list of dicts: [{'label': 1, 'start': 0.0, 'end': 2.5}, ...]
        try:
            diar_segments = diar.diarize(tab_path) 
        except AssertionError as e:
            if "VAD" in str(e):
                diar_segments = []
            else:
                raise
        except Exception as e:
            diar_segments = []
        
        emit_progress("tab_stitching", "Stitching remote speakers to words...")
        
        # Custom Stitching Logic: Map simple-diarizer labels to WhisperX words
        for segment in result_aligned_tab["segments"]:
            segment["source"] = "tab"
            segment_speaker = "Unknown"
            
            for word_obj in segment.get("words", []):
                word_start = word_obj.get("start")
                word_end = word_obj.get("end")
                
                if word_start is None or word_end is None:
                    continue
                
                # Check the midpoint of the word against the diarization segments
                word_mid = (word_start + word_end) / 2.0
                
                assigned_label = "Speaker ?"
                for ds in diar_segments:
                    if ds['start'] <= word_mid <= ds['end']:
                        assigned_label = f"Speaker {ds['label']}"
                        break
                        
                word_obj['speaker'] = assigned_label
                if segment_speaker == "Unknown" or segment_speaker == "Speaker ?":
                    segment_speaker = assigned_label
                    
            segment["speaker"] = segment_speaker
            all_segments.append(segment)
            
    # ==========================================
    # MERGE & SORT
    # ==========================================
    emit_progress("merging", "Merging and sorting transcripts chronologically...")
    all_segments.sort(key=lambda x: x["start"])
    
    final_segments = []
    for i, seg in enumerate(all_segments):
        final_seg = {
            "id": f"seg_{i}",
            "speaker": seg.get("speaker", "Unknown"),
            "start": seg["start"],
            "end": seg["end"],
            "text": seg["text"].strip(),
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
        
    emit_progress("complete", "Transcription complete.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", help="Path to workspace folder")
    args = parser.parse_args()
    main(args.folder)
