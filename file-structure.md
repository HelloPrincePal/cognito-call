cognito-call/
├── .github/
│   └── workflows/
│       └── release.yml                # CI/CD: Automated GitHub Release packager & macOS Tauri builder
├── install.sh                         # One-line macOS desktop app & model environment installer
├── build-local.sh                     # Local build script for compiling app directly on user system
├── uninstall.sh                       # Granular uninstaller script (--app-only, --models-only, --all)
├── README.md                          # Main project documentation, setup, onboarding & release guides
├── CHANGELOG.md                       # Complete release history & implementation logs
├── ARCHITECTURE.md                    # Technical architecture & pipeline documentation
├── PRIVACY_POLICY.md                  # 100% Local offline privacy commitment
├── file-structure.md                  # Complete developer file structure index
├── VERSION_LOG.md                     # High-level SemVer version log
├── TESTING.md                         # Performance benchmarks & stress test suite
├── design/
│   ├── extension-ui.pen               # UI/UX designs (Pencil)
│   ├── design.md                      # Design system specification
│   └── images/                        # UI screenshots & visual assets
├── docs/
│   ├── PHASE1-EXTENSION.md            # Extension functional specification
│   ├── INSTALL-EXTENSION.md           # Chrome extension installation guide
│   └── DISCLAIMER.md                  # Legal & privacy disclaimer
├── packages/
│   └── extension/                     # Chrome Extension Subsystem (Manifest V3)
│       ├── manifest.json
│       ├── popup/
│       │   ├── index.html
│       │   └── index.js
│       ├── content/
│       │   └── meet-captions.js       # Live Google Meet caption observer & fast-path exporter
│       ├── offscreen/
│       │   ├── recorder.html
│       │   ├── recorder.js
│       │   └── webm-fixer.js          # In-browser WebM EBML duration & Cues keyframe remuxer
│       ├── background/
│       │   └── service-worker.js
│       ├── icons/                     # Chrome extension icon assets (16/48/128px)
│       │   ├── icon16.png
│       │   ├── icon48.png
│       │   └── icon128.png
│       ├── permissions/               # Full-tab permission grant pages
│       │   ├── mic.html
│       │   └── mic.js
│       └── README.md
├── cognito-desktop/                   # Tauri v2 + React 18 Desktop Subsystem
│   ├── public/
│   │   ├── Logo.svg
│   │   └── Logo_icon.svg              # Primary brand logo vector asset
│   ├── python/
│   │   ├── transcriber.py             # MLX Whisper & Gemma Map-Reduce pipeline (cognito-assistant)
│   │   ├── requirements.txt           # Python dependency list (source of truth for the installers)
│   │   └── legacy_pytorch_archive/    # Deprecated PyTorch + WhisperX pipeline (superseded by MLX)
│   ├── src/
│   │   ├── assets/                    # Static frontend assets
│   │   ├── components/
│   │   │   ├── Player.tsx             # Karaoke player & Fullscreen media player
│   │   │   └── OnboardingModal.tsx    # First-time user name onboarding modal
│   │   ├── App.tsx                    # Main navigation, session gallery, Escape listener
│   │   ├── App.css
│   │   ├── index.css
│   │   ├── vite-env.d.ts
│   │   └── main.tsx
│   ├── src-tauri/
│   │   ├── icons/                     # Generated native icons (.icns, .ico, PNGs)
│   │   ├── src/
│   │   │   ├── main.rs
│   │   │   └── lib.rs                 # 1440x900 aspect ratio, PID process lifecycle control
│   │   ├── tauri.conf.json
│   │   └── Cargo.toml
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md                      # Desktop subsystem build/run notes
├── tests/                             # E2E test scripts
│   └── extension.spec.js
├── pyrightconfig.json
├── .gitignore
└── package.json                       # Root workspace configuration
