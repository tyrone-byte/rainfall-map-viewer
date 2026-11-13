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

A gauge click opens a non-modal side panel on desktop and a bottom
sheet on phones. Details do not scroll the page or resize the map. The panel has
Open Water Level, Open IFD and Close details actions.
Escape closes it and restores focus. Navigation remains available while details
are open. Existing totals, hyetographs, IFD controls and source notes are reused.

A deep link targeting a gauge centres on that gauge once after its group loads;
subsequent refreshes cannot replace that focus with a whole-group fit. Explicit
viewport links (`view=keep`) take precedence, including a panel opened in a new
tab. Ordinary gauge clicks do not recenter. Changing group closes details and
fits the new group; an explicit within-group filter also fits its displayed gauges.

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

Open Water Level and Open IFD are native new-tab links, retaining explicit map
coordinates and zoom. Rainfall and IFD use the same rainfall-gauge identity.
Cross-type matching uses exact six-digit BoM station numbers only, preferring
the current group when a catalogue identity occurs in several groups. No name,
coordinate or nearest-neighbour matching is used. When no direct counterpart
exists, open the destination group/view without selecting a gauge; the user chooses.
The matching catalogue is local and involves no live BoM requests. IFD ending times
are rounded down to a saved quarter-hour boundary for water-to-IFD navigation.
