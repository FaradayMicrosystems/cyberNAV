# cyberNAV roadmap

As of 23 Nov 2026. Nothing here starts without Aurora saying go.

## Now

- **v0.0.24:** this documentation set, handover and rebuild plan.
- Decide the rebuild ([REBUILD-PLAN.md](REBUILD-PLAN.md)): full custom app without OsmAnd, or a custom UI on top of OsmAnd's engine.

## Paused (Aurora, 16 Nov 2026): own UI on OsmAnd's engine

Hide every stock OsmAnd screen and replace it with Phosphor HUD versions, keeping OsmAnd's rendering, routing, voice and offline maps. In suggested order:

1. HUD-style search (destination and stops).
2. Route card / route planner (route preview, alternatives, START).
3. Saved places (bookmarks, home / work).
4. Map downloads (by country / region, sizes, updates).
5. Settings (only what cyberNAV needs).
6. Weather (own implementation with free data such as Open-Meteo; never OsmAnd's paid plugin code).
7. Strip superfluous OsmAnd extras from menus.

If Aurora picks the "custom UI, keep the engine" reading of the rebuild, this list *is* the plan; see the comparison in [REBUILD-PLAN.md](REBUILD-PLAN.md#if-you-meant-only-the-interface).

## Housekeeping (small, any time)

- Pin and checksum the engine AARs ([KNOWN-ISSUES.md](KNOWN-ISSUES.md#3-engine-download-is-unpinned)).
- Stop the merge race in CI ([KNOWN-ISSUES.md](KNOWN-ISSUES.md#2-two-merges-close-together-share-one-release)).
- Decide the branch layout and close or merge PR #1 and PR #2.
- Private release key (needs one reinstall; best at the rebuild switch-over).

## Ideas from the concepts, not scheduled

- Sky-corridor / hover mode with altitude ladder (concept screen 2).
- Closures drawn on the map (✕ on the ground, barriers) during ROUTE OBSTRUCTED.
- Chakra Petch for headings.
- cyberNAV HUD on the Android Auto map surface.
- Boot sequence on launch (style guide `ph-boot`).

## The fallback

The earlier custom prototype (`simulator/`, `android/`, release `prototype-latest`) stays in the repo. It has its own JS routing and guidance core with 31 tests and an Android Auto app; the rebuild plan reuses its lessons and tests.
