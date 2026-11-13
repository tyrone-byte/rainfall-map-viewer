# Storm summary

`/` now opens `/summary`. Existing map URLs and bookmarks keep working, and the
shared page navigation links to the summary. The default lookback is 24 hours;
3-day and 7-day options change totals and flood peaks. Point rainfall AEP always
uses the latest saved 24-hour period, explicitly labelled independently.

The summary reads saved observations only. It does not contact BoM or ARR on a
page visit. `/api/storm-summary?minutes=1440` combines cached archive readers:
complete rainfall totals, one all-gauge quarter-hour series query, and water
readings with published references. The existing point IFD calculation compares
complete windows from 15 minutes through 24 hours with the assigned regional
centroid default 2030 baseline. Browser reference requests have bounded concurrency. Statewide AEP calculation
runs in a dedicated worker so the map remains responsive, and is cancelled when
the lookback changes or a new refresh starts.
Distinct station numbers are counted once across duplicated bulletin memberships.

Rainfall flags default to >=50 mm total or <=10% estimated point AEP. Both are
user-adjustable screening thresholds, not official warning criteria. Incomplete
totals are excluded, and complete IFD subwindows within an incomplete day are
labelled. Point rainfall AEP is not an estimate of flood AEP. Cards jump to their
ranked lists; the map shows every located flagged gauge, with links to the existing
maps/charts preserving group, gauge, time and duration.

Flood peaks use the highest classified observation in the lookback, not just
the latest reading; major flooding remains flagged after levels fall. Nulls,
unspecified datums, mismatched datums, provisional references and inconsistent
thresholds cannot establish a category. Below/minor/moderate require all three
ordered reference levels; a verified major threshold can establish a major
exceedance on its own. No datum conversion is inferred. Numeric peak heights
are never compared across different datums. The water map also offers an explicit
Flood category colour mode; the default remains measured rise/fall.

The portable `data/water-reference-levels.json` is currently empty. A bounded
single-station BoM check during implementation returned HTTP 403. The UI therefore
reports unassessed flood coverage rather than claiming no major flooding. The
existing importer in `tools/collect_water_references.py` accepts genuine saved
BoM pages or bounded serial live collection when accessible; see
`docs/research/water-level-references.md`. No fixture reference was imported as
live metadata. The classifier and existing hydrograph threshold overlays use
matching explicit gauge datums and published reference provenance.

Each feed's own saved window and stale state are shown. Rainfall and water may
have different ending times. No archive connection, query failure and missing
reference data have separate unavailable states. A failed refresh clears the
previous summary rather than leaving it presented as current. Counts of assessed
water gauges mean at least one compatible classified sample, not a complete
continuous record; unknown samples and potentially missed peaks are disclosed.
Unreferenced gauges need only a latest-reading query; all window readings are
loaded only for gauges with saved flood references. Archive caches expire after
60 seconds. Threshold retrieval dates are not historical effective dates, so
comparisons explicitly use currently saved references.
