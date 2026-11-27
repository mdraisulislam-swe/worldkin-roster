# Worldkin design system (approved prototype → React)

The visual reference is the approved local HTML prototype, kept outside this repository at `Desktop/worldkin-prototype`. Tokens live in `src/styles/index.css` under `@theme`. Tailwind generates utilities from them, for example `bg-forest-900` and `font-display`.

## Tokens

**Colours:**

| Token | Value | Use |
|---|---|---|
| `brand-700` | `#0f5e57` | Primary buttons, links, active state |
| `brand-600` | `#157268` | Meters, focus ring |
| `brand-800` | `#0c4a45` | Hover |
| `brand-50` / `brand-100` | `#eef7f5` / `#d5ece7` | Selected states, tints |
| `forest-900` | `#0c3b36` | Footer, hero, admin sidebar |
| `natural-500` | `#2f8f6a` | Icons and fills only (4.2:1 — not small text) |
| `sage-200` | `#cfe3d6` | Placeholders, text on forest |
| `neutral-100` | `#eceeea` | Borders |
| `surface` | `#f7f8f6` | Page background |
| `ink-900` / `ink-700` / `ink-500` | `#141a22` / `#333b47` / `#5b6472` | Text |
| `terracotta-500` | `#c8692e` | Decorative accent |
| `terracotta-700` | `#a9531c` | Accent text and buttons (AA) |

**Type:**
- Manrope (`font-display`) for `h1`–`h3`, applied globally in the base layer.
- Inter (`font-sans`) for body and UI.
- Both are loaded from Google Fonts in `index.html` with `display=swap`. For stricter privacy, self-host them later.

**Shape:**
- Radii: 8 px controls · 12 px cards · 20 px image panels · 28 px hero/auth panels · pill badges.
- 8-point spacing.
- Visible focus ring: `brand-600`.

## Applied in the app so far

- Tokens, Manrope headings, and the Deep Forest footer.

## Still to port, screen by screen

- Hero panel, auth split layout, workspace sidebar shell, cards and badges.
- Port order: shared components first (`components/ui.tsx`, `components/cards.tsx`), then pages.
- Prototype-only concepts stay out until their migrations exist: media (wk08), certificate verification (wk09), categories (wk10), reviews (wk11), map (wk12), admin roles (wk13).
