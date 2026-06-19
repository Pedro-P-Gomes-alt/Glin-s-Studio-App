# DESIGN.md — Glin's Studio

> The single source of truth for how the app looks and feels.
> Read this before touching any styling. Every visual decision should trace back here.

## Direction: **Atelier**

A warm cosmaker's studio — the digital version of Glin's worktable, not a generic SaaS dashboard.

Think: a craftsperson's bench under good light. **Unbleached paper and linen neutrals**, a
single **rich rose accent** drawn from the logo, **warm near‑black ("espresso")** for the
anchoring dark surfaces, and **editorial serif headings** that give the product a confident,
hand‑made personality. Images (builds, props, reference photos) are treated like prints on a
gallery wall: crisp white mats, generous space, soft shadows.

It deliberately extends the existing logo identity (cursive *glin* wordmark, black + blush
pink) rather than discarding it — but warms every neutral, deepens the accent for legibility,
and pairs it with real typography.

### Explicitly avoid (the "AI default" look)
- ❌ purple/indigo gradients, Bootstrap‑blue buttons
- ❌ unstyled system font for headings
- ❌ three identical cards in a row as a "hero"
- ❌ cold pure‑grey neutrals (#FAFAFA / #EAEAEA / #111)
- ❌ one‑off hard‑coded colours, radii, or shadows — everything is a token

### Feels like
Warm · tactile · editorial · calm · gallery. Confident but never loud. The accent is a
highlight, not wallpaper.

---

## Typography

A genuine pairing, both self‑hosted as variable `woff2` (offline‑first — no CDN at runtime):

| Role | Font | Notes |
|------|------|-------|
| Display / headings / wordmark / hero numbers | **Fraunces** (`--font-display`) | An "old‑style" editorial serif with real character. Used for h1/h2, dialog titles, section titles, and the big money/stat figures. |
| Body / UI / labels / tables / inputs | **Inter** (`--font-body`) | Crisp, neutral, highly legible at small sizes. Everything that isn't a heading. |

- The existing **font‑family setting** (System / Segoe / Serif / Mono) is preserved — it drives
  the *body* font. The default "System" now leads with Inter. Display headings stay Fraunces
  regardless, because they are part of the brand identity.
- Modular type scale (≈1.2 minor third), tokenised as `--fs-*`.
- Body line‑height 1.5; headings 1.1–1.25; tight tracking on display sizes.

---

## Tokens (defined in `:root` in `src/App.css`)

**Never hard‑code a value that a token covers.** Legacy semantic names (`--bg`, `--surface`,
`--border`, `--text`, `--muted`, `--black`, `--pink*`, `--brand*`, `--positive`, `--negative`)
are kept and re‑pointed at the new ramp so the whole app updates consistently.

### Colour — warm neutral ramp (paper / linen)
- `--paper` `#FBF8F4` — app background (`--bg`)
- `--surface` `#FFFFFF` — cards, the gallery "mat"
- `--surface-2` `#F7F1EA` — insets, hovers, raised fills
- `--border` `#EBE2D8` / `--border-strong` `#DDD0C3`
- `--text` `#2A231E` (warm near‑black) · `--muted` `#776A5F` (warm taupe, AA on white & paper)

### Colour — dark ("espresso") surfaces
- `--espresso` `#221B17` (`--black`) — sidebar, hero cards, badges, readouts, calendar header
- on‑espresso accent text uses `--blush` `#F4A39C` (logo pink, 8.5:1 ✓)

### Colour — rose accent (one confident accent)
- `--accent` `#DD6E70` — fills, bars, decorative backgrounds
- `--accent-strong` `#C8545A` — hover fills / white‑text‑on‑accent surfaces
- `--accent-ink` `#B23A41` — accent **text & icons on light** (5.9:1 ✓ — use this for small accent text)
- `--accent-tint` `#FBEDEB` (`--pink-light`) · `--accent-line` `#F2D7D4` (`--pink-border`)

### Colour — semantic
- `--positive` `#2C7048` (5.97:1) · `--negative` `#C0392F` (5.43:1) · `--warn` `#9C6212` (5.0:1)

All foreground/background pairs verified **WCAG AA** for their text size.

### Radius
`--r-xs 6` · `--r-sm 8` · `--r-md 10` · `--r-lg 14` · `--r-xl 18` · `--r-pill 999`

### Elevation (warm‑tinted, soft — gallery light, never harsh black)
`--shadow-xs` → `--shadow-xl`, all tinted with the espresso hue at low alpha.

### Spacing (4px base — one scale, used everywhere; be generous)
`--s-1 4` · `--s-2 8` · `--s-3 12` · `--s-4 16` · `--s-5 20` · `--s-6 24` · `--s-7 32` · `--s-8 40` · `--s-9 48` · `--s-10 64`

### Motion (subtle, purposeful, fast)
- `--dur-fast 120ms` · `--dur 180ms` · `--dur-slow 240ms`
- `--ease` `cubic-bezier(0.2,0.8,0.2,1)`
- Every interactive element has hover / focus‑visible / active states. Honours
  `prefers-reduced-motion`.

### Focus
- `--ring` — a 3px rose halo. A visible `:focus-visible` outline on every focusable control
  (keyboard accessibility is non‑negotiable).

---

## Components — principles
- **Buttons:** `--btn-primary` is espresso (not blue). Ghost buttons warm on hover. One clear
  primary action per screen.
- **Cards / surfaces:** white "mats" on warm paper, `--border` hairline, `--shadow-sm`, lifting
  to `--shadow-md` on hover. Consistent `--r-lg` radius.
- **Inputs:** warm border, rose focus ring, comfortable padding.
- **Drawers / dialogs:** slide/scale in with `--ease`; espresso scrim.
- **Images are the hero:** consistent aspect ratios, white mat, rounded corners, soft shadow,
  hover lift + zoom affordance; strong illustrated empty states; skeleton placeholders while
  loading.
- **Icons:** one consistent set (currently emoji/glyph — keep uniform; revisit if a set is added).

## Process / rollout order
1. Tokens + fonts + base/accessibility ✅ first
2. Shared components (buttons, inputs, cards, tables, drawers, sidebar, badges)
3. Screen by screen — starting with **Dashboard** (the landing) and the **image‑forward
   Workspace** reference grid, then the rest.

> After the design system + 1–2 screens, pause and confirm direction before rolling out everywhere.
