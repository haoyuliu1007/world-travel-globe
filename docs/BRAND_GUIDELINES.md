# KAIROS. — World Travel Atlas Brand Guidelines (V5.0)

## 1. Brand Identity
- **Brand Name**: KAIROS (Display Wordmark: `KAIROS.` featuring cross-barless `Λ` for `A` and golden period `.`).
- **Tagline**: `WORLD TRAVEL ATLAS`
- **Core Philosophy**: *Travel with Astronomical Precision — go to the right place, at the right time.* (`以天文学的精度去旅行——去对地方，更要去对时间。`)
- **Accessibility & SEO Text**: Always write standard `KAIROS` in HTML `<title>`, `alt`, `aria-label`, JSON-LD, and databases so screen readers and search engines index accurately.

## 2. Official Color Palette
| Token | Hex | Usage |
|---|---|---|
| `--kairos-navy` | `#16283F` | Primary ink on light/cream surfaces, dark icon background, primary brand accent |
| `--kairos-gold` | `#E8A33D` | Enso terminal dot, wordmark period `.`, celestial & active highlights |
| `--kairos-cream` | `#FAF8F4` | Primary ink on dark/cosmic surfaces, light icon background |
| `--kairos-cosmos` | `#09090B` | Deep space 3D globe backdrop (preserved across all themes) |

> **Theme Rule**: Do NOT force the 3D space globe backdrop into cream `#FAF8F4`. Floating UI surfaces adapt cleanly between Dark Obsidian (`#FAF8F4` + `#E8A33D` logo) and Daylight (`#16283F` + `#E8A33D` logo).

## 3. Logo Symbol & Lockup Rules
- **Enso Symbol**: Single-stroke calligraphic brush circle with natural stroke-width variation, paired with the `#E8A33D` golden dot at the lower-right (~4:30) gap.
- **Forbidden Modifications**:
  - NEVER relocate the golden dot or alter the enso stroke silhouette per variant.
  - NEVER add meridian/latitude gridlines, airplanes, globe outlines, or map pins inside the logo mark.
  - NEVER embed Base64 raster PNGs inside SVG files. All production SVGs in `assets/brand/svg/` are pure vector `<path>` + `<circle>` derived from the single `-1` / `-5` master traces.
- **Responsive Lockups**:
  - Desktop topbar (`>960px`): Horizontal compact lockup (`kairos-horizontal.svg` / `kairos-horizontal-dark.svg`).
  - Mobile / compact (`<=960px`): Symbol-only mark (`kairos-symbol.svg` / `kairos-symbol-dark.svg`).
  - App Icons / Favicons (`16px–512px`): Bold small-scale enso (`kairos-icon.svg` / `favicon.svg`).

## 4. Asset Inventory (`assets/brand/`)
- `source/`: Lossless original 9 design PNGs (`-1` through `-9`, archived, excluded from production `dist/`).
- `svg/`: `kairos-primary.svg`, `kairos-dark.svg`, `kairos-horizontal.svg`, `kairos-horizontal-dark.svg`, `kairos-black.svg`, `kairos-white.svg`, `kairos-symbol.svg`, `kairos-symbol-dark.svg`, `kairos-icon.svg`.
- `icons/`: `favicon.svg`, `favicon.ico`, `favicon-16.png`, `favicon-32.png`, `favicon-48.png`, `icon-64.png`, `apple-touch-icon.png` (180×180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.
- `social/`: `og-cover.png` (1200×630).
- `brand-tokens.css`: CSS custom properties & reveal animations (`prefers-reduced-motion` compliant).

## 5. Historical Compatibility
Rebranding to KAIROS preserves:
- IndexedDB name: `WorldTravelGlobeDB`
- Legacy `localStorage` keys: `wtg_*`
- Destination IDs (`data/registry.js` + 55 data files)
- Legacy API routes (`/api/*`) and share URLs (`?focus=`, `?trip=`, `?footprint=`, `?embed=`)
- GitHub repo (`haoyuliu1007/world-travel-globe`) and production Workers domain (`world-travel-globe.globe-app.workers.dev`).
