# Viewer UX review and map context

## Scope and evidence

Reviewed Rainfall, Water levels and Point Rainfall IFD through group selection,
time/duration changes, gauge selection, chart access, return navigation,
map-context loading and failure, phone touch gestures, keyboard focus and expanded
map use. Existing Dams interaction tests remain part of regression validation.

Compared the previous committed viewer with the changed viewer at **390 × 844**
and **320 × 568** phone sizes and **1440 × 1000** desktop. Measurements below use
the same deterministic test observations, a stale-data scenario and browser
layout bounds; they are not production analytics or user-research findings.
Screenshots/measurements were also captured outside the repository under
`/workspace/ux-review`. Live external basemap tile availability is not established
by these tests; the local viewer's basemap-failure state was exercised.

| Page at 390 × 844 | Previous map top | Revised map top | Previous map height | Revised map height |
| --- | ---: | ---: | ---: | ---: |
| Rainfall | 794 px | about 263 px | 400 px | 557 px |
| Water levels | 913 px | about 263 px | 400 px | 557 px |
| Point Rainfall IFD | 1,002 px | about 300 px | 400 px | 557 px |

The old water/IFD maps started below the initial phone viewport. The new layouts
expose most of the map immediately. At 320 × 568, the rainfall map moved from
868 px down the page to about 263 px. Desktop panes retain their existing size
and independent scrolling; the representative desktop map remained 485 px tall.
These measures vary with text, source freshness, device fonts and viewport size.

## Changes implemented

1. **Map visibility — high priority.** Time controls previously occupied several
   hundred pixels before the map. On phones they now start collapsed in a
   labelled **Time & display** disclosure that summarises the selected duration
   and water colour mode. Display selectors move into that disclosure on phones
   and return beside the map on desktop. Inputs and selected values are preserved
   through resizing; controls are not duplicated.
2. **Map space — high priority.** Phone maps use 66% of the small viewport height
   (minimum 400 px, maximum 680 px). The legend starts collapsed on phones,
   remains open on desktop, and can be expanded when needed. Long explanatory
   text no longer permanently covers the map. Header date prefixes and the
   refresh button's visible text are compacted on phones while preserving the
   accessible refresh name, full-date tooltip and explicit stale-data badge.
3. **Expanded viewing — high priority.** **Expand map** provides a near-full-screen
   map without relying on browser Fullscreen API support. The selected period
   stays visible in a caption. Expanded mode enables map panning, traps keyboard
   tab focus, makes surrounding controls inert and exits via a visible button or
   Escape. Prior panning/overflow/focus state is restored. Normal phone mode
   retains page scrolling over the map, explicit Move map and pinch zoom.
4. **Navigation duplication — medium priority.** Removed **Choose another group**
   from all three viewer pages. Re-clicking the active page tab clears the current
   selection and returns to the group chooser, without a full reload. Modified
   clicks retain normal browser link behaviour. The group title receives focus
   for keyboard users; the page tab stays reachable in a horizontally scrolling
   phone navigation bar.
5. **Geographic orientation — high priority.** Shared water-plan outlines appear
   from zoom 9, saved named rivers/larger creeks from zoom 11, and limited,
   deduplicated river labels from zoom 13. These layers sit below gauges and use
   muted colours independent of observation colours. The **Layers** control lets
   users toggle either layer, remembers that preference between pages, explains
   coverage limits and provides a retry action after failures. Context failure
   does not prevent selecting gauges or viewing observations.
6. **Loading cost — medium priority.** A small index selects only source files
   intersecting the viewport. File requests use bounded concurrency, a bounded
   cache and a 32-file visible limit. Wide views prompt closer zoom for omitted
   detail. No browser request is made to QSpatial, ARR or a new remote GIS service.

## Geographic sources and limitations

The builder `tools/build_map_context.py` uses the existing supplied
`data/dams/water-plan-source.zip` and prepared `public/dam-watercourses/*.geojson`.
There are **187 current water-plan polygons**, **343 distinct watercourse names**
and **41 one-degree stream tiles**. The original watercourse ZIP is not retained
in this repository; these saved Dams extracts do **not** establish complete
statewide stream coverage. Empty stream areas mean no saved coverage, not no
streams. Unnamed tributaries and gullies remain omitted, as on Dams.

Water-plan areas include administrative catchment/subcatchment context. They are
**not verified upstream contributing catchments for a selected gauge**. No gauge
membership, observation, drainage area or IFD assignment is changed by these
layers. Original Dams files are unchanged. Source hashes, attribution and CC BY
4.0 licensing are recorded in `public/map-context/index.json` and on the map.

The builder needs `pyogrio`, `pyproj` and `shapely` offline; the running app needs
no new Python or npm dependencies. Regenerate with:

```sh
/workspace/rainfall-venv/bin/python tools/build_map_context.py
```

## Further recommendations, in priority order

| Priority | Finding | Recommended next change | Why it helps |
| --- | --- | --- | --- |
| High | Selecting a phone gauge still jumps to the plots, moving the map out of view. | Show a compact gauge preview first, with explicit **View plots** and **Keep exploring map** actions. | Preserves geographic context and avoids unexpected page movement. |
| High | Find gauge jumps below the entire plots section. | Use a searchable gauge drawer or sheet over the map, with a clear close action. | Makes finding a gauge faster without long page travel. |
| High | Stream coverage is partial; visible water-plan areas can be mistaken for upstream gauge catchments. | Obtain a complete licensed stream network and verified drainage polygons before offering upstream-catchment highlighting. | Avoids a false impression of geographic completeness or hydrological membership. |
| Medium | A user may overlook the distinction between selected time and newest saved data, especially while browsing older events. | Add a compact persistent **Historical selection / Latest saved** chip, including selected date, to the map header and expanded caption. | Reduces interpretation errors while keeping the controls closed. |
| Medium | Colour meanings differ across Rainfall, IFD, water movement, rate and age. | Keep a one-line active colour-mode caption visible and offer textual/icon equivalents in a gauge preview; validate palettes with colour-vision simulations. | Improves interpretation without relying solely on colour. Existing text labels and water symbols help, but a full accessibility audit remains needed. |
| Medium | Basin labels and data notes are lengthy, and phone users must navigate a horizontal page tab strip. | Test shorter user-facing group names, a group search, and a clearly labelled **Views** menu on very small phones. | Helps first-time users discover views and groups without removing detailed provenance. |
| Medium | Time state currently uses replaceState; Back does not retrace group/time selections. | Define deliberate browser-history behaviour and add a share/copy-current-view action. | Makes recovery, bookmarking and collaboration more predictable. |
| Medium | Charts and source/QA notes create long detail sections on phones. | Put the selected gauge summary first, then offer plot tabs or collapsible data/source notes while preserving comparison access. | Reduces scrolling and prioritises the main questions: where, when and how much. |
| Medium | No measured production performance budget is available. | Measure map readiness and interaction latency on a mid-range phone and slow connection; consider finer vector tiles or compressed static assets if context payloads dominate. | Screenshots and local timing do not establish production performance. |
| Low | Hover information is inherently desktop-oriented. | Make the same gauge summary available with a single tap and keyboard focus. | Ensures touch and keyboard users have an equivalent to hover labels. |

## Validation and limits

Automated checks cover manifest file/bounds integrity, viewport and zoom loading,
layer toggles, named labels, context failures, mobile map visibility, collapsed
controls/legend, expanded-map focus/Escape, active-tab return, touch panning/pinch,
original duration/colour controls and chart selection. Existing application suites
are also run to check shared behaviour.

This is an engineering heuristic review, not moderated usability research, a
formal WCAG conformance audit, a hydrological certification or production-load
test. Next useful user testing: ask a phone user to find a gauge, select a past
window, identify the active colour meaning and return to another group without
prompting; record completion time and wrong turns.

Validation outcome: 96 Python tests passed, one optional PostgreSQL integration
test skipped, and 14 JavaScript calculation tests passed. The full browser suite
passed 63 tests; the 10 affected context/water interaction tests were rerun after
the final expanded-map and status-message adjustments and also passed.
