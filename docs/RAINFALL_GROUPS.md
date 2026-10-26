# Rainfall history basin selection

The history page opens with the 12 groups from BoM's Queensland rainfall and
river observations page. No gauge markers or historical rainfall queries are
loaded until a group is selected. Selecting a group fits the map to its verified
locations. Users can return to the full list using “Choose another group”.

`data/rainfall-groups.json` is a separate station/membership catalogue, verified
against the 12 three-hour bulletins on 26 October 2026. Bulletin observations
are not imported by this change. Actual plotted depths and charts continue to
use our stored quarter-hour readings. Unreported gauges stay visible with
incomplete totals; unresolved coordinates remain unplotted. The original
Brisbane row IDs and audited coordinates are preserved.

The catalogue contains 2,007 bulletin entries, including 1,331 verified map
locations. These are bulletin entries, not a count of unique reporting sensors.
Name matches for additional stations are exact matches against the existing
audited BoM coordinate catalogue. No fuzzy matches or inferred coordinates.

To refresh membership manually, run `python3 tools/build_rainfall_groups.py`.
This reads each of 12 bulletins once, sequentially, and writes metadata only.
Review the resulting catalogue before publishing. It is not run per visitor or
on the collector schedule. Updating the viewer requires deploying the web
service; no collector or database configuration change is required.

Group links retain selected basin, rainfall duration, ending time and gauge.
Within-group catchment filtering, duration controls and independent pane
scrolling remain available. Queries for selected groups read only the relevant
station identities. This change does not alter the separate water-level page.

Compact PostgreSQL history reads use `history_readings` directly. Time bounds
use two ordered index reads; map totals and gauge series fetch only the needed
periods. Station labels are read separately from the small station-ID catalogue,
without joining the observation query to the compatibility view. This is a
reader-only change; collection and stored readings are unchanged. Failed reads
log only an error category and SQLSTATE, and are cached for three seconds rather
than a minute. The UI distinguishes a query timeout from an empty archive.

## Latest 24-hour group summaries

Rainfall history defaults to a 24-hour duration. The group landing page also
summarises the latest saved 24-hour period, independently of bookmarked map
windows. Highest rainfall is the maximum complete gauge total, never a sum of
rain depths across gauges. Widespread rainfall means the percentage of complete
gauges recording greater than zero, not geographic area or an estimate for
unreported gauges. Station IDs are deduplicated within each basin. Incomplete
24-hour records are excluded and the eligible/identified counts are displayed.
A group with no eligible gauges displays no ranking. Ties share the highlight.

## Saved water-level history

`/water-history` uses the same database URL as rainfall history. No new collector,
service, database or migration is required. Its catalogue is maintained separately
in `data/water-groups.json`, built from the same 12 BoM water bulletins, matching
coordinates by exact official station numbers. Run the manual metadata refresh
with `python3 tools/build_water_groups.py`. Current bulletin heights are not
imported or used as substitutes for saved history by the viewer.

A basin must be selected first. History duration defaults to 24 hours with the
same 15-minute through 24-hour choices as rainfall. The ending time is Brisbane
AEST, and arrows step by the chosen duration. The map shows each station's last
observation in that window, never a future reading or a reading before the window.
The hydrograph shows all stored observations within the same window at their
actual timestamps. Water heights are never accumulated, averaged or resampled.
Missing values break the plot. Gaps longer than 60 minutes use dashed connections between the saved endpoints; no observations are added. Lines are the default; “Show recorded points” reveals actual numeric samples and persists across gauge/time changes within the page. Datum changes have separate
labelled series. Negative heights and measured zero remain valid values.

Marker age is relative to the selected historical ending time: under 60 minutes
is green, 60 minutes to under six hours amber, and six hours or missing grey.
These are age flags, not historical BoM flood classifications or equipment-failure
assertions. Flood classifications have not been archived, so none are inferred.
The independent sidebar/workspace scrolling follows rainfall history.

Long intervals between saved water observations are not a communications heartbeat or proof of failure. Gauges may report on level changes or remain dry. Points represent saved observations, not every collector poll. Gauge-specific reporting expectations are not currently known.
