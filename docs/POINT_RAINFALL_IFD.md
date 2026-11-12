# Point Rainfall IFD page

`/point-ifd` maps estimated point rainfall AEPs using saved 15-minute observations
and assigned default current 2030 regional centroid references. It does not
request ARR data or initiate collection. Other viewer pages retain their rainfall
and water-level colour modes.

## Modes

**Wettest windows in preceding 24 hours** is the default. For each gauge, find
the wettest complete native-quarter-hour window for each duration of 15, 30,
45, …, 1,440 minutes. Compare each duration's depth against its assigned IFD and
select the rarest (lowest) estimated AEP. This is not necessarily the largest
rainfall depth or the same duration/window for every gauge. Only windows ending
within, and wholly contained in, the 24 hours preceding the selected ending time
are considered. No sub-quarter-hour observation is reconstructed. The duration
control is disabled in this mode because all 96 durations are assessed.

**Ending at selected time** compares only the user-selected duration ending at
the selected time. Standard durations are offered from 15 minutes through 24
hours. The gauge detail's **Use this window** action sets the duration and ending
time that generated the wettest-mode estimate, then switches to ending mode.
It adds a duration option when the controlling duration is not a standard menu
option. Users can then explore other durations and ending times. URLs preserve
the group, mode, duration, selected time and gauge.

Selecting a gauge keeps the chronological hyetograph and IFD plot below the map.
The controlling duration is marked on the observed IFD curve. Hyetograph totals
always describe their labelled time span, not the maximum sub-window. In wettest
mode the hyetograph shows the full preceding 24 hours; in ending mode it shows
the selected duration. The comparison plot remains bounded to the preceding 24
hours in both modes. Changing its observation mode also changes the map mode.

## Estimation and limits

Supplied table depths/AEPs are used exactly at matching rows/columns. For durations
between rows, design depth is interpolated linearly in log(duration)-log(depth).
For observed depths between AEP columns, AEP is interpolated linearly in
log(depth)-log(AEP). Values beyond the table's range are shown as `>maximum%` or
`<minimum%`; no probabilities are extrapolated. Inconsistent curves, invalid
values, missing assigned default tables and unavailable reference files do not
produce estimates. There is no automatic Brisbane or climate-scenario fallback
on this page. The original rainfall viewer keeps its existing reference policy.

For equally bounded results below the rarest supplied AEP, the window with the
largest observed/design depth ratio at that bound is shown. This chooses a useful
window for inspection without claiming probabilities beyond the supplied range.
The map legend has fixed AEP bands; tooltip/summary labels retain bounds and
mark interpolated estimates with `≈`.

Only complete windows can produce an estimate. Missing or negative readings and
discontinuous intervals are not treated as zero or bridged. A gauge with partial
coverage can have an estimate from available complete windows, shown with a
dashed marker and an explicit warning that its true maximum may be rarer. Grey
markers have no estimate. Valid zero rainfall stays valid. Gauges outside the
saved region coverage do not receive an invented local reference.

These are approximate **point** comparisons to regional centroid reference data.
They are not gauge-specific design studies, event or catchment AEPs, annual
maxima analyses, flood probabilities or official warning categories. Variation
within a region and the statistical effect of searching multiple durations and
windows are not removed by these calculations.

## Data access and validation

`/api/archive-rainfall/group-series?basin=…&end=…` issues one bounded 24-hour
observation query for the selected group, with SQLite and compact PostgreSQL
paths. It returns 96 native quarters per catalogue gauge and preserves missing
values. Identity-unresolved gauges have no measurements. The endpoint uses the
existing read-only archive connections, timeout and cache protections, and
requires a known basin and a saved quarter-hour ending time. Viewer reference
files are cached per filename, fetched with bounded concurrency, and source
request failures are surfaced without fallback. Selection-version guards keep
old data from replacing a newer time or mode.

`npm test` includes pure interpolation, accumulation, missing-data and group-query
checks. Browser tests cover AEP colours, splash labels, controlling-window
selection, duration sensitivity, both plots, phone layout, missing references,
and absence of ARR requests. The existing rainfall/water/Dams suites remain
applicable because the map/time/plot infrastructure is shared.
