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
