# AquaLC design

Applies to the logged-in workspace and the public website. The printed quote and spec sheets (`.quote-sheet`) keep their own document styles.

## Intent

Warm cream editorial: an eggshell paper canvas, black ink, whisper-weight headlines and pill-shaped controls. The interface is almost entirely achromatic. Colour appears only in the AquaLC sphere (brand mark and the home page hero visual), never in buttons, links, text or borders.

## Colour

| Token | Light | Use |
|---|---|---|
| Eggshell | `#fdfcfc` | Page canvas, tables, fields, white cards |
| Warm taupe | `#f5f3f1` | Cards, key-figure bands, section bands, footer |
| Stone | `#ebe8e4` | Hairline borders, dividers, chips, icon plates |
| Control | `#dcd7d1` | Field borders |
| Ink | `#000000` | Text, primary buttons, focus |
| Graphite | `#44403b` | Strong secondary text, labels |
| Smoke | `#6b655e` | Body and descriptions (darkened from #777169 to keep 4.5:1 on taupe) |
| Sphere | `#0447ff`, `#ff4704`, pink, peach | Brand sphere only |

Dark mode (workspace only) uses warm darks: canvas `#141312`, surfaces `#1d1c1a` / `#282624`, text `#fdfcfc`, primary button inverted (eggshell fill, black text).

## Type

Inter throughout (IBM Plex Sans Arabic for Arabic). Headlines and key figures 32px and up at weight 300 with -0.02em tracking: page titles 28px, key figures 36px, public H1 48px, H2 36px. Everything under 24px is Inter 400/500 with +0.01em tracking. Status and active tabs: a small orange dot marks the selected tab.

## Shape

- Buttons, status pills, tabs, segmented controls, nav items: fully round (9999px).
- Cards and tables: 20px radius; small cards and tiles 12-16px; fields 4px.
- Flat surfaces separated by tone; the whisper shadow (`0 0 1px rgba(0,0,0,.4), 0 1px 1px rgba(0,0,0,.04), 0 2px 4px rgba(0,0,0,.04)`) only on raised items (selected nav item, active segment, featured plan, login card).
- Public layout: 1280px column, 64px gutters, 96px section rhythm.

## Motion

Transitions 120-160ms with `cubic-bezier(0.23,1,0.32,1)`; buttons press to `scale(.97)`; hover effects only on fine pointers; movement removed under `prefers-reduced-motion`.
