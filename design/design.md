# DESIGN.md (Boss File): Cognito Call Design System

This file is the source of truth for building, updating, and redesigning UI across the project.

It uses the Google Stitch `design-md` idea: keep a consistent, structured description of tokens + component/pattern usage so future changes can be generated/implemented without “reinventing” styles.

## Non-negotiables

1. Reuse first: whenever possible, use already-made components and tokens. Only create a new component/token when coverage is missing and reuse would be awkward or inconsistent.
2. Tokens drive styling: colors, typography, spacing, radii, and icon colors come from this file (or from the project’s token utilities that match it).
3. Lucide icons everywhere: icon set + naming comes from Lucide; pick icons by semantic meaning and color by status/role.

## How to use this file (workflow)

1. Start with the target screen in mind (what the user is doing).
2. Map required UI pieces to existing component types (button, card/panel, input, badge, modal, sidebar/nav, header/separator).
3. Choose tokens from this doc (don’t hardcode new colors or spacing).
4. Choose Lucide icons by semantic role and apply the matching token color.
5. Only if a needed building block does not exist, define the smallest addition required (token first, then component).

## Color Tokens

### Surfaces

- `bg-primary` (light): `#ffffff`
- `bg-elevated` (dark surface): `#171717`
- `border-subtle`: `#ebebeb`
- `border-faint`: `#ffffff1a`

### Brand / accents

- `primary` : `#335cff`
- `primary-ink` : `#47c2ff` / `#4285f4` / `#05a6f0` (use as supporting accent variants where needed)
- `accent-purple` : `#7d52f4`
- `accent-purple-alt` : `#9747ff`

### Status

- `success` : `#10b981` (alt: `#1daf61`)
- `warning` : `#fbbc05` / `#f6b51e` (alt: `#f35325`)
- `error` : `#e35050` / `#fb3748`
- `attention` : `#fb4ba3` (use sparingly)

## Typography Tokens

- Font families: `Inter Display` (headings/hero), `Inter` (body/labels)
- Weights: `normal`, `500`, `700`
- Common sizes seen in the UI:
  - Display/heading: `40px`
  - Page labels: `14-16px`
  - Small/metadata: `11-12px`
  - Supporting text: `18-24px`

## Spacing, Corner Radius, Borders

### Common gaps

Use these as starting points: `0`, `1`, `2`, `4`, `6`, `8`, `10`, `11`, `12`, `14`, `16`, `20`, `24`, `31`, `32`, `48`, `50`.

### Common padding patterns

- `[20,32]`, `[28,40]`, `[40,28]`, `[24,32]`
- `[16,16,16,16]`, `[20,20,20,20]`, `[24,24,24,24]`

### Corner radii

Prefer: `0`, `2`, `5`, `6`, `8`, `12`, `16`, `20`, `24`.

### Borders / strokes

- Subtle borders: `#ebebeb`
- Faint borders: `#ffffff1a`
- Keep borders thin by default (typical “1px-ish” feel).

## Component & Pattern Usage Guidelines (reuse-first)

Use these existing UI “shapes” as patterns and keep naming consistent across code/design:

1. `Card` / `Panel`: light surface (`#ffffff`), subtle border (`#ebebeb`), medium radius (`12-20px`), optional soft shadow.
2. `Sidebar / Navigation`: left-rail layout with faint separators and vertically stacked sections.
3. `Page Header / Section Header`: emphasize with `Inter Display` and primary color usage for key accents.
4. `Separator / Feature header`: rounded container with primary-tinted header + dark body (`#171717`) when representing structured page sections.
5. `Modal`: white surface with shadow/blur feel and inner padding matched to other containers.

Rule of thumb: if a redesign can be achieved by swapping layout/content while keeping the same container type + tokens, do that instead of creating a new container.

## Icons (Lucide System)

### Icon set

Use Lucide icons by name (same naming you’d pass to Lucide).

Common icons already in use:

- `mic`
- `lock`
- `shield-check`
- `cloud-off`
- `circle`
- `square`
- `circle-check`
- `triangle-alert`

### Icon sizes

- Small: `12-18px`
- Regular: `18-28px`
- Large: `32-36px`

### Icon colors (status/role mapping)

- Brand/primary: `primary` (`#335cff`)
- Success: `success` (`#10b981`)
- Warning: `warning` (`#fbbc05` / `#f6b51e` / `#f35325`)
- Error: `error` (`#e35050` / `#fb3748`)
- Security/auth: `accent-purple` / `accent-purple-alt` (`#7d52f4` / `#9747ff`)

## Reference (Google Stitch: design-md)

- [Format docs](https://stitch.withgoogle.com/docs/design-md/format/?pli=1)
- [Usage docs](https://stitch.withgoogle.com/docs/design-md/usage/?pli=1)


