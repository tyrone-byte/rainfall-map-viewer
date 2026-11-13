# Storm summary

`/` opens `/summary`, a rainfall-only overview. Water-level gauges remain on the
dedicated Water levels page; the overview neither queries nor displays water
readings or flood classifications. The default lookback is 24 hours; 3-day and
7-day options change totals. Point AEP always uses the latest saved 24 hours.

## Bounded saved-data loading

`/api/storm-summary?minutes=1440` reads one statewide quarter-hour snapshot and
calculates complete totals from those same 96 readings, avoiding a second archive
observation query. Longer totals use the existing duration aggregate reader.
Responses deduplicate bulletin memberships by exact station number and contain
only the identity/display fields needed by the overview. No page visit contacts
BoM or ARR. Archive readers cache for 60 seconds.

Totals display before AEPs finish. Statewide AEP calculations run in a dedicated
worker with bounded local-reference concurrency; refresh cancels an old worker.
Unchanged point-data snapshots reuse their result when changing lookback or
refreshing. A 20-second request deadline offers retry instead of loading forever.
A 45-second AEP deadline keeps already loaded totals visible if comparison stalls.
A failed new archive request clears old results rather than presenting them as
current; unavailable or empty data shows unknown counts instead of zero events.

## Flags and interpretation

Display thresholds default to >=50 mm total or <=10% estimated point AEP and are
user-adjustable screening aids, not official warning criteria. Only complete
totals are ranked. IFD comparisons use complete 15-minute through 24-hour windows
with assigned regional-centroid default 2030 references; partial daily coverage is
disclosed. Point rainfall AEP is not flood AEP. The map includes all located flags,
while lists show the top ten; links preserve group, gauge, window and time.

The displayed feed windows and stale state describe the saved data, not current
conditions when feeds are stale. Missing readings are never zero-filled.

## Water-level classifications

The separate water viewer offers Flood category colours and hydrograph reference
lines. `data/water-reference-levels.json` now contains the exact-ID SLS import for
808 catalogue gauges. See `docs/flood/SLS_IMPORT.md` for source provenance and the
user-confirmed same-station datum basis. Missing classification definitions,
unknown observation datums and inconsistent reference levels remain unassessed.
No historical effective dates or datum offsets are inferred.
