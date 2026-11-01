# Phosphor HUD

A monochrome phosphor-CRT interface for every app Aurora wants to look retrofuturistic or 80s. One glowing colour on near-black, uppercase telemetry, clipped-corner panels, scanlines, and a boot sequence. It reads like a navigation console from a 1979 starship.

Derived from **Kerbol Scope**, the system map built in the "KSP Mission Mapper" chat. Every value here was taken from that page's code, then tidied into tokens. The map-styling section adds street-map layers for cyberNAV.

## Principles

1. **One colour, many strengths.** The whole UI is the `phosphor` colour at different strengths (`ink-soft`, `ink-muted`, `line-*`, `fill-*`). Never introduce a second UI hue. Signals (`signal-caution`, `signal-alert`) are the only exceptions, and they always come with a pattern or a word.
2. **Instrument, not website.** Panels float over a full-screen live canvas. No page scroll, no hero, no cards in a grid. The map or data view is the app.
3. **Square and cut.** `radius-none` everywhere. Floating panels get a chamfer (`chamfer-panel`) on the top-left and bottom-right corners. Circles exist only as markers and indicators (`radius-dot`).
4. **Telemetry voice.** Labels are uppercase with wide tracking. Values are tabular numbers with real units.
5. **Dark only, by choice.** There is no light theme. The "themes" in this system are phosphor colours: Nostromo green (default), Amber, Ice and White. Switching theme swaps the whole display, the way a terminal swaps phosphor.

## Colour

| Token | Use |
| --- | --- |
| `ground` | Screen background, #020503. Never pure black. |
| `panel` | Translucent HUD panel fill (84%) with a 2px backdrop blur. |
| `phosphor` | Primary text, active states, your position, the active route. |
| `ink-soft` | Prose and secondary text. |
| `ink-muted` | Captions, field labels, units. The faintest text allowed. |
| `line-strong` / `line-control` / `line` / `line-faint` | Hover borders / control borders / panel outline / dividers. |
| `fill-active`, `fill-body` | Pressed buttons; interior of large shapes. |
| `scanline` | 1px dark line every 3px over the whole screen. |
| `signal-caution`, `signal-alert` | Slow or warning; closed, failed or critical. |

**Contrast.** Every text token is 4.5:1 or better on `ground` in all four phosphors. Kerbol Scope used 45% and 28% strengths for some help text and control borders; those failed contrast, so here `ink-muted` and `line-control` are set per phosphor to pass. The source's red "Alert" phosphor is kept only as `signal-alert`: as a whole-screen colour its muted text could not reach 4.5:1.

## Typography

Two Google faces, both loaded from Google Fonts:

- **Chakra Petch** (`--font-head`): titles, captions, section heads, and prose. Squared, slightly technical.
- **Share Tech Mono** (`--font-data`): values, controls, logs, map labels. The default body face.

Rules: uppercase with tracking from 0.08em (controls) to 0.22em (boot title). Numbers always use `font-variant-numeric: tabular-nums`. Prose is the one place for sentence case, capped at 75ch. See the type styles for the full scale (34 / 24 / 22 / 16 / 13 / 12 / 11 / 10 px).

## Layout

- A full-window canvas (map, chart, plot) sits underneath at `cursor: crosshair`.
- **Top bar**: one row of essentials (app title with a small subtitle, live readout, primary controls). Everything else lives in drop-down panels opened from tool buttons on the right.
- **Floating panels** for detail. They can be dragged by their header and the map stays usable behind them. On phones they dock to the bottom at 72vh.
- **Status bar** along the bottom: scale bar, cursor position, keyboard help.
- Panels inset by `space-12` from the screen edges, plus safe-area insets.

## Components

All styles are in `components/bundle.css`, class prefix `ph-`. They are plain HTML and CSS, so they work in any framework.

- `ph-screen`: ground plus the scanline overlay.
- `ph-panel`, `ph-panel--drop`: chamfered panels; `ph-panel__head` for a draggable header with a close button.
- `ph-btn` (+ `--live`, `--alert`, `--quiet`), `ph-seg` for segmented modes. Pressed state is `aria-pressed="true"`.
- `ph-field`, `ph-input`, `ph-select`, `ph-form`.
- `ph-readout`: label/value telemetry rows on dotted rules.
- `ph-meter`: discrete level cells (signal, congestion, difficulty).
- `ph-status`, `ph-scalebar`: bottom status strip.
- `ph-log`: time-stamped events hanging off a vertical rule.
- `ph-boot`: the loading sequence.
- Map marks (canvas or SVG): see MapMarkers and MapStyle.

## Iconography

No icon font, no emoji, no illustrated icons. Use typographic glyphs and drawn geometry:

- Glyphs: `▸` go / turn / ship, `⌂` station or home, `✕` close, `❚❚` pause, `↳` child item, `⟶` and `→` direction, `·` separator, `//` section break.
- Map marks are drawn: a filled **diamond** for a point, a filled circle with an outline for an area, a **chevron** for anything that moves (with `route-glow`), a ring around a cluster, and **corner brackets** around the selected object.

## Voice

Write like a ship's console. Uppercase labels, `//` between a title and its qualifier, `·` between values, units always shown.

- Titles: `CYBERNAV // ROUTE PLOT`, `CHART DATA COMPLETE // 48 TILES`
- States: `WINDOW OPEN · CLOSES 3.2 d`, `NAV PLOT LIVE`, `ROAD CLOSED // 5TH ST`
- Prose (briefs, descriptions) is plain sentence case and short: "Heavy congestion on the bridge approach. Expect 8 extra minutes."

## Motion

- **Boot sequence** on first load: title and progress bar, a typed log (`NOW ENTERING…`, `RECEIVING CHART DATA NOW.`, `… COMPLETE`, `NAV PLOT LIVE`), map objects flickering on one by one in a set order, then the loader fades out over `dur-boot-fade`.
- Panels fade in over `dur-panel` and settle from 97% scale over `dur-pop` with `ease-pop`.
- Controls change colour over `dur-control`.
- Live indicators blink on a `dur-blink` cycle.
- The selected marker's brackets ease toward their target and breathe ±2px.
- `prefers-reduced-motion`: no scanlines, no blink, no flicker, no breathing; panels appear without transition.

## Do and don't

- Do draw maps and plots on canvas with 1px hairlines; reserve thick strokes for the route and the selection.
- Do keep one bright object on screen (your position or the selected target) with `glow-primary`.
- Don't add gradients, drop shadows, rounded corners, or a second accent hue.
- Don't use colour alone for state: pair it with a dash pattern, a cell count or a word.
