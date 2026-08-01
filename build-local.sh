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

echo "🔹 1. Installing Node dependencies..."
npm install

echo "🔹 2. Building Tauri Desktop Application..."
cd cognito-desktop
npm install
npm run tauri build

echo "🔹 3. Installing compiled app to /Applications..."
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
