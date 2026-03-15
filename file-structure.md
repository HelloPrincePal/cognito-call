cognito-call/
├── README.md                          # Main project README
├── file-structure.md                  # AI reference (update this file)
├── docs/
│   ├── PHASE1-EXTENSION.md            # Phase 1 spec (guardrail)
│   └── INSTALL-EXTENSION.md           # User install guide
├── packages/
│   └── extension/                     # Phase 1 ONLY
│       ├── manifest.json
│       ├── popup/
│       │   ├── index.html
│       │   └── index.js
│       ├── offscreen/
│       │   ├── recorder.html
│       │   └── recorder.js
│       ├── background/
│       │   └── service-worker.js
│       ├── icons/                     # 16/48/128px icons
│       │   ├── icon16.png
│       │   ├── icon48.png
│       │   └── icon128.png
│       └── README.md                  # Extension-specific
├── tests/                             # Playwright E2E (optional)
│   └── extension.spec.js
├── .gitignore
└── package.json                       # Root (for playwright)
