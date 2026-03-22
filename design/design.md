# DESIGN.md — Cognito Call Design System

> **Source of truth** for every screen, component, and token in the project.
> All values are derived from the canonical Pencil file: `design/extension-ui.pen`.
> When in doubt, read the `.pen` node data — this doc merely mirrors it in a developer-friendly format.

---

## Non-negotiables

1. **Reuse first** — use existing tokens and components. Only add new ones when nothing fits.
2. **Tokens drive styling** — never hardcode a color, font size, or spacing value that isn't listed here.
3. **Lucide icons only** — all icons come from the [Lucide](https://lucide.dev) set, rendered as **inline SVGs** for guaranteed rendering.
4. **Flat layout** — prefer flat sibling structures inside flex containers with `gap`. Avoid wrapper divs and margin hacks.

---

## How to use this file

1. Identify the target screen/component.
2. Map UI pieces to existing component patterns below.
3. Pull every value (color, size, spacing) from the token tables — never invent values.
4. Pick Lucide icons by semantic role; color them with the matching token.
5. Only if a token/component is truly missing, define the smallest addition and add it here.

---

## Color Tokens

### Surfaces & Backgrounds

| Token | Value | Usage |
|---|---|---|
| `bg-primary` | `#ffffff` | Cards, popups, modals |
| `bg-app-dark` | `#111827` | Full-page backgrounds (permissions page) |
| `bg-elevated` | `#171717` | Dark surface sections |
| `bg-icon-circle` | `#f0f4ff` | Mic / status icon background |
| `bg-recording-outer` | `#fef2f2` | Recording pulse outer ring |
| `bg-recording-inner` | `#fee2e2` | Recording pulse inner ring |
| `divider` | `#f3f4f6` | Horizontal separators |

### Text & Content

| Token | Value | Usage |
|---|---|---|
| `text-header` | `#171717` | Headings, brand name, titles |
| `text-body` | `#6b7280` | Descriptions, subtitles |
| `text-content` | `#374151` | Checklist items, form labels |
| `text-muted` | `#9ca3af` | Footer notes, hints |
| `text-warning` | `#92400e` | Text inside warning banners |
| `text-rec` | `#dc2626` | "REC" badge text |

### Brand & Accent

| Token | Value | Usage |
|---|---|---|
| `primary` | `#335cff` | Buttons, primary icon fills, links |
| `primary-hover` | `#2547d0` | Button hover state |
| `primary-disabled` | `#9ca3af` | Button disabled state |
| `accent-purple` | `#7c3aed` | "No Cloud" badge text & icon |
| `accent-purple-bg` | `#faf5ff` | "No Cloud" badge background |

### Status

| Token | Value | Usage |
|---|---|---|
| `success` | `#10b981` | Checklist icons, success messages |
| `success-dark` | `#15803d` | "100% Local" badge text & icon |
| `success-bg` | `#f0fdf4` | "100% Local" badge background |
| `warning-icon` | `#d97706` | Warning banner icon |
| `warning-bg` | `#fffbeb` | Warning banner background |
| `warning-border` | `#fde68a` | Warning banner border |
| `error` | `#ef4444` | Stop button, recording dot, error states |
| `error-hover` | `#dc2626` | Stop button hover |
| `error-bg` | `#fef2f2` | Recording badge & pulse bg |

### Borders

| Token | Value | Usage |
|---|---|---|
| `border-card` | `#ebebeb` | Card / popup outer border |
| `border-divider` | `#f3f4f6` | Subtle section dividers |

---

## Typography

**Font family:** `Inter` (loaded via Google Fonts: weights 400, 500, 600, 700)

| Role | Size | Weight | Letter-spacing | Line-height | Example |
|---|---|---|---|---|---|
| Page heading | `22px` | `700` | `-0.3px` | `1.2` | "Microphone Access Required" |
| Section heading | `20px` | `600` | `-0.3px` | `1.2` | "Ready to Record" |
| Brand name (popup) | `16px` | `600` | `-0.2px` | `1.2` | "Cognito Call" |
| Brand name (permission) | `18px` | `700` | `-0.2px` | `1.2` | "Cognito Call" |
| Body / description | `14px` | `400` | — | `1.6` | Permission page description |
| Body compact | `13px` | `400` | — | `1.5` | Popup description, checklist items |
| Button label | `15px` | `600` | — | — | "Grant Microphone Access" |
| Brand subtitle | `12px` | `400` | — | `1.2` | "Local Tab Recorder" |
| Warning text | `12px` | `400` | — | `1.5` | Warning banner message |
| Badge text | `11px` | `500` | — | — | "100% Local", "No Cloud" |
| REC badge | `11px` | `700` | `0.5px` | — | "REC" |
| Footer note | `11px` | `400` | — | — | "This page will close..." |
| Timer display | `40px` | `700` | `-1px` | — | "02:34" |

---

## Spacing & Layout

### Layout philosophy

All containers use **flexbox column** with a single `gap` value. Child elements are flat siblings — do **not** wrap groups in extra divs just for margin.

### Gap scale (commonly used)

`2` · `4` · `6` · `8` · `10` · `12` · `16` · `20` · `24`

### Component-specific spacing

| Component | Gap | Padding | Notes |
|---|---|---|---|
| Permission card | `24px` | `40px` | All children are direct siblings |
| Popup body | `20px` | `24px` | Both idle and recording states |
| Popup header | `12px` | `16px 20px` | Brand logo + text |
| Brand text stack | `2px` | — | Name + subtitle |
| Checklist | `12px` | — | Between check items |
| Check item | `10px` | — | Icon + text |
| Warning banner | `10px` | `12px 14px` | Icon + text |
| Button | `8px` | `12px 24px` | Icon + label |
| Badge row | `8px` | — | Between badges |
| Badge | `4px` | `4px 10px` | Icon + label |
| REC badge | `6px` | `6px 12px` | Dot + text |

### Corner radii

| Value | Usage |
|---|---|
| `100px` | Badges, REC badge (pill shape) |
| `40px` | Mic icon circle (80×80 on permission page) |
| `36px` | Recording pulse outer (72×72) |
| `32px` | Icon circle (64×64 on popup) |
| `26px` | Recording pulse inner (52×52) |
| `24px` | Permission page card |
| `16px` | Popup container |
| `12px` | Buttons |
| `10px` | Warning banner |
| `8px` | Logo image |

### Shadows

| Usage | Value |
|---|---|
| Permission card | `0 4px 24px rgba(0, 0, 0, 0.08)` |
| Popup | `0 4px 24px rgba(0, 0, 0, 0.08)` |

---

## Component Patterns

### 1. Permission Card (`LSQU5`)

```
Card (480px, radius:24, padding:40, gap:24, shadow, border:#ebebeb)
├── Logo Row (gap:12) → logo 36×36 + brand text (gap:2)
├── Divider (1px, #f3f4f6)
├── Icon Circle (80×80, radius:40, bg:#f0f4ff) → mic icon 36×36
├── Heading (22px, 700, #171717)
├── Description (14px, 400, #6b7280, line-height:1.6)
├── Checklist (gap:12) → items (gap:10, icon 18×18 + text 13px)
├── CTA Button (48px, radius:12, bg:#335cff)
├── Warning Banner (radius:10, padding:12/14, bg:#fffbeb, border:#fde68a)
└── Footer Note (11px, #9ca3af)
```

### 2. Popup — Idle State (`C0eoM`)

```
Container (360×440, radius:16, layout:vertical)
├── Header (padding:16/20, gap:12) → logo + brand (gap:2)
├── Divider (1px, #f3f4f6)
└── Body (padding:24, gap:20, flex:1)
    ├── Icon Circle (64×64, radius:32, bg:#f0f4ff) → mic 28×28
    ├── Title (20px, 600, #171717)
    ├── Description (13px, 400, #6b7280)
    ├── Start Button (48px, radius:12, bg:#335cff) → circle icon 16×16
    └── Badges Row (gap:8) → [100% Local] [No Cloud]
```

### 3. Popup — Recording State (`szsb3`)

```
Container (360×440, radius:16, layout:vertical)
├── Header (padding:16/20, gap:12) → logo + brand (gap:2) + REC badge
├── Divider (1px, #f3f4f6)
└── Body (padding:24, gap:20, flex:1)
    ├── Pulse (72→52→20px, nested circles)
    ├── Title (20px, 600, #171717)
    ├── Timer (40px, 700, letter-spacing:-1px)
    ├── Capture Info (13px, 400, #6b7280)
    ├── Stop Button (48px, radius:12, bg:#ef4444) → square icon 14×14
    └── Badges Row (gap:8) → [100% Local] [No Cloud]
```

---

## Icons (Lucide)

### Rendering method

Always use **inline SVGs** — never icon fonts or external image files. This guarantees pixel-perfect rendering in Chrome extension popups and permission pages.

```html
<svg xmlns="http://www.w3.org/2000/svg" width="SIZE" height="SIZE"
     viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <!-- path data from lucide.dev -->
</svg>
```

### Icon inventory

| Icon name | Sizes used | Color token | Context |
|---|---|---|---|
| `mic` | `28`, `36` | `primary` (`#335cff`) | Idle icon circle |
| `circle` | `16` | `white` | Start recording button |
| `square` | `14` | `white` | Stop recording button |
| `lock` | `12` | `success-dark` (`#15803d`) | "100% Local" badge |
| `cloud-off` | `12` | `accent-purple` (`#7c3aed`) | "No Cloud" badge |
| `circle-check` | `18` | `success` (`#10b981`) | Permission checklist |
| `shield-check` | `18` | `white` | Grant button |
| `triangle-alert` | `18` | `warning-icon` (`#d97706`) | Warning banner |

### Icon sizing tiers

| Tier | Size range | Usage |
|---|---|---|
| Tiny | `8–12px` | Inside badges, recording dot |
| Small | `14–18px` | Buttons, checklist, warnings |
| Medium | `28px` | Popup icon circle |
| Large | `36px` | Permission page icon circle |

---

## Pencil ↔ Code Reference

Every CSS value in the codebase references its Pencil node ID as a comment. When updating designs:

1. Update the `.pen` file first.
2. Read the node data with `mcp_pencil_batch_get`.
3. Update the HTML/CSS values and their node-ID comments.
4. Update this `design.md` if any token changed.

| Pencil Node | Code file | Element |
|---|---|---|
| `LSQU5` | `mic.html` | Permission card container |
| `C0eoM` | `index.html` | Popup idle state |
| `szsb3` | `index.html` | Popup recording state |
| `d7cws` | `mic.html` | Logo |
| `U9uLv` / `bYYpz` | both | Dividers |
| `1H3FB` / `sGruk` | mic / popup | Icon circles |
| `tt7H8` / `XbLUg` | mic / popup | CTA buttons |
| `FMoKy` | `mic.html` | Warning banner |
| `hzOYi` | `mic.html` | Footer note |

---

## Reference

- [Google Stitch design-md format](https://stitch.withgoogle.com/docs/design-md/format/?pli=1)
- [Google Stitch design-md usage](https://stitch.withgoogle.com/docs/design-md/usage/?pli=1)
- [Lucide Icons](https://lucide.dev)
