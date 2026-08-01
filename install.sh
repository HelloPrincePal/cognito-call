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
  RELEASE_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/CognitoCall.app.tar.gz"
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

if command -v python3 &>/dev/null; then
  if [ ! -d "$DATA_DIR/venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv "$DATA_DIR/venv"
  fi
  source "$DATA_DIR/venv/bin/activate"
  pip install --quiet mlx-whisper mlx-lm simple-diarizer torchaudio psutil || true
fi

echo "======================================================"
echo "🎉 Installation Complete!"
echo "📍 App Installed at: /Applications/Cognito Call.app"
echo "💡 You can now launch Cognito Call from Spotlight or Launchpad."
echo "======================================================"
