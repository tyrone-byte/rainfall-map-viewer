# Time slider and rainfall accumulation

The **Rainfall history** tab at `/history` reads the saved PostgreSQL archive.
The original rainfall bulletin remains at `/`; water-level views remain unchanged.
Both rainfall pages use the same general design and share the map viewport with
the water page. Moving a time slider or changing accumulation does not refit or
zoom the map. The explicit **Fit gauges** button remains available.

## Controls

- **Observation ending time:** slider in 15-minute steps, previous/next buttons stepping by rainfall duration,
  and a date/time picker explicitly labelled Brisbane AEST. Its range is the
  first through last quarter-hour timestamp actually present in the archive.
- **Rainfall duration:** 15 or 30 minutes, or 1, 3, 6, 12 or 24 hours. Each
  map total and hyetograph cover the same rolling window ending at the selected timestamp. The default
  is 3 hours to preserve a familiar scale; windows need not align to bulletin
  boundaries such as 09:00 or 12:00.
- **Latest saved:** follows the newest saved ending time as the page checks each
  minute. Moving the slider pauses that following behavior. Clicking Latest
  resumes it. No browser request starts a new BoM collection job.
- **Chart interval:** groups the selected-duration hyetograph into 15-minute,
  30-minute, hourly or three-hour bars. It does not change map totals or the IFD
  observation resolution. Chart interval survives duration/time changes when it fits the window. Options longer than the window are excluded; an incompatible interval is reduced to the largest available interval.

The selected map window, colour legend, station ranking, filters and selected
total update together. Editable display thresholds are absolute millimetres for
the selected window, not rates and not official warning thresholds. A grey gauge
means incomplete quarter-hour coverage or unresolved identity, never measured zero.
Original values and BoM quality codes remain preserved; numeric availability is
not certification of the measurements' quality.

The URL retains the chosen accumulation, selected station and a paused ending
time, so the historical selection can be bookmarked/shared. The date/time picker
interprets entered values in AEST regardless of the browser's local timezone.

## Data rules

Every required quarter-hour must be present and numeric. Missing/null quarters
produce **Incomplete** instead of zero or a complete partial sum. Neither hourly
nor three-hour bulletin totals fill gaps. Unknown station IDs are not guessed.
Map coordinates come from the separate audited live BoM map identities. Gauges
whose coordinates/identity remain unresolved stay in the list without an invented
map location. Local IFD references can retain their saved catalogue coordinate key
only when the catalogue and audited map agree on the exact station number.

The station chart and table show the selected rainfall duration ending at the selected
time, independent of the first stored observation. Missing bars remain gaps, including periods before collection began. A
grouped bar is complete only when every constituent quarter-hour is complete.
The table stays chronological and initially scrolls to its newest rows.

The historical IFD comparison uses the native quarter-hour series, with observed
durations from 15 minutes through 24 hours. Its latest mode ends at the selected
time; its wettest mode examines complete, quarter-hour-aligned windows within
the preceding 24 hours, labelled “Wettest windows in preceding 24 hours”. Map accumulation and chart-bar grouping do not change
these calculations. Design curves remain the supplied full-duration references;
durations below 15 minutes have no reconstructed observations. The original
bulletin page's IFD still uses native three-hour data and retains its previous
behavior. No AEP is assigned automatically to the storm.

## Deployment

Deploy the latest GitHub commit on **rainfall-map-viewer**, the existing web
service, then open **Rainfall history**. The existing `HISTORY_DATABASE_URL` (or
supported `DATABASE_URL` fallback) is reused. No new environment variables,
database, collector deployment or paid resources are needed. Do not re-add the
event-import key for this feature. The existing collector continues independently.

The archive remains read-only to this application. Bounded quarter-hour windows
are queried using parameterized SQL, cached for up to one minute, and the shared
cache is capped at 128 entries. Connection/statement timeouts remain in force.
An unavailable archive is explicitly reported; it never silently substitutes a
bulletin or fabricated values. During a failed/slow selection, the previous map
keeps its earlier window label. Stale responses from older slider/gauge requests
are aborted/ignored. The freshness indicator describes the newest archived
period and collection status separately from the historical time being viewed.

## Validation

Tests cover rolling-window boundaries, complete versus missing quarters, valid
zeros, rejection of unsupported/out-of-range/non-quarter-hour times, unresolved
station identities, and native quarter-hour IFD windows. Browser checks cover
ranking/colour updates, fixed zoom, independent bar grouping, missing IFD data,
archive failure and mobile layout. Existing rainfall/water/IFD browser checks
also pass. A real PostgreSQL read test used the preserved event observations;
frame and series queries left stored records unchanged and ran read-only.
