# AquaLC workspace design

The logged-in workspace (sidebar, top bar, every module). The public website (`.aq-pub`) and the printed quote and spec sheets (`.quote-sheet`) keep their own styles.

## Intent

A working tool for pool companies at a desk in daylight. Calm, precise, quick to scan. The interface stays quiet so the numbers (volumes, flow rates, prices) carry the screen.

- One deep pool-water accent, used only on data, the current selection and focus. Never on chrome or decoration.
- The primary action is near-black (white in dark mode). One filled primary per area.
- Sidebar and top bar sit on the page ground, separated by one rule. The current page is a neutral grey pill.
- Sentence case everywhere. No uppercase tracked labels, no monospace outside the printed documents.
- Figures are tabular and right-aligned in tables.
- Lines instead of boxes: key figures and quick links are one strip divided by rules.

## Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f5f7f7` | `#0e1112` | Page ground, sidebar, top bar |
| `--surface` | `#ffffff` | `#15191a` | Cards, tables, fields |
| `--surface-2` | `#f0f3f3` | `#1b2022` | Hover, segmented track, callouts |
| `--surface-3` | `#e3e8e9` | `#252b2d` | Neutral chips, gauge tracks |
| `--active` | `#e6ebec` | `#252c2e` | Selected nav item, selected row |
| `--border` | `#e2e7e8` | `#252b2d` | Card and table edges |
| `--rule` | `#edf0f1` | `#1f2426` | Row dividers |
| `--control` | `#cdd5d7` | `#3a4346` | Field and button borders |
| `--text` | `#0f1a1d` | `#f1f4f4` | Primary text |
| `--text-muted` | `#4b5a5f` | `#b4bec0` | Secondary text, labels |
| `--text-faint` | `#5f6e73` | `#939ea1` | Meta, placeholders (still 4.5:1) |
| `--accent` | `#0a6b80` | `#56bfd3` | Data highlight, selection, focus |
| `--accent-text` | `#08596b` | `#7fd0e0` | Links, info text |
| `--ink` / `--on-ink` | `#13201f` / `#fff` | `#f1f4f4` / `#0e1112` | Primary button |

Status pairs (`--success`, `--warning`, `--danger` with their `-soft` tints) are pale fills with dark text of the same hue.

## Type

Hanken Grotesk for the whole workspace (IBM Plex Sans Arabic for Arabic), tabular figures on.
Scale: 12.5 / 13 / 14 / 16 / 20 / 26. Page title 20/600, section 16/600, body 14/400, labels 13/500, key figures 26/600.

## Shape and motion

- Radius 6px for controls, 8px for cards and tables, full pill for status chips.
- Shadows only on what floats (dialogs, menus).
- Transitions 120-160ms with `cubic-bezier(0.23,1,0.32,1)`; buttons press to `scale(.97)`; hover effects only on devices with a fine pointer; movement removed under `prefers-reduced-motion`.
