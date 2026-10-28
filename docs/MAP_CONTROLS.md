# History map controls

This is a viewer update only. The collector, source feeds, stored observations
and water cutover behaviour are unchanged.

## Water movement

Controls above the map select point colours and a separate comparison period:
15 minutes, 30 minutes, one hour (default), or three hours. Rising/falling is the
default. The hydrograph duration remains independent, from 15 minutes to seven days.

For each gauge at the selected historical ending time:

1. Use the last recorded observation within the chosen chart/map duration. A
   missing last value is not silently replaced with an older valid value.
2. To describe recent movement, that endpoint must be no more than one comparison
   period before the selected ending time.
3. Find the closest measurement at or before that endpoint minus the comparison
   period, accepting at most 15 extra minutes of lookback. No value is interpolated.
4. Both measured endpoints must have the same datum, with no intervening datum
   change. Without suitable endpoints, show grey: insufficient comparison data.
5. Net change is the difference between the measured heights. Rate is net change
   divided by the **actual elapsed hours**, not an assumed nominal interval.
   Full timestamps and signed change/rate are shown when selecting a gauge.

“Rising”, “falling” and “steady” describe net endpoint change, not necessarily
monotonic movement throughout the interval. No tidal identification or adjustment
is applied. Records are not altered or flagged as faulty because of movement.

Direction colours: rising red, falling blue, steady teal, insufficient data grey.
Rate colours for positive rates: up to 0.10 m/h green; >0.10–0.30 yellow;
>0.30–0.60 orange; >0.60 red. Falling is blue, steady teal, insufficient data grey.
These are initial prototype **display bands**, not official warning thresholds.
Observation-age colours remain available as a diagnostic mode; they do not prove
communications or gauge failure.

## Backgrounds

Both history views offer Street (OpenStreetMap), Greyscale (the same no-key OpenStreetMap tiles,
with a greyscale filter applied to tiles only), and Satellite + labels (Esri
World Imagery and World Boundaries and Places). Provider credits remain visible.
Switching backgrounds never fits, pans, zooms or recolours gauge observations.
The selection is remembered in browser local storage if available. Tile failures
show a status message; saved gauge points remain usable.

## Seven-day durations

Both views offer two-day, three-day and seven-day durations in addition to their
existing shorter periods. The ending time continues to bound the window; arrow
buttons step by the selected duration. Water plots every saved observation in
that window at its actual timestamp.

Rainfall totals require every quarter-hour: seven days requires 672 valid blocks.
Missing periods are not zero-filled and totals remain incomplete/grey until the
whole interval is present. The hyetograph uses the selected duration, with chart
interval choices through one day. The IFD comparison and its wettest-window
search remain limited to the 96 quarters preceding the selected ending time.
Longer chart selections do not silently expand that comparison.

PostgreSQL map totals are aggregated directly from the main readings table,
without transferring all seven-day raw readings to the browser or application.
Long-window reads have a bounded 20-second statement timeout; existing short
reads retain the usual timeout. Stored history is not changed by these reads.

## Retired pages

The original rainfall-bulletin and live water pages are removed from navigation.
`/` and `/index.html` redirect to `/history`; `/water`, `/water/` and `/water.html`
redirect to `/water-history`. Old dedicated frontend scripts/tests are removed.
Shared parsers, source APIs, collection and one-time migrations remain for the
separate maintenance review after field validation, as previously agreed.


## Compact labels and scrolling

Visible viewer names are Rainfall and Water levels; the existing URLs remain
stable for bookmarks. Water hover text contains station, level/datum and concise
movement/rate only, with no date range or tidal-adjustment note. Shaded coverage
and movement boxes above the charts are removed. Optional measured endpoint
notes remain in a collapsed Data notes section below the water plot.

Mouse-wheel/trackpad scrolling moves the page/pane rather than zooming either
map. Deliberate +/− and double-click zoom remain available. On touch devices,
one-finger gestures scroll the page by default; pinch zoom remains enabled.
Tap Move map to enable one-finger map panning, then Finish moving to return to
page scrolling. No gestures resample, modify or discard observations.

The previous CARTO greyscale endpoint is no longer requested. Greyscale needs
no API key or provider account; it has the same tile source as the existing
street map. The filter applies only to the tiles, preserving gauge colours.
