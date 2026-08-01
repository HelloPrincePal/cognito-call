# Cognito Call 🧠🔒

[![App Downloads](https://img.shields.io/github/downloads/HelloPrincePal/cognito-call/total?style=for-the-badge&color=3B82F6&logo=github&label=App%20Downloads)](https://github.com/HelloPrincePal/cognito-call/releases)
[![Repo Views](https://hits.seeyoufarm.com/api/count/incr/badge.svg?url=https%3A%2F%2Fgithub.com%2FHelloPrincePal%2Fcognito-call&count_bg=%238B5CF6&title_bg=%231E293B&icon=github&icon_color=%23FFFFFF&title=Repo%20Views&edge_flat=false)](https://github.com/HelloPrincePal/cognito-call)
[![Latest Release](https://img.shields.io/github/v/release/HelloPrincePal/cognito-call?style=for-the-badge&color=10B981&label=Latest%20Release)](https://github.com/HelloPrincePal/cognito-call/releases/latest)
[![Privacy Guarantee](https://img.shields.io/badge/Privacy-100%25%20Local%20%26%20Offline-6366F1?style=for-the-badge&logo=apple)](https://github.com/HelloPrincePal/cognito-call)

**Cognito Call** is a 100% private, local-first meeting recorder and intelligence assistant for macOS. It captures dual-channel meeting audio (your microphone + remote tab audio) and runs AI transcription, speaker diarization, sentence restructuring, and executive summaries **completely offline on your Mac** using MLX, Whisper, and Gemma.

---

## 🚀 Quick Setup Guide

Cognito Call consists of two parts:
1. **Chrome Extension**: Captures meeting video & tab audio (supports Google Meet live captions).
2. **Desktop Application**: Plays back meetings with Karaoke sync, generates transcripts, and creates AI meeting notes.

---

### Step 1: Install Chrome Extension

1. Download the latest **[cognito-call-extension.zip](https://github.com/HelloPrincePal/cognito-call/releases/latest/download/cognito-call-extension.zip)**.
2. Unzip the downloaded file on your computer.
3. Open Google Chrome and navigate to `chrome://extensions`.
4. Enable **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** in the top-left corner.
6. Select the unzipped `packages/extension` folder.
7. Click the Cognito Call extension icon in Chrome and grant microphone permissions when prompted.

---

### Step 2: Install Desktop Application

Choose one of the two installation methods below:

#### Option A: One-Line Installer (Recommended)
Run this command in your Terminal to download and install the app to `/Applications/Cognito Call.app`:

```bash
curl -fsSL https://raw.githubusercontent.com/HelloPrincePal/cognito-call/main/install.sh | bash
```

> **Note for macOS Gatekeeper**: On first launch, if macOS displays a security warning, right-click `Cognito Call.app` in Finder and select **Open**.

#### Option B: Build Directly From Source on Your System
If you prefer not to download a pre-built app binary and want to compile the desktop app locally on your machine:

```bash
git clone https://github.com/HelloPrincePal/cognito-call.git
cd cognito-call
./build-local.sh
```

---

## 🔄 Updating Cognito Call

Updating Cognito Call to the latest version takes just one command and **preserves all your saved meeting recordings and AI models**.

### Option 1: Desktop App One-Line Update (Recommended)
Run the installer command in your Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/HelloPrincePal/cognito-call/main/install.sh | bash
```
> **What this does**: Automatically fetches the latest release binary from GitHub, updates `/Applications/Cognito Call.app`, and leaves all your recordings (`~/Downloads/CognitoCall/`) and AI models (`~/.cognitocall/`) completely safe and untouched.

### Option 2: Update Source Build
If you built from source, pull the latest code and rebuild:

```bash
git pull && ./build-local.sh
```

### Option 3: Update Chrome Extension
1. Download the latest **[cognito-call-extension.zip](https://github.com/HelloPrincePal/cognito-call/releases/latest/download/cognito-call-extension.zip)** and extract it over your existing extension folder.
2. Open `chrome://extensions` in Google Chrome and click the 🔄 **Reload** icon on the Cognito Call extension card.

---

## 👤 First Launch & Personalization

When you open Cognito Call for the first time, the app will ask for your name (e.g., **Ram**).

- **Microphone Attribution**: Your microphone audio stream will be labeled with your actual name (e.g., `"Ram"`) instead of generic labels.
- **AI Context Awareness**: The local LLM (Gemma) receives your name in its context window to accurately attribute questions, answers, and presentation turns during meeting summarization.

---

## 📁 Storage Architecture & Folder Rules

All meeting recordings, video files, and AI metadata are saved locally on your Mac:

```
~/Downloads/CognitoCall/
  └── 2026-08-01_14-30-00/
      ├── video.webm         # Full meeting screen/tab video recording
      ├── mic.opus           # Your microphone audio stream
      ├── tab.opus           # Remote participants tab audio stream
      ├── transcript.json    # Sentence-level AI refined transcript
      ├── metadata.json      # Meeting title & display metadata
      └── summary.json       # Executive summary & action items
```

> ⚠️ **CRITICAL REQUIREMENT**: Do NOT rename or move folders inside `~/Downloads/CognitoCall/`. Cognito Call uses this exact directory layout for synchronized video playback, Karaoke word alignment, and session loading.

---

## 🗑️ Uninstallation Guide

Cognito Call provides granular uninstallation scripts so you can delete the app, models, or everything independently.

Run `./uninstall.sh` with your desired flag:

| Command | Action |
| :--- | :--- |
| `./uninstall.sh --app-only` | Deletes `/Applications/Cognito Call.app` (keeps downloaded AI models and Python venv intact). |
| `./uninstall.sh --models-only` | Clears `~/.cognitocall/models` and HuggingFace MLX cache (frees ~3 GB storage while keeping the desktop app). |
| `./uninstall.sh --all` | Performs a full wipe (removes App, models, Python venv, and local metadata). |

---

## 🛠️ Tech Stack & Architecture

- **Desktop UI**: Tauri v2 (Rust) + React 18 + TypeScript + Tailwind CSS
- **Audio/Video Engine**: Web MediaRecorder API + Chrome Offscreen Document
- **Local Speech-to-Text**: `mlx-whisper` (Quantized 4-bit Whisper on Apple Silicon)
- **Local Diarization**: `simple-diarizer` (Spectral clustering & PyTorch embeddings)
- **Local LLM Intelligence**: `mlx-lm` (`gemma-2-2b-it-4bit` Map-Reduce Chunked Pipeline)
- **Fast-Path Captions**: Instant Google Meet live caption extraction via `MutationObserver`
