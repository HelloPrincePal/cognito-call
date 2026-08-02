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

# Model quality tier: "lite" (default, MacBook Air friendly) or "pro" (bigger, higher-quality
# models that need more RAM). Pass --pro (or --quality) to select the pro tier.
MODEL_TIER="lite"
for _arg in "$@"; do
  case "$_arg" in
    --pro|--quality|--high) MODEL_TIER="pro" ;;
    --lite|--fast|--air) MODEL_TIER="lite" ;;
  esac
done

echo "🔹 1. Installing Node dependencies..."
npm install

echo "🔹 2. Setting up local AI Python environment (~/.cognitocall)..."
mkdir -p "$DATA_DIR/models"
mkdir -p "$DATA_DIR/python"
mkdir -p "$DATA_DIR/bin"

# Record the selected model tier so the Python sidecar knows which models to load, and keep
# only that tier's weights on disk (models download lazily into ~/.cache/huggingface/hub; we
# remove the other tier's cached models so the machine never holds both sets at once).
HF_HUB="$HOME/.cache/huggingface/hub"
_offload_model() { for _m in "$@"; do rm -rf "$HF_HUB/models--mlx-community--$_m" 2>/dev/null || true; done; }
if [ "$MODEL_TIER" = "pro" ]; then
  echo "🔹 Model tier: PRO — whisper-large-v3-turbo + Qwen2.5-14B (best quality for 24 GB+ Macs; first run downloads ~10 GB)."
  cat > "$DATA_DIR/models.json" <<'EOF'
{
  "whisper_model": "mlx-community/whisper-large-v3-turbo",
  "llm_model": "mlx-community/Qwen2.5-14B-Instruct-4bit"
}
EOF
  _offload_model "whisper-base-mlx-q4" "gemma-2-2b-it-4bit"
else
  echo "🔹 Model tier: LITE — whisper-base + gemma-2b (fast, MacBook Air friendly)."
  cat > "$DATA_DIR/models.json" <<'EOF'
{
  "whisper_model": "mlx-community/whisper-base-mlx-q4",
  "llm_model": "mlx-community/gemma-2-2b-it-4bit"
}
EOF
  _offload_model "whisper-large-v3-turbo" "Qwen2.5-14B-Instruct-4bit"
fi

cp -f cognito-desktop/python/transcriber.py "$DATA_DIR/python/transcriber.py"
cp -f cognito-desktop/python/requirements.txt "$DATA_DIR/python/requirements.txt"

# Set up the local Python AI environment (venv + dependencies from requirements.txt).
# Without this the built app has no Python runtime to transcribe with.
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
  pip install -r cognito-desktop/python/requirements.txt || echo "⚠️ Warning: Failed to install Python dependencies."
  # torchcodec is only needed by newer torchaudio (>=2.9) as its audio load backend; best-effort.
  pip install torchcodec 2>/dev/null || true
  deactivate 2>/dev/null || true
fi

# Ensure FFmpeg is available AND staged into ~/.cognitocall/bin (the app's runtime PATH).
# A GUI app launched from Finder/Spotlight does NOT inherit your Terminal's PATH, so we always
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
  TEMP_DIR=$(mktemp -d)
  if curl -fsSL "https://evermeet.cx/ffmpeg/getrelease/zip" -o "$TEMP_DIR/ffmpeg.zip"; then
    unzip -o -q "$TEMP_DIR/ffmpeg.zip" -d "$DATA_DIR/bin" || true
    chmod +x "$DATA_DIR/bin/ffmpeg" 2>/dev/null || true
    echo "FFmpeg installed locally at $DATA_DIR/bin/ffmpeg."
  else
    echo "⚠️ Warning: Failed to obtain FFmpeg. Please install it manually: 'brew install ffmpeg'."
  fi
  rm -rf "$TEMP_DIR"
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
