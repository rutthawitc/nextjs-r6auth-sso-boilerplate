# MicroPost Design System

This application uses **MicroPost**, a compact, social-first design system optimized for content density and scannable interfaces.

## Overview

MicroPost prioritizes **visual clarity with minimal whitespace**, using a single blue accent color (#3B82F6) and carefully curated typography. The system is production-ready and designed to feel modern and professional without appearing AI-generated.

## Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| **Primary** | `#3B82F6` | Links, buttons, active states, focus rings |
| **Secondary** | `#6B7280` | Metadata, timestamps, disabled text |
| **Tertiary** | `#F3F4F6` | Card backgrounds, subtle fills |
| **Background** | `#F9FAFB` | Page background throughout |
| **Surface** | `#FFFFFF` | Card panels, modals |
| **Border** | `#E5E7EB` | Input borders, dividers |
| **Success** | `#10B981` | Active status, approval states |
| **Warning** | `#F59E0B` | Pending status, caution states |
| **Error** | `#EF4444` | Errors, destructive actions, rejection |
| **Info** | `#3B82F6` | Same as primary |

**Text Colors:**
- Primary text: `#111827` (near-black)
- Secondary text: `#6B7280` (gray)
- Placeholder: `#9CA3AF` (lighter gray)

## Typography

All fonts are loaded via Google Fonts (`next/font/google`) — no network requests during build.

### Font Families
- **Headlines**: Space Grotesk (bold/semibold)
- **Body**: DM Sans (regular/medium)
- **Code**: Roboto Mono (regular)

### Type Scale

| Style | Font | Size | Weight | Line Height | Usage |
|-------|------|------|--------|-------------|-------|
| Display | Space Grotesk | 30px | Bold | 1.2 | Hero titles |
| Headline | Space Grotesk | 22px | Bold | 1.25 | Page titles, section heads |
| Subhead | Space Grotesk | 17px | Semibold | 1.35 | Form labels, subsections |
| Body Large | DM Sans | 16px | Regular | 1.55 | Featured posts, callouts |
| Body | DM Sans | 14px | Regular | 1.5 | Default text, paragraphs |
| Body Small | DM Sans | 13px | Regular | 1.45 | Secondary text, captions |
| Caption | DM Sans | 11px | Medium | 1.4 | Timestamps, counts, metadata |
| Overline | DM Sans | 10px | Bold | 1.3 | Badge labels, status labels (0.08em tracking) |
| Code | Roboto Mono | 13px | Regular | 1.5 | Inline code, code blocks |

**CSS Classes** (defined in `globals.css`):
- `.mp-display` — 30px bold headlines
- `.mp-headline` — 22px bold page titles
- `.mp-subhead` — 17px semibold section headers
- `.mp-body-lg` — 16px featured text
- `.mp-body` — 14px default text
- `.mp-body-sm` — 13px secondary text
- `.mp-caption` — 11px timestamps/metadata
- `.mp-overline` — 10px uppercase badge labels
- `.mp-code` — 13px mono code

## Spacing

Base unit: **4px**

**Scale:** 2, 4, 8, 12, 16, 20, 24, 32, 48

**Component Padding:**
- Small elements (badges, small inputs): 4px
- Standard padding: 8–16px
- Large sections: 24–32px
- Page-level spacing: 32–48px

Tailwind classes map directly: `p-2` (8px), `p-4` (16px), `p-6` (24px), `p-8` (32px).

## Border Radius

| Level | Value | Usage |
|-------|-------|-------|
| None | 0px | Dividers, thread lines |
| Small | 6px | Small chips, minimal radius |
| Medium | 12px | **Default** — cards, inputs, buttons |
| Large | 16px | Modals, large panels |
| XL | 20px | Large feature containers |
| Full | 9999px | **Pills** — all buttons, avatars, badges |

**Tailwind classes:**
- `rounded-none` (0px)
- `rounded-sm` (6px)
- `rounded-xl` (12px) ← default for cards
- `rounded-2xl` (16px)
- `rounded-3xl` (20px)
- `rounded-full` (9999px) ← all buttons & pills

## Elevation (Shadows)

Subtle, diffused shadows create hierarchy without visual weight.

| Level | Shadow CSS | Usage |
|-------|-----------|-------|
| Subtle | `shadow-[0_1px_2px_rgba(0,0,0,0.04)]` | Cards at rest, default state |
| Medium | `shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]` | Hovered cards, raised elements |
| Large | `shadow-[0_8px_24px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)]` | Modals, dropdowns, popovers |
| Overlay | `shadow-[0_16px_48px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]` | Tooltips, context menus |

**Focus Ring:** `ring-2 ring-offset-2 ring-[#3B82F6]/20` + `border-[#3B82F6]`

## Components

### Buttons (All Pill-Shaped)

All buttons use `rounded-full` (9999px radius).

**Variants:**

#### Primary
- Background: `#3B82F6`
- Text: `#FFFFFF`
- Hover: `#2563EB`
- Active: `#1D4ED8`
- Padding: 6px 16px (medium), 4px 12px (small), 8px 24px (large)
- Font: DM Sans 13px semibold (medium)

#### Secondary
- Background: `#F3F4F6`
- Text: `#111827`
- Hover: `#E5E7EB`
- Active: `#D1D5DB`
- Padding: same as primary

#### Ghost
- Background: transparent
- Text: `#6B7280`
- Hover: Background `#F3F4F6`, text `#111827`
- Active: Background `#E5E7EB`

#### Destructive
- Background: `#EF4444`
- Text: `#FFFFFF`
- Hover: `#DC2626`
- Active: `#B91C1C`

**States:**
- Disabled: 40% opacity, `disabled:pointer-events-none`
- Loading: Show spinner instead of text

### Cards

**Default Card:**
- Background: `#FFFFFF`
- Border: 1px `#E5E7EB`
- Radius: 12px
- Padding: 12–16px
- Shadow: `shadow-[0_1px_2px_rgba(0,0,0,0.04)]`
- Hover shadow: `shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]`

**Elevated Card:**
- Same as default but shadow starts at medium level

### Inputs

**Text Input:**
- Height: 36px (`h-9`)
- Radius: 12px (`rounded-xl`)
- Border: 1px `#E5E7EB`
- Background: `#FFFFFF`
- Text: `#111827`, DM Sans 14px
- Placeholder: `#9CA3AF`
- Padding: 6px 12px
- Focus: Border `#3B82F6` + ring `ring-2 ring-offset-2 ring-[#3B82F6]/20`
- Error: Border `#EF4444`
- Disabled: Background `#F9FAFB`, opacity 50%

**Label:**
- DM Sans 12px semibold
- Color: `#374151`
- Margin bottom: 4px

**Helper Text:**
- DM Sans 11px regular
- Color: `#9CA3AF` (default), `#EF4444` (error)
- Margin top: 4px

### Status Badges (Pill Chips)

Compact, pill-shaped status indicators.

| Status | Background | Text | Hex |
|--------|-----------|------|-----|
| Active | `#ECFDF5` | `#065F46` (green) | Success green |
| Inactive | `#F3F4F6` | `#6B7280` (gray) | Secondary gray |
| Pending | `#FFFBEB` | `#92400E` (amber) | Warning amber |
| Rejected | `#FEF2F2` | `#991B1B` (red) | Error red |

**Styling:**
- Padding: 2px 8px
- Radius: 9999px (full pill)
- Font: DM Sans 10px bold uppercase

### Tables

**Header:**
- Font: Space Grotesk 11px uppercase semibold
- Color: `#6B7280`
- Padding: 8px 12px
- Border bottom: 1px `#E5E7EB`
- Background: `#F9FAFB`

**Row:**
- Font: DM Sans 14px regular
- Padding: 8px 12px
- Border bottom: 1px `#E5E7EB`
- Hover: Background `#F9FAFB`
- Active: Background `#F3F4F6`

**Action Buttons:** Ghost or secondary pill style, compact

### Lists

**List Item:**
- Font: DM Sans 14px regular
- Color: `#111827`
- Padding: 8px 12px
- Border bottom: 1px `#F3F4F6`
- Avatar: 32px, full radius
- Icon: 16px, `#6B7280`
- Hover: Background `#F9FAFB`
- Active: Background `#F3F4F6`

### Checkboxes & Radio Buttons

**Checkbox:**
- Size: 16px
- Border: 1.5px `#D1D5DB`
- Radius: 4px
- Unchecked: `#FFFFFF` fill
- Checked: `#3B82F6` fill + `#FFFFFF` checkmark
- Focus: `ring-2 ring-offset-2 ring-[#3B82F6]/20`
- Label: DM Sans 13px regular, left margin 8px

**Radio:**
- Size: 16px
- Border: 1.5px `#D1D5DB`
- Radius: full (pill)
- Selected: Border `#3B82F6`, inner dot `#3B82F6` (6px)
- Focus: `ring-2 ring-offset-2 ring-[#3B82F6]/20`
- Label: DM Sans 13px regular, left margin 8px

## Design Principles

1. **Single Accent Color** — Use `#3B82F6` for all interactive elements. Avoid purple, orange, or multi-color gradients.
2. **Pill Buttons** — All buttons are `rounded-full`. No square buttons.
3. **Compact Cards** — 12px radius, 1px border, subtle shadow. No excessive padding.
4. **Clear Typography Hierarchy** — Space Grotesk for headings, DM Sans for everything else.
5. **Light Backgrounds** — `#F9FAFB` page background, `#FFFFFF` surfaces.
6. **Timestamp Metadata** — Always DM Sans 11px `#6B7280`.
7. **No Excess Whitespace** — Cards and sections use 8–16px padding, not 24px+.
8. **Status Badges Are Colored** — Green for active, gray for inactive, amber for pending, red for error.
9. **Hover States Matter** — Cards lift slightly on hover; buttons change color.
10. **Accessible Focus Rings** — Blue ring with offset on all interactive elements.

## Implementation Details

### Tailwind CSS Variables

Color tokens are defined in `src/app/globals.css` as CSS custom properties:

```css
:root {
  --mp-primary: #3B82F6;
  --mp-secondary: #6B7280;
  --mp-tertiary: #F3F4F6;
  --mp-background: #F9FAFB;
  --mp-surface: #FFFFFF;
  --mp-border: #E5E7EB;
  --mp-success: #10B981;
  --mp-warning: #F59E0B;
  --mp-error: #EF4444;
  /* ... etc */
}
```

Use with Tailwind: `bg-[var(--mp-primary)]` or hardcoded hex: `bg-[#3B82F6]`.

### Font Loading

Fonts are loaded in `src/app/layout.tsx`:

```typescript
import { Space_Grotesk, DM_Sans, Roboto_Mono } from "next/font/google";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
});
```

Apply to `html` element:

```tsx
<html className={`${spaceGrotesk.variable} ${dmSans.variable}`}>
```

### Component Updates

- **`src/components/ui/button.tsx`** — All variants use `rounded-full` + blue/gray/ghost colors
- **`src/components/ui/input.tsx`** — 36px height, 12px radius, blue focus ring
- **Status badges** — Pill chips with colored backgrounds
- **Tables** — Space Grotesk headers, DM Sans rows

## Extending the System

When adding new components:

1. Use Space Grotesk for **headings** (bold/semibold)
2. Use DM Sans for **body text** (regular/medium)
3. Use `#3B82F6` as the **only accent color**
4. Apply **pill radius** (`rounded-full`) to **all buttons**
5. Use **12px radius** (`rounded-xl`) for **cards & inputs**
6. Add **subtle shadow** to cards: `shadow-[0_1px_2px_rgba(0,0,0,0.04)]`
7. Set **page background** to `#F9FAFB`
8. Ensure **focus rings** are blue with offset

## References

- **Design file:** `docs/DESIGN_SYSTEM.md` (this file)
- **Color tokens:** `src/app/globals.css` (CSS variables + Tailwind config)
- **Typography classes:** `.mp-*` utility classes in `globals.css`
- **Component library:** `src/components/ui/` (button, input, etc.)

---

**Last Updated:** June 2026  
**Design System:** MicroPost v1.0  
**Framework:** Next.js 16 + Tailwind CSS 4.1
