# PyTorch WhisperX Legacy Archive

This directory contains the original Python transcription pipeline built using PyTorch and WhisperX.

## Contents
* `transcriber.py`: Original script using WhisperX (VAD + Alignment) and `simple-diarizer`.
* `requirements.txt`: Original dependencies, including heavy packages like `torch` and `whisperx`.

## Why this is archived
We migrated to an Apple-native **MLX** pipeline (`mlx-whisper`) to:
1. Drastically reduce the storage footprint (avoiding ~3-5GB of PyTorch ecosystems).
2. Utilize Unified Memory and Apple Neural Engine on macOS for faster, cooler, and less RAM-intensive runs.
3. Prepare a unified framework to also run Gemma 2b models locally in subsequent phases.

These files serve as a rollback reference. Note that the heavy models previously downloaded by these scripts have been purged from the disk caches, but the logic remains intact.
