# Stable map comparison and gauge details

Rainfall, Point Rainfall IFD and Water levels use an identical desktop map frame:
184 px legend/layer rail, fixed map-heading height and fixed footer height. The
rail scrolls independently; legends and Layers do not cover geographic features.
Phone legends use the same fixed-width, scrollable drawer. Page links continue to
carry the selected group and explicit geographic viewport, including new tabs.

Desktop maps support normal dragging and mouse-wheel zoom without a lock
control. Phones use one-finger page scrolling and two-finger map pan/pinch zoom.
Expanded-map mode temporarily enables one-finger dragging on phones and restores
page-scroll behaviour on exit. Expanded desktop maps retain the fixed legend rail;
phones retain their legend drawer, including after orientation changes.

A gauge click opens `/gauge` in a new desktop tab or the same phone tab. The page
inherits the gauge identity, displayed ending time, duration and IFD mode. Its
controls are independent of the map and other gauge tabs. Map links retain the
original group, viewport, duration and ending time; phones also support browser
Back. An explicit Open in new tab link remains available on the gauge page.

Rainfall shows totals and a hyetograph; Point IFD shows estimated AEP and the IFD
comparison; water levels show the hydrograph and compatible classification lines.
Time controls request only the selected gauge series, never a group frame or all
gauge series. Completed series can serve shorter durations at the same ending
time; Refresh clears this page-local cache. Failed requests retain the previous
labelled plot, and aborted or late responses cannot replace a newer selection.

Map page navigation carries the displayed historical ending time. Point IFD
navigation defaults to wettest windows within the preceding 24 hours, including
when the source page displays several days. Water times are rounded down to the
preceding quarter-hour when entering a rainfall or IFD view.

Summary gauge links still centre/highlight the gauge without opening analysis.
Explicit viewport links (`view=keep`) take precedence. Gauge clicks leave the
source map untouched. Changing group fits the new group.

## Data and geographic loading

Completed gauge-series and Point IFD group-series responses are cached in memory
for 30 seconds, bounded to 16 URLs. Failed or unavailable responses are not cached.
Manual and scheduled refresh clear this cache; version checks still reject late
responses. Nothing adds a persistent cache for live observations.

The geographic manifest gets a content version covering all saved geographic
files. GeoJSON URLs include that version and receive one-year immutable browser
caching only when it matches the deployed geometry. The manifest, scripts and
observation APIs remain uncached. New geometry in a deployment produces a new
version; code-only deployments retain the same geometry URLs. Outdated queued
viewport requests are discarded so they cannot delay the newest requested view.

A local benchmark of `streams/152_-28.geojson` (375,314 bytes, 91 features) measured
1.5 ms JSON parsing and 33.6 ms SVG versus 73.6 ms Canvas rendering, including two
animation frames. A repeat versioned fetch transferred zero bytes. This single
local sample does not justify raster conversion; it is not a production latency
or phone benchmark. Source vector geometry, styles and zoom controls remain.
Reproduce with `TEST_BASE_URL=http://127.0.0.1:8000 node tools/benchmark_map_context.cjs`.
Recorded output is in `performance/map-context-benchmark.json`.

Production database access is not configured in the development workspace, so
production SQL latency was not measured or claimed. Existing indexed PostgreSQL
archive queries and the server's 60-second read cache remain. The new changes
reduce repeated transport and inspection work without changing observations,
classification thresholds, datum policy or IFD calculations.

## Phone lite controls

Phones do not show Find gauge, Fit gauges or Layers buttons on the map. The gauge
list and search remain below it in normal page flow. Rainfall ranks complete totals
highest first; Point IFD ranks the rarest estimated AEP first. Desktop retains its
Fit/search shortcuts and layer controls. Phones keep the compact map/time and legend
drawers, two-finger pan/pinch zoom and the expanded-map action.

## Comparison actions

Gauge-page Rainfall, Point IFD and Water level links preserve the selected analysis
ending time. Rainfall and IFD share the same gauge identity. Cross-type matching
uses exact six-digit BoM station numbers, preferring the current group when a
catalogue identity occurs in several groups. No nearest or name matching is used.
Without a verified counterpart, the destination map opens at the saved view and
selected analysis time so the user can choose a gauge.

The map pages no longer load chart libraries or create the old detail panel.
Database schema and indexes are unchanged; these changes reduce gauge-analysis
requests and do not claim to resolve the separate historical map-query bottleneck.
