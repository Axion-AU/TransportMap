---
name: Transport Score
description: Fusion Party's address-level public transport score, presented like an evidentiary ledger, not a SaaS dashboard.
colors:
  purple-900: "#1A0029"
  surface-raised: "#2E004D"
  fusion-purple: "#5C006B"
  magenta: "#D428D4"
  violet: "#7B3FE4"
  blue: "#4A7AEB"
  cyan: "#0BB8D4"
  teal: "#00DDB8"
  band-stranded: "#D428D4"
  band-poor: "#E4573F"
  band-patchy: "#E8A33D"
  band-decent: "#4A7AEB"
  band-good: "#00DDB8"
  ink: "#FFFFFF"
  ink-soft: "rgba(255,255,255,0.72)"
  ink-faint: "rgba(255,255,255,0.45)"
  border-subtle: "rgba(255,255,255,0.10)"
  border-strong: "rgba(255,255,255,0.20)"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(2rem, 5vw, 4rem)"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "-0.02em"
  overline:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.08em"
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "Space Mono, ui-monospace, monospace"
    fontWeight: 700
rounded:
  sm: "2px"
  md: "4px"
components:
  button-primary:
    backgroundColor: "{colors.magenta}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px 32px"
  button-primary-hover:
    backgroundColor: "{colors.magenta}"
  input-field:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
---

# Design System: Transport Score

## 1. Overview

**Creative North Star: "The Ledger of Neglect"**

This is a system built to present an accusation as an accounting entry: cold, sourced, and impossible to wave away. The dark violet-black base isn't mood lighting, it's the colour of a night shift newsroom producing a document that will be read in daylight and checked against primary sources. Every number that appears on it, a score, a headway in minutes, a dollar figure, is set in a mono data face so it reads as measured, not asserted. The single spectrum of accent hues (magenta through teal) exists so the system can carry five distinct data states (score bands) and one unmistakable call to action without inventing a second, incompatible palette, one accent per zone, never blended for decoration.

The system explicitly rejects the look of a government PDF report or civic dashboard (no grey chrome, no boxed KPI tiles, no bureaucratic flatness), the look of a generic SaaS marketing site (no gradient-hero, no identical icon-card grids), and the stock-photo, committee-designed look of major party websites. Near-sharp 4px corners replace the soft, friendly rounding of consumer software on purpose: this is a document, not an app trying to be liked.

**Key Characteristics:**
- Dark violet-black base (`#1A0029`) throughout; no light theme.
- One accent spectrum (magenta → violet → blue → cyan → teal) shared by CTAs, links, and score-band data, never introduced as a second, unrelated palette.
- Near-sharp corners (2-4px) on every surface; nothing pill-shaped or heavily rounded.
- Condensed, uppercase, heavy display type for headlines; a dedicated mono face for every number.
- Flat by default; depth is reserved for floating overlays and the one CTA glow.

## 2. Colors

The palette is a single continuous spectrum split across five roles (three surface tones, five accent hues, five band hues that reuse the accent set), never a second unrelated palette bolted on for decoration.

### Primary
- **Insurgent Magenta** (`#D428D4`): the primary CTA colour (Join Fusion), the "stranded" score band, and live/emphasis data. Reserved almost entirely for the one action the site wants taken.

### Secondary
- **Signal Violet** (`#7B3FE4`): secondary interactive state and the focus ring (`:focus-visible` outline). Marks "you can act here" without competing with magenta's "act now."
- **Ledger Blue** (`#4A7AEB`): links and neutral data (the "decent" score band). The calmest hue in the spectrum, used for wayfinding rather than urgency.

### Tertiary
- **Evidence Cyan** (`#0BB8D4`): secondary highlight and positive-data accent, used sparingly against blue and teal so it reads as a highlight, not a fourth competing brand colour.
- **Verified Teal** (`#00DDB8`): the "good" score band and success/positive data state. The spectrum's resolution point, what the ledger looks like when the numbers are actually fine.

### Neutral
- **Void Purple** (`#1A0029`): the page background. Every other surface sits on top of this.
- **Raised Purple** (`#2E004D`): cards, popovers, and the surface-raised layer that lifts content off the void without using a shadow.
- **Brand Purple** (`#5C006B`): feature cards, quote blocks, and duotone treatments; the identity colour reserved for moments that should read as "party brand," not "data."
- **Paper White** (`#FFFFFF` at full, 72%, and 45% opacity): ink, soft ink, and faint ink. Never a grey; dimming is done by opacity against the purple base so text always keeps the system's hue.
- **Translucent Borders** (`rgba(255,255,255,0.10)` / `0.20`): subtle and strong dividers. Always translucent white against the purple base, never a flat grey stroke.

### Named Rules
**The One Spectrum Rule.** CTAs, links, and score-band data all draw from the same five-hue spectrum (magenta → violet → blue → cyan → teal). A new feature never introduces a colour outside this set; if a sixth state is needed, it's expressed as a shade or opacity of an existing hue, not a new hue.

**The Warm-Poor, Cool-Good Rule.** Score bands run warm-to-cool as they improve: stranded (magenta) and poor (`#E4573F` orange-red) read as alarm; patchy (`#E8A33D` amber) is the pivot; decent (blue) and good (teal) read as resolution. A band colour is never reassigned outside this temperature logic.

## 3. Typography

**Display Font:** Barlow Condensed (with Arial Narrow, sans-serif fallback)
**Body Font:** Barlow (with system-ui, sans-serif fallback)
**Label/Mono Font:** Space Mono (with ui-monospace, monospace fallback)

**Character:** A condensed, heavyweight display face reads as a headline stamped onto a report, while the plain Barlow body keeps prose legible for a reader who isn't comfortable with statistics. Space Mono marks the boundary between "written claim" and "measured number" at a glance.

### Hierarchy
- **Display** (900 weight, `clamp(2rem, 5vw, 4rem)`, 0.92 line-height, uppercase, -0.02em tracking): page and section headlines (`.type-display`). Always uppercase; this is the one place the system allows itself to shout.
- **Overline** (600 weight, 0.75rem, 0.08em tracking, uppercase): section labels and legend headers (`.type-overline`). Used for wayfinding, not for emphasis.
- **Body** (400 weight, 1rem, 1.5 line-height): all prose. Cap measure at 65-75ch in long-form copy (methodology, CTA body text) so it stays readable at the reading distance a phone implies.
- **Data** (700 weight, mono, `.type-data`): every score, headway, dollar figure, and count. Never used for prose, even short prose.

### Named Rules
**The Numbers-Are-Mono Rule.** Any figure that represents a measured or sourced value (a score, a fare, a frequency, a dwelling count) is set in Space Mono. If it's in Barlow, it's a claim; if it's in Space Mono, it's a measurement.

## 4. Elevation

Flat by default: the void-purple base and raised-purple surface layer create depth through colour, not shadow, so most of the site (cards, sections, the CTA panel) has no box-shadow at all. Shadows and blur are reserved for UI that floats over other content, the address search bar and the map legend both sit on top of the live map, so they get `backdrop-blur` plus a heavy shadow to read as physically separate from what's underneath. The one glow in the entire system is reserved for the primary conversion action.

### Shadow Vocabulary
- **Floating overlay** (`shadow-lg` / `shadow-2xl` combined with `backdrop-blur-md` and `bg-surface-raised/90-95`): address search bar, map legend, popovers, dropdown results. Used only when the element floats over map or page content it needs visual separation from.
- **CTA glow** (`.cta-glow`, `box-shadow: 0 0 24px rgba(212, 40, 212, 0.35)`): the Join Fusion button only. The single permitted glow in the system.

### Named Rules
**The One Glow Rule.** `.cta-glow` exists on exactly one class of element, the primary Join CTA. No other button, card, or badge may take a glow; introducing a second glow dilutes the one visual signal that says "this is the action."

## 5. Components

### Buttons
- **Shape:** near-sharp corners (`rounded-[4px]`, `--radius-md`). No pill buttons anywhere in the system.
- **Primary:** solid Insurgent Magenta fill, white text, generous padding (`px-8 py-4` for hero CTAs), paired with `.cta-glow`. This is the only button that glows.
- **Hover / Focus:** `.pressable` (brightness(1.12) on hover, scale(0.97) on active) plus the shared `:focus-visible` outline (2px Signal Violet, 3px offset). No colour-swap hovers; brightness and scale carry the feedback.
- **Ghost / link-style:** text-only links in Ledger Blue with `hover:brightness-125`, used for footer navigation and inline references rather than for primary actions.

### Cards / Containers
- **Corner Style:** 4px radius, matching buttons and inputs; the system never mixes radii.
- **Background:** Raised Purple (`#2E004D`) on the Void Purple page background, or Brand Purple (`#5C006B`) for the identity-flagged Join CTA panel.
- **Shadow Strategy:** none at rest (see Elevation); depth comes from the surface-raised/void-purple contrast, not a shadow.
- **Border:** 1px `border-border-strong` (20% white) is the default container border; `border-border-subtle` (10% white) divides content within a card.

### Inputs / Fields
- **Style:** Raised Purple background at 90% opacity with `backdrop-blur-md`, 4px radius, `border-border-strong`, placeholder text at ink-faint opacity.
- **Focus:** a 2px Signal Violet ring (`focus:ring-2 focus:ring-violet`), no border colour change, keeping focus state consistent with the system-wide `:focus-visible` treatment.

### Navigation
- **Style:** footer and in-page navigation are plain text links in Ledger Blue with `hover:brightness-125`, set in body type, never boxed or pill-shaped. The footer's `.spectrum-line` (a 1px five-hue gradient rule) marks the boundary between page content and the compliance/navigation footer, reserved for that one identity moment.

### Legend / Data Readout (signature component)
The map legend and score breakdowns pair an `.type-overline` label with a `.type-data` mono value and a small solid swatch in the relevant band colour. This label-plus-swatch-plus-mono-number pattern is the system's signature way of presenting a measured claim, and should be reused anywhere a score or sub-score needs to be shown inline rather than inventing a new stat-tile pattern.

## 6. Do's and Don'ts

### Do:
- **Do** keep every score, fare, frequency, and count in Space Mono (`.type-data`); it's how the system marks "measured," not "claimed."
- **Do** keep corners at 2-4px everywhere; buttons, cards, and inputs all share the same near-sharp radius.
- **Do** reserve `.cta-glow` for the single Join Fusion button; nothing else glows.
- **Do** run score-band colour warm-to-cool as bands improve (magenta/red-orange → amber → blue → teal); never reassign a band colour outside that temperature order.
- **Do** use `backdrop-blur` plus shadow only for UI that floats over the map or other content; every other surface stays flat.

### Don't:
- **Don't** build a generic government PDF report or civic Tableau-style dashboard: no grey chrome, no boxed KPI tiles, no bureaucratic flatness.
- **Don't** build a generic SaaS product site: no gradient-hero, no identical icon-card grids, no corporate-startup visual grammar.
- **Don't** imitate the stock-photo, primary-colour, committee-designed look of major Australian party websites.
- **Don't** introduce a second, unrelated colour palette; every accent must come from the existing five-hue spectrum.
- **Don't** round corners past 4px or use pill shapes; that softness reads as consumer app, not evidentiary document.
- **Don't** add a second glow anywhere in the system; it dilutes the one signal that says "this is the action."
- **Don't** set a score, price, or measured figure in Barlow; if it's a number that was measured or sourced, it belongs in Space Mono.
