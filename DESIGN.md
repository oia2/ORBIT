# ORBIT Design System

Status: canonical visual-system source of truth
Version: 0.2
Platform: responsive web  
Language: Russian UI by default  

ORBIT is a calm, atmospheric personal planning system: graphite surfaces, industrial display typography, precise data, restrained semantic color, and one slow orbital motion accent around the primary aggregate metric.

This file is the canonical visual-system contract for every new ORBIT screen.
`orbit-tokens.css` is the executable token mirror; `orbit-design-system.html` is
the living component reference. Product behavior and data semantics remain
governed by `spec.md`, and explicit UI/prototype overrides remain governed by
`contracts/ui-routes.md`. Open Design prototypes are reference material only
where they do not conflict with those sources or this visual contract.

## 1. Visual posture

- Feel like a personal instrument, not a corporate control panel.
- Use dark graphite neutrals for 70–90% of every screen. Create hierarchy through tone, spacing, and thin borders.
- Lead with a period, an understandable result, or the next action. Avoid abstract product metaphors in user-facing copy.
- Keep data concrete and non-judgmental. Low energy or incomplete plans are states to explain, not failures to dramatize.
- Use one decisive expressive gesture per screen: the orbital field around the primary aggregate metric.
- Prefer asymmetric information density: one dominant area, compact supporting analytics, and generous separation between groups.
- Never restart the visual direction, introduce a second brand hue, or replace the graphite system with a light/cream canvas unless the product explicitly adds a new theme.

## 2. Canonical CSS tokens

Bind these tokens verbatim. Do not replace OKLCH values with guessed hex values. Update this block and `orbit-tokens.css` together.

```css
:root {
  color-scheme: dark;

  /* Color roles */
  --bg: oklch(0.17 0.008 255);
  --surface: oklch(0.22 0.012 255);
  --surface-raised: oklch(0.255 0.014 255);
  --fg: oklch(0.96 0.006 255);
  --muted: oklch(0.68 0.018 255);
  --border: oklch(0.38 0.014 255 / 0.62);
  --primary: var(--fg);
  --primary-contrast: var(--bg);
  --secondary: var(--surface-raised);
  --secondary-contrast: var(--fg);
  --accent: oklch(0.72 0.14 240);
  --accent-soft: oklch(0.72 0.14 240 / 0.13);
  --accent-mid: oklch(0.72 0.14 240 / 0.38);
  --success: oklch(0.78 0.14 154);
  --warn: oklch(0.82 0.13 86);
  --danger: oklch(0.68 0.18 28);

  /* Font roles */
  --font-display: "Bahnschrift", "DIN Alternate", "Aptos Display", sans-serif;
  --font-body: "Segoe UI Variable Text", "Aptos", system-ui, sans-serif;
  --font-mono: "Cascadia Code", "IBM Plex Mono", Consolas, monospace;
  --text-display: clamp(48px, 5vw, 68px);
  --text-h1: clamp(34px, 4vw, 48px);
  --text-h2: 28px;
  --text-h3: 18px;
  --text-body: 16px;
  --text-small: 13px;
  --text-caption: 11px;
  --weight-read: 400;
  --weight-emphasize: 550;
  --weight-announce: 590;

  /* 4px spacing system */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;

  /* Shape */
  --radius-check: 7px;
  --radius-control: 12px;
  --radius-field: 16px;
  --radius-card: 24px;
  --radius-round: 999px;

  /* Elevation */
  --elevation-card: 0 1px 0 oklch(1 0 0 / 0.03) inset;
  --elevation-action: 0 8px 22px oklch(0.04 0.01 255 / 0.34), 0 1px 0 oklch(1 0 0 / 0.55) inset;
  --elevation-overlay: 0 20px 70px oklch(0.04 0.01 255 / 0.45);

  /* Motion */
  --motion-fast: 150ms;
  --motion-standard: 240ms;
  --motion-slow: 600ms;
  --ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);
}
```

## 3. Color roles and usage

| Role | Token | Use |
|---|---|---|
| Canvas | `--bg` | App background, large empty zones |
| Surface | `--surface` | Cards, panels, dialogs |
| Raised surface | `--surface-raised` / `--secondary` | Nested controls, inactive tracks, segmented active state |
| Primary | `--primary` | Primary button fill and dominant readable content; it is not the brand accent |
| Foreground | `--fg` | Headings, body text, chart fills when no status is encoded |
| Muted | `--muted` | Supporting copy, labels, timestamps, inactive navigation |
| Border | `--border` | All structural 1px dividers and component outlines |
| Accent | `--accent` | Current context and the orbital motion accent only |
| Success | `--success` | Completed actions, Daily Score ≥70, positive status |
| Warning | `--warn` | Daily Score 50–69 and attention without alarm |
| Danger | `--danger` | Daily Score <50, destructive action, real error only |

### Accent discipline

- Use `--accent` at most twice in one viewport: one active context plus one primary motion accent or focal indicator.
- Primary buttons are light (`--primary`) rather than blue.
- Do not color every link with accent. Use `--fg` with an underline when an accent is already visible.
- Secondary is a neutral raised surface, never a second brand hue.
- Semantic colors communicate state only. Never use them as decoration.
- On dark surfaces, keep semantic fills local and small. A low result must not turn an entire card red.
- Maintain at least 4.5:1 for body text and 3:1 for large text and component boundaries.

## 4. Typography

### Font roles

- Display: `--font-display`. Use for page titles, section titles, card titles, and announcement copy.
- Body: `--font-body`. Use for navigation, task text, controls, descriptions, and long-form reading.
- Mono: `--font-mono`. Use for numbers, percentages, dates, time, ratios, compact labels, chart values, and technical metadata.
- Do not introduce a fourth family. Always preserve the fallback stacks.

### Scale and behavior

| Role | Size | Weight | Line height | Tracking |
|---|---:|---:|---:|---:|
| Display | 48–68 px | 590 | 1.0–1.05 | −0.025em |
| H1 | 34–48 px | 590 | 1.05–1.12 | −0.02em |
| H2 | 28 px | 590 | 1.15 | −0.01em |
| Card heading / H3 | 18 px | 590 | 1.25 | −0.01em |
| Body | 16 px | 400 | 1.55 | 0 |
| UI / small | 13 px | 550 | 1.5 | 0.01–0.02em |
| Caption | 11 px | 400–550 | 1.5 | 0.02em |
| ALL CAPS label | 10–12 px | 550 | 1.5 | 0.06–0.10em |

- Keep body lines between 50 and 75 characters; default to `max-width: 65ch`.
- Use only the three canonical weights: 400, 550, 590.
- Large numeric values use mono or display according to role: mono for comparable data, display for the one primary aggregate.
- Every value must show its unit or format: `56%`, `7:34`, `18 дел`, `3 / 6`.
- Do not place an explanatory phrase such as “из 100” beside a percentage; the `%` already defines the scale.

## 5. Spacing and layout rhythm

- Base step: 4 px.
- Micro alignment: 4/8 px.
- Control internals: 12/16 px.
- Card padding: 20/24 px.
- Standard grid gap: 16/18 px.
- Between content groups: 32/40 px.
- Between major sections: 48/64/80 px.
- Prefer larger space between groups rather than excessive padding inside every row.
- Align analytical rows to a shared baseline. Time, labels, bars, and values must not drift between cards.
- Page content uses `minmax(0, 1fr)` so long strings never force horizontal overflow.

## 6. Radius, borders, and elevation

| Element | Radius |
|---|---:|
| Checkbox and compact state | 7 px |
| Button, tab, compact control | 12 px |
| Input, nested panel | 16 px |
| Card and major panel | 24 px |
| Pill, avatar, orbit | 999 px / circle |

- All structural boundaries use a 1px `--border` line.
- Default cards have no drop shadow; use `--elevation-card` only as a subtle inner highlight.
- Use `--elevation-action` for the primary button.
- Use `--elevation-overlay` only for dialogs, floating mobile navigation, and true overlays.
- Never combine a rounded card with a colored left border.
- Do not use shadow to separate every nested surface. Use the tone sequence `--bg` → `--surface` → `--surface-raised`.

## 7. Responsive system

ORBIT is one responsive product, not a scaled desktop screenshot.

### Breakpoints

- Desktop, ≥1051 px: 220 px navigation rail; dashboard may use dominant + supporting columns.
- Compact desktop/tablet, 721–1050 px: 88 px icon rail; primary layouts collapse to one column; supporting cards may use two columns.
- Mobile, ≤720 px: remove the rail; use fixed bottom navigation, 16 px page gutters, stacked cards, and reordered priority content.

### Rules

- Touch targets are at least 44×44 px.
- At 360/390/430/600/768/820/1024/1366/1440/1920 px there must be no horizontal scroll.
- Mobile headings use `clamp()` and must wrap intentionally.
- On mobile, show the primary result and next action before secondary analytics.
- Convert multi-column metrics into stacked rows where labels and values remain readable.
- Never preserve desktop density by shrinking text below the canonical scale.
- Navigation must remain real and reachable; do not replace it with designer/demo controls.

## 8. Component styling principles

### Buttons

- Minimum height: 46 px; minimum touch target: 44 px.
- Primary: `--primary` fill, `--primary-contrast` text, radius 12 px, `--elevation-action`.
- Secondary: `--secondary` fill, `--border` outline, `--fg` text.
- Quiet: transparent, `--border` outline, `--muted` text; promote text to `--fg` on hover.
- Destructive: transparent neutral surface with `--danger` text/border. Do not use a large solid red button unless the action is irreversible and confirmed.
- UI text: 13 px / 600 / 0.02em. Press feedback moves at most 2 px.

### Inputs and selects

- Minimum height: 48 px; radius 12 px; `--bg` fill; 1px `--border` outline.
- Label sits above the field in 12–13 px muted text.
- Helper and error copy sit below the field; never rely on a placeholder as the label.
- Focus uses a 2px `--fg` outline with 3px offset. Accent is not the default focus ring.
- Errors use a local danger message and border; do not tint the entire form section.

### Checkboxes and toggles

- Checkbox visual: 22–24 px, 7 px radius, 44 px hit area.
- Completed checkbox uses `--success`; its associated task text becomes muted and struck through.
- Toggle track: 44×24 px, round radius; inactive uses `--surface-raised`, active uses `--accent-soft` with a foreground thumb.
- State must remain legible without color through position, checkmark, or label.

### Cards and panels

- Base card: `--surface`, 1px border, 24 px radius, 20–24 px padding.
- A card must have one role: metric, insight, action, list, or chart.
- Metric card: label → value → unit/context. Do not create a wall of equal KPI cards.
- Insight card: one evidence-based observation in human language, never a judgmental score message.
- Action card: one concrete next step, time/context, and one destination.
- Nested content uses `--surface-raised`, a divider, or spacing — not another full card by default.

### Navigation and segmented controls

- Active navigation uses `--accent-soft` background and `--fg` text.
- Inactive navigation uses `--muted`; hover promotes to `--fg`.
- Segmented controls use neutral raised surfaces. Do not apply semantic colors to filtering states.

## 9. Dashboard and analytics

### Information hierarchy

1. Period or date.
2. One primary aggregate result.
3. Transparent explanation of the result.
4. Daily trend or category breakdown.
5. Concrete next action.

- Use one dominant metric area and compact supporting analytics.
- Show the specification-defined task/habit counts or rates beside aggregate
  scores. Current ORBIT formula: tasks 70%, habits 30%; state is context only and
  does not contribute.
- Values must match between weekly and daily screens. A current-day update must propagate to the weekly chart.
- Use percentage for a normalized 0–100 result. Do not display both `%` and “из 100”.
- Use visible fills for magnitude. Bare outlined charts are not allowed.
- Always label period, unit, and category. Do not make the user infer what a number means.
- Keep real product data or honest labelled placeholders. Never invent marketing performance claims.

### Semantic score thresholds

- Daily Score good: ≥70.
- Daily Score neutral/warning: 50–69.
- Daily Score low: <50.
- Show the number in addition to color.
- Daily Score uses those semantic colors. Weekly Progress keeps its primary
  aggregate orbit accent/neutral; individual daily bars may use the same Daily
  Score thresholds.
- No additional textual score label is required for MVP. The numeric percentage
  and adjacent task/habit counts or rates provide the non-color explanation.
- Keep card backgrounds neutral.
- When explanatory copy is otherwise required, prefer a factual next step over
  punitive wording; do not introduce an additional textual score label.

### Chart language

- Bar charts: solid filled bars, 7–9 px gaps, numeric value above, period label below.
- Progress tracks: 5–6 px height, round ends, neutral track, foreground or semantic fill.
- Donut/circular form is reserved for the single primary aggregate; do not repeat small rings across every metric.
- Gridlines and axes stay subtle and use `--border` or `--muted`.
- Charts must remain readable in a static screenshot and with motion disabled.

## 10. Iconography

- Use monoline icons at 16/20/24 px with 1.6–1.8 px stroke and `currentColor`.
- Icons support an action, navigation, or state. Do not place an icon beside every heading.
- Use consistent optical padding and rounded line caps/joins.
- Unknown actions require a text label; icon-only controls require accessible names.
- Do not use emoji, multicolor icon packs, filled illustrations, or hand-drawn decorative SVGs.
- Semantic color appears only after state is known: completed, warning, destructive, or error.

## 11. Motion

### Interaction motion

- Feedback: 120–180 ms for button press, checkbox, and toggle.
- Standard transition: 200–280 ms for filters, disclosure, and panel state.
- Large layout transition: up to 600 ms only when it materially clarifies hierarchy.
- Use `--ease-standard` for entrances and state changes; `--ease-exit` for exits.
- Physical movement is restrained: button press ≤2 px; hover shift ≤3 px.

### Orbital animated accent

- Maximum one ambient animated accent per screen.
- Attach it only to the primary aggregate result, never to a decorative empty area.
- Build it from low-contrast symbols/particles and one restrained orbital line.
- Ambient cycle: 16–24 seconds. Pointer response amplitude: no more than 3%.
- The core metric, status, and explanation remain readable without animation.
- Keep motion behind the metric and away from long text, controls, faces, and dense lists.
- Do not add a second animated background, glow field, particle system, or decorative loop on the same screen.
- Under `prefers-reduced-motion: reduce`, render a static first-frame composition and reduce transitions to effectively instant.

## 12. Accessibility and interaction

- Body text contrast: at least 4.5:1. Large text and component boundaries: at least 3:1.
- All interactions work with keyboard and touch.
- Focus is always visible and never color-only.
- Controls have accessible labels; charts expose useful Russian `aria-label` summaries.
- Status is conveyed by color plus number, label, icon, or position.
- Dialogs use a real `<dialog>` or equivalent accessible modal behavior.
- Persist device-local planning state through the specified IndexedDB repository;
  never substitute prototype `localStorage` or hide required information behind
  hover.

## 13. Copy posture

- Russian is the default UI language.
- Use direct product language: “Обзор недели”, “Привычки сегодня”, “Следующий шаг”.
- Avoid unexplained metaphors such as “личная операционная система”, “орбита недели”, or “баланс фокуса” in product UI.
- Keep headings factual: a date, status, or user goal. Supporting copy may carry the atmospheric voice.
- State what changed and what to do next. Do not praise or shame the user.
- Use sentence case for product copy; reserve ALL CAPS for short system labels with tracked lettering.

## 14. Implementation contract for new screens

Every new ORBIT screen must:

1. Import `orbit-tokens.css` directly or through `life-os.css`.
2. Use only the canonical font stacks, color roles, spacing, radii, and elevations.
3. Preserve the primary/secondary/accent distinction.
4. Include `data-od-id` on major regions, headings, controls, and repeated user-targetable items.
5. Use one real responsive layout with the canonical breakpoint behavior.
6. Keep touch targets ≥44 px and prevent horizontal overflow at the required widths.
7. Use no more than one orbital motion accent and no more than two visible accent uses per viewport.
8. Use semantic colors only for real states and pair them with text or numeric information.
9. Keep user-facing copy in Russian unless a screen explicitly targets another language.
10. Verify static readability, keyboard behavior, reduced motion, and cross-screen metric consistency.

## 15. Prohibited drift

Do not introduce:

- a new brand palette, second accent hue, purple/blue trust gradient, or warm cream canvas;
- Inter, Roboto, Arial, or a decorative serif as the display face;
- rounded cards with colored left borders;
- emoji as interface icons;
- shadows on every card;
- multiple particle/glow animations on one screen;
- unexplained aggregate scores, invented metrics, or filler copy;
- a generic grid of equal KPI cards without hierarchy;
- desktop layouts merely squeezed onto mobile;
- raw hex colors in components when a semantic token exists.

## 16. Reference implementation

- `orbit-tokens.css` — executable foundations.
- `orbit-design-system.html` — living visual reference and component specimens.
- `life-os.css` — current product component implementation bound to the tokens.
- `life-os.js` — current orbital motion and product interactions.
- `weekly-dashboard.html` — canonical weekly dashboard example.
- `daily-detail.html` — canonical day-detail example.
