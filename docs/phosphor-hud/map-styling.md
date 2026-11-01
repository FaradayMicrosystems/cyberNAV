# Map styling (cyberNAV)

How a street map looks in Phosphor HUD. The MapStyle preview draws every layer below from its token.

## Layer order (bottom to top)

| # | Layer | Token | Stroke and pattern |
| --- | --- | --- | --- |
| 1 | Ground | `ground` | solid |
| 2 | Grid | `map-grid-minor`, `map-grid-major` | 1px; major every 10th line. Fade out above street zoom. |
| 3 | Water | `map-water` fill, `map-water-edge` | 1px edge plus 45° hatching at 8px pitch |
| 4 | Parks | `map-park` | 1px dots at 6px pitch, no fill |
| 5 | Buildings | `map-building` fill, `map-building-edge` | 1px outline; street zoom only |
| 6 | Local roads | `map-road-minor` | 1px |
| 7 | Arterials | `map-road-major` | 1.6px |
| 8 | Highways | `map-road-highway` | 2.4px; double line at street zoom |
| 9 | Traffic | `signal-caution`, `signal-alert` | slow: dashed 6/4 at 2.4px; jam or closed: round dots 1/5 at 3.4px. Free-flowing roads get no overlay. |
| 10 | Alternative routes | `map-route-alt` | 1.3px dashed 4/5 |
| 11 | Active route | `map-route` + `route-glow` | 2.6px solid with glow |
| 12 | Markers | `phosphor` | diamonds, chevron for you, brackets for the selection |
| 13 | Labels | `map-label`; selected label `phosphor` | Share Tech Mono 11px, uppercase |

## Rules

- Traffic is told apart by **pattern first**, colour second, so it still reads in the Amber phosphor and for colour-blind drivers.
- Only the active route and your position glow.
- Satellite or terrain imagery, when shown, is converted to the phosphor: greyscale, then tinted with `phosphor` at low strength, under the scanlines.
- Turn-by-turn instructions live in a floating panel at the top-left: a `cap` distance line, a `readout-big` instruction with a `▸` glyph, and an arrival line.
