#!/usr/bin/env bash
# ==============================================================================
# Cognito Call - One-Line Installer Script for macOS
# Usage: curl -fsSL https://raw.githubusercontent.com/HelloPrincePal/cognito-call/main/install.sh | bash
# ==============================================================================

set -e

REPO_OWNER="HelloPrincePal"
REPO_NAME="cognito-call"
INSTALL_DIR="/Applications"
APP_NAME="Cognito Call.app"
DATA_DIR="$HOME/.cognitocall"

echo "======================================================"
echo "         Installing Cognito Call (macOS)             "
echo "======================================================"

# 1. Detect Architecture & Mac OS
if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "❌ Error: Cognito Call desktop app installer currently supports macOS."
  exit 1
fi

echo "🔹 1. Fetching latest release asset from GitHub..."
RELEASE_URL=$(curl -s "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest" \
  | grep "browser_download_url" \
  | grep ".app.tar.gz" \
  | head -n 1 \
  | cut -d '"' -f 4)

# Fallback to .dmg or tar.gz if needed
if [ -z "$RELEASE_URL" ]; then
  # GitHub replaces spaces in release-asset filenames with periods, so the tauri bundle
  # "Cognito Call.app.tar.gz" is served as "Cognito.Call.app.tar.gz".
  RELEASE_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/Cognito.Call.app.tar.gz"
fi

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

echo "🔹 2. Downloading application bundle..."
if curl -fsSL "$RELEASE_URL" -o "$TEMP_DIR/app.tar.gz" 2>/dev/null; then
  echo "🔹 3. Extracting into /Applications..."
  tar -xzf "$TEMP_DIR/app.tar.gz" -C "$INSTALL_DIR/"
else
  echo "ℹ️ Pre-built GitHub release binary is not published yet."
  echo "🔹 Compiling Cognito Call directly on your Mac..."
  if [ -f "./build-local.sh" ]; then
    bash ./build-local.sh
    exit 0
  else
    echo "🔹 Cloning repository and building locally..."
    git clone https://github.com/${REPO_OWNER}/${REPO_NAME}.git "$TEMP_DIR/repo"
    cd "$TEMP_DIR/repo"
    bash ./build-local.sh
    exit 0
  fi
fi

echo "🔹 4. Setting execution permissions & clearing quarantine..."
xattr -cr "$INSTALL_DIR/$APP_NAME" || true
chmod +x "$INSTALL_DIR/$APP_NAME/Contents/MacOS/cognito-desktop" || true

echo "🔹 5. Setting up local AI environment (~/.cognitocall)..."
mkdir -p "$DATA_DIR/models"
mkdir -p "$DATA_DIR/python"
mkdir -p "$DATA_DIR/bin"
curl -fsSL "https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/cognito-desktop/python/transcriber.py" -o "$DATA_DIR/python/transcriber.py" 2>/dev/null || cp -f cognito-desktop/python/transcriber.py "$DATA_DIR/python/transcriber.py" 2>/dev/null || true
curl -fsSL "https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/cognito-desktop/python/requirements.txt" -o "$DATA_DIR/python/requirements.txt" 2>/dev/null || cp -f cognito-desktop/python/requirements.txt "$DATA_DIR/python/requirements.txt" 2>/dev/null || true

# Ensure FFmpeg is available AND staged into ~/.cognitocall/bin (the app's runtime PATH).
# CRITICAL: "found on the shell PATH during install" != "found by the GUI app at runtime" —
# a GUI app launched from Finder/Spotlight does NOT inherit your Terminal's PATH. So we always
# place a copy where the sidecar looks, even if ffmpeg is already installed elsewhere.
FFMPEG_BIN="$(command -v ffmpeg 2>/dev/null || true)"
if [ -z "$FFMPEG_BIN" ]; then
  echo "🔹 Installing FFmpeg (required for audio decoding)..."
  if command -v brew &>/dev/null; then
    echo "Installing FFmpeg via Homebrew..."
    brew install ffmpeg --quiet || true
    FFMPEG_BIN="$(command -v ffmpeg 2>/dev/null || true)"
  fi
fi

# Stage a copy into the app-controlled bin so the desktop app can always find it.
if [ -n "$FFMPEG_BIN" ] && [ ! -x "$DATA_DIR/bin/ffmpeg" ]; then
  cp -f "$FFMPEG_BIN" "$DATA_DIR/bin/ffmpeg" 2>/dev/null && chmod +x "$DATA_DIR/bin/ffmpeg" 2>/dev/null \
    && echo "Staged FFmpeg into $DATA_DIR/bin/ffmpeg."
fi

# Last resort: download a static build directly into the app bin.
if [ ! -x "$DATA_DIR/bin/ffmpeg" ]; then
  echo "Downloading static FFmpeg binary for macOS..."
  if curl -fsSL "https://evermeet.cx/ffmpeg/getrelease/zip" -o "$TEMP_DIR/ffmpeg.zip"; then
    unzip -o -q "$TEMP_DIR/ffmpeg.zip" -d "$DATA_DIR/bin" || true
    chmod +x "$DATA_DIR/bin/ffmpeg" 2>/dev/null || true
    echo "FFmpeg installed locally at $DATA_DIR/bin/ffmpeg."
  else
    echo "⚠️ Warning: Failed to obtain FFmpeg. Please install it manually: 'brew install ffmpeg'."
  fi
fi

if command -v python3 &>/dev/null; then
  if [ ! -d "$DATA_DIR/venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv "$DATA_DIR/venv"
  fi
  source "$DATA_DIR/venv/bin/activate"
  # Upgrade pip first: venvs are seeded with the system Python's bundled pip (often years old),
  # which can mis-resolve or fail on modern wheels. Non-fatal.
  echo "Upgrading pip inside the virtual environment..."
  python -m pip install --upgrade pip || true
  echo "Installing Python dependencies from requirements.txt..."
  REQ_FILE="$DATA_DIR/python/requirements.txt"
  if [ -f "$REQ_FILE" ]; then
    pip install -r "$REQ_FILE" || echo "⚠️ Warning: Failed to install Python dependencies from requirements.txt."
  else
    # Fallback if requirements.txt could not be fetched: install the same set explicitly.
    pip install mlx-whisper mlx-lm simple-diarizer speechbrain==0.5.16 "huggingface-hub<1.0" soundfile psutil setproctitle \
      || echo "⚠️ Warning: Failed to install Python dependencies."
  fi
  # torchcodec is only needed by newer torchaudio (>=2.9) as its audio load backend; best-effort.
  pip install torchcodec 2>/dev/null || true
fi

echo "======================================================"
echo "🎉 Installation Complete!"
echo "📍 App Installed at: /Applications/Cognito Call.app"
echo "💡 You can now launch Cognito Call from Spotlight or Launchpad."
echo "======================================================"
