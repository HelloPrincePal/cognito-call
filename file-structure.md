cognito-call/
├── .github/
│   └── workflows/
│       └── release.yml                # CI/CD: Automated GitHub Release ZIP packager
├── README.md                          # Main project README & release download links
├── CHANGELOG.md                       # Project history & detailed implementation notes
├── ARCHITECTURE.md                    # Technical architecture & pipeline documentation
├── PRIVACY_POLICY.md                  # 100% Local privacy promise
├── file-structure.md                  # AI/Developer project reference
├── VERSION_LOG.md                     # High-level release tracking (SemVer)
├── design/
│   ├── extension-ui.pen               # UI/UX designs (Pencil)
│   ├── design.md                      # Design system documentation
│   └── images/                        # Exported UI assets
├── docs/
│   ├── PHASE1-EXTENSION.md            # Phase 1 spec (guardrail)
│   ├── INSTALL-EXTENSION.md           # User install guide
│   └── DISCLAIMER.md                  # Legal & privacy disclaimer
├── packages/
│   └── extension/                     # Phase 1 Extension Code
│       ├── manifest.json
│       ├── popup/
│       │   ├── index.html
│       │   └── index.js
│       ├── offscreen/
│       │   ├── recorder.html
│       │   ├── recorder.js
│       │   └── webm-fixer.js          # In-browser WebM EBML duration & Cues remuxer
│       ├── background/
│       │   └── service-worker.js
│       ├── icons/                     # 16/48/128px icons
│       │   ├── icon16.png
│       │   ├── icon48.png
│       │   └── icon128.png
│       ├── permissions/               # Permission grant pages (full-tab)
│       │   ├── mic.html
│       │   └── mic.js
│       └── README.md                  # Extension-specific
├── cognito-desktop/                   # Phase 2 Desktop App (Tauri v2 + React)
├── tests/                             # Playwright E2E (optional)
│   └── extension.spec.js
├── .gitignore
└── package.json                       # Root configuration
