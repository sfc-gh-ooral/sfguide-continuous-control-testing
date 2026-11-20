# Design: Tallyward (Continuous Control Testing)

This file sets the look of the app and the landing page. Tailwind tokens in `app/globals.css` come from it.

## Brand

- **Name:** Tallyward, "continuous control assurance". A coined name (tally + ward): it counts every record and keeps watch. It is fictional, and so is the bank in the data, Northwind Financial.
- **Audience:** second-line risk and internal audit teams at a bank. They read evidence all day, distrust gloss, and need to defend every number to an examiner.
- **Voice:** an audit workpaper, not a marketing page. Short, factual, specific. State the count, the period and the source. Never "AI-powered magic"; say what ran and what a person must still approve.
- **Logo mark** (inline SVG, 24×24): a rounded square in ink with a vermilion check mark crossing three tally strokes.

```svg
<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="5" fill="#1B1F27"/>
<path d="M7 6v12M11 6v12M15 6v12" stroke="#F3F1EA" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
<path d="M5.5 13.2l3.6 3.4L18.8 7" fill="none" stroke="#E4572E" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
```

## Direction: "the workpaper"

The product borrows from the physical audit file: graph paper, tick marks, a red reviewer's pen and stamped dispositions. It should feel precise and calm, with color reserved for meaning.

### Palette

| Token | Light | Dark ("night shift") | Use |
| --- | --- | --- | --- |
| `paper` | `#F3F1EA` | `#12141A` | Page background, with a faint 24 px grid |
| `sheet` | `#FFFFFF` | `#1A1D25` | Cards and tables |
| `ink` | `#1B1F27` | `#E9E7E0` | Text, logo square, primary buttons |
| `muted` | `#5D6370` | `#9AA0AC` | Secondary text (AA on both `paper` and `sheet`) |
| `rule` | `#DAD6CB` | `#2B2F3A` | Borders, grid lines |
| `pen` (vermilion) | `#B0391B` | `#F0714C` | Brand accent, true issues, failures, focus ring |
| `tick` (green) | `#1E7A4F` | `#4CC38A` | Pass, approved |
| `feed` (cobalt) | `#2F55C9` | `#7D9BFF` | Data issues and data-quality (DMF) signals |
| `waive` (ochre) | `#845A00` | `#E2B341` | Accepted risk, warnings, "Sample" badge |
| `ai` (plum) | `#6B3FA0` | `#B593E8` | AI output panels and "Sample AI response" labels |

Every text/background pair used was checked for at least WCAG AA (4.5:1 for body text). The accents are darkened in light mode so they work as text.

### Typography

- **IBM Plex Sans** for UI text, **IBM Plex Sans Condensed** (600) for headings and KPI figures, **IBM Plex Mono** for IDs, SQL, query IDs and counts in tables. Self-hosted via `next/font` at build time; no CDN at runtime.
- Tabular figures everywhere numbers line up.

### Layout model

- **Top bar, no sidebar.** Logo and product name on the left, five section tabs in the middle, then a role chip ("Control tester · 2nd line"), the Sample/Live environment badge and a theme toggle.
- **Period ribbon** under the top bar: January–October 2026 as ten cells, each with a micro bar of that month's exception count. It is the pack's signature element and makes the August spike visible from every screen.
- Content on a 12-column grid, max width 1320 px. On phones the tabs collapse into a horizontal scroller and the ribbon scrolls sideways inside itself (never the page).
- **Detail drawers** slide in from the right for an exception or a ticket, so the queue stays in view.

### Density

Medium-dense, like a good audit tool: 13–14 px table text, 36 px rows, sticky table headers. KPI tiles carry a figure, a delta and a sparkline.

### Charts

- Recharts, flat fills, 1 px rules, no gradients inside bars. Tooltips on a `sheet` card with a 1 px `rule` border.
- Signature chart: a **coverage heatmap** (controls × months) where cell intensity is the exception count and a cobalt corner tick marks months with a feed-quality anomaly.
- "Sample vs. population" bar pair on the coverage screen; DMF null-rate bars per feed batch on the exception drawer, with the baseline as a dashed line.

### Motion

- 150–200 ms ease-out for hover, tabs and drawers; counters animate once on first view; skeleton shimmer while loading.
- AI panels show staged reasoning steps with a moving tick, then a streaming text reveal. Respect `prefers-reduced-motion` (no counters, no shimmer, instant reveal).
- Dispositions land as a small "stamp" (rotated, outlined label) on the row.

## How it differs from the other packs

Looked at the landing pages and Try apps of Odometer (auto-finance portfolio), Credit Risk Model Studio, Loss Triangle Analysis, Workforce Intelligence, Cyber Risk Copilot, Merchant Risk, the card fraud console and the KYC workbench, plus the older shared template.

| Seen elsewhere | Avoided here |
| --- | --- |
| Left sidebar navigation (Odometer, Loss Triangles, Workforce, Cyber) | Top bar with tabs plus the period ribbon |
| Cream background with a large serif headline (Odometer, Workforce, Credit Risk) | Grid-paper background, condensed sans headline, no serif |
| Deep purple gradient hero (Loss Triangles) and dark slate with coral/mint (Credit Risk) | Light workpaper first; dark mode is a neutral graphite, no gradients |
| Teal/green brand (Odometer), violet (Workforce), default blue (Cyber, Merchant Risk) | Ink + vermilion brand; color only carries meaning (issue, data, waived, AI) |
| Amber "sample" chips on the shared template | Ochre badge styled as a rubber stamp |
| Hero with a floating product screenshot | Hero built from a live-looking "population counter" and a tick-mark ledger strip, screenshots below in a workpaper frame |

## Landing page (`docs/index.html`)

Same tokens and logo. Hero: problem-first headline ("Quarterly samples miss what the full population shows"), the October comparison (1,930 records tested in full vs. 230 in the old quarterly samples) drawn as two ledger strips (numbers taken from the synthetic data), and two buttons (Try the example, View the repository). Then the five-step story as numbered workpaper tabs, captioned screenshots, how it runs on Snowflake, requirements, cost, disclaimer. Dark mode via `prefers-color-scheme`. No external scripts or fonts.
