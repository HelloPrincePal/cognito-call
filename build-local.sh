#!/usr/bin/env bash
# ==============================================================================
# Cognito Call - Build & Install Directly From Source on User's System
# Usage: ./build-local.sh
# ==============================================================================

set -e

echo "======================================================"
echo "    Building Cognito Call From Source (Local System)  "
echo "======================================================"

# Check Prerequisites
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required to build Cognito Call. Please install Node.js 18+."
    exit 1
fi

if ! command -v cargo &> /dev/null; then
    echo "❌ Rust/Cargo is required to build Cognito Call. Install via https://rustup.rs."
    exit 1
fi

DATA_DIR="$HOME/.cognitocall"

echo "🔹 1. Installing Node dependencies..."
npm install

echo "🔹 2. Setting up local AI Python environment (~/.cognitocall)..."
mkdir -p "$DATA_DIR/models"
mkdir -p "$DATA_DIR/python"
mkdir -p "$DATA_DIR/bin"
cp -f cognito-desktop/python/transcriber.py "$DATA_DIR/python/transcriber.py"

# Install FFmpeg if missing globally
if ! command -v ffmpeg &>/dev/null; then
  echo "🔹 Installing FFmpeg (required for audio decoding)..."
  if command -v brew &>/dev/null; then
    echo "Installing FFmpeg via Homebrew..."
    brew install ffmpeg --quiet || true
  fi

  # Fallback to static bin download
  if ! command -v ffmpeg &>/dev/null && [ ! -f "$DATA_DIR/bin/ffmpeg" ]; then
    echo "Downloading static FFmpeg binary for macOS..."
    TEMP_DIR=$(mktemp -d)
    if curl -fsSL "https://evermeet.cx/ffmpeg/getrelease/zip" -o "$TEMP_DIR/ffmpeg.zip"; then
      unzip -o -q "$TEMP_DIR/ffmpeg.zip" -d "$DATA_DIR/bin" || true
      chmod +x "$DATA_DIR/bin/ffmpeg" 2>/dev/null || true
      echo "FFmpeg installed locally at $DATA_DIR/bin/ffmpeg."
    fi
    rm -rf "$TEMP_DIR"
  fi
fi

echo "🔹 3. Building Tauri Desktop Application..."
cd cognito-desktop
npm install
npm run tauri build

echo "🔹 4. Installing compiled app to /Applications..."
BUILT_APP="src-tauri/target/release/bundle/macos/Cognito Call.app"

if [ -d "$BUILT_APP" ]; then
    cp -R "$BUILT_APP" /Applications/
    xattr -cr "/Applications/Cognito Call.app" || true
    echo "======================================================"
    echo "🎉 Local Build & Installation Successful!"
    echo "📍 App Installed at: /Applications/Cognito Call.app"
    echo "======================================================"
else
    echo "⚠️ Build finished. Executable bundle located in cognito-desktop/src-tauri/target/release/bundle/"
fi
