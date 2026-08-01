#!/usr/bin/env bash
# ==============================================================================
# Cognito Call - Uninstaller Script for macOS
# Usage:
#   ./uninstall.sh --app-only     (Deletes /Applications/Cognito Call.app only)
#   ./uninstall.sh --models-only  (Clears ~/.cognitocall/models & cache)
#   ./uninstall.sh --all          (Wipes app, models, venv, and data)
# ==============================================================================

set -e

MODE="${1:---all}"

APP_PATH="/Applications/Cognito Call.app"
DATA_DIR="$HOME/.cognitocall"
CACHE_DIR="$HOME/.cache/huggingface/hub"

echo "======================================================"
echo "          Cognito Call Uninstallation                 "
echo "======================================================"

case "$MODE" in
  --app-only)
    echo "🔹 Removing Cognito Call desktop application..."
    if [ -d "$APP_PATH" ]; then
      rm -rf "$APP_PATH"
      echo "✅ Successfully removed /Applications/Cognito Call.app."
    else
      echo "ℹ️ Application not found in /Applications."
    fi
    echo "💡 Local AI models and Python venv (~/.cognitocall) were kept intact."
    ;;

  --models-only)
    echo "🔹 Removing downloaded AI models & MLX cache..."
    if [ -d "$DATA_DIR/models" ]; then
      rm -rf "$DATA_DIR/models"
      echo "✅ Cleared ~/.cognitocall/models."
    fi
    if [ -d "$CACHE_DIR" ]; then
      rm -rf "$CACHE_DIR"/models--mlx-community* "$CACHE_DIR"/models--simple-diarizer* 2>/dev/null || true
      echo "✅ Cleared MLX/Whisper HuggingFace cache."
    fi
    echo "💡 Desktop Application (/Applications/Cognito Call.app) was kept intact."
    ;;

  --all|*)
    echo "🔹 Performing full nuclear uninstallation..."
    if [ -d "$APP_PATH" ]; then
      rm -rf "$APP_PATH"
      echo "✅ Removed /Applications/Cognito Call.app."
    fi
    if [ -d "$DATA_DIR" ]; then
      rm -rf "$DATA_DIR"
      echo "✅ Removed ~/.cognitocall environment and models."
    fi
    if [ -d "$CACHE_DIR" ]; then
      rm -rf "$CACHE_DIR"/models--mlx-community* "$CACHE_DIR"/models--simple-diarizer* 2>/dev/null || true
      echo "✅ Cleared MLX HuggingFace cache."
    fi
    echo "======================================================"
    echo "🎉 Cognito Call has been completely uninstalled."
    echo "======================================================"
    ;;
esac
