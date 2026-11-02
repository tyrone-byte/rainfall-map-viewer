# BoM gauge reference-level collection: feasibility review

The existing saved BoM history-page fixture (`tests/fixtures/water-history.html`)
contains explicit Minor, Moderate and Major levels with an AHD datum.
`water.history` extracts these only after validating the station number;
`water_service.history` rejects thresholds whose datum differs from the station's
summary datum. These legacy readers are not a persisted reference-level database
and are not connected to the saved-history hydrographs' reference overlays.

A read-only request to a plot URL already supplied by the station catalogue was
blocked by the cloud network proxy (CONNECT 403). No live thresholds or published
absolute spillway elevations have been collected during this review. An additive
`reg.bom.gov.au` network allowance was saved in the environment configuration
draft; this is not evidence it is applied or that BoM authorizes subsequent calls.

## Proposed integration after live-source verification

- Resolve links through the existing station catalogue/link resolver, validate the
  station ID in the page and retain the exact source URL and retrieval timestamp.
- Store reference metadata separately from observations: station, reference kind
  (minor/moderate/major/spillway), numeric metres, explicit datum, source, retrieval
  time, verification state and version history. Keep missing values missing.
- Prefer explicit machine-readable/text values. A reference drawn only in a plot
  image needs a separate validated acquisition method; do not estimate pixel heights.
- Relative notes such as “0.30 above Spillway” are not published absolute crest
  elevations. Do not silently turn rounded relative notes into surveyed levels.
- Plot labelled horizontal reference lines in the shared water hydrograph only for
  the matching station and explicit compatible datum. Never apply an AHD threshold
  directly to LGH observations or invent offsets. Do not infer historical effective
  dates from retrieval dates when reference definitions change.
- Dam crest comparisons also require the selected storage gauge association.
  The four user selections are recorded in `data/dams/storage-gauge-associations.json`;
  they do not establish datum compatibility. Background threshold harvesting is not enabled. The separately described test
  integration below adds metadata storage and overlays without assuming datum conversions.

## Implemented test integration

`gauge_references.py` stores append-only reference versions in a dedicated
`gauge_reference_levels` table (SQLite or PostgreSQL) with station, kind, numeric
level, datum, source, retrieval time and the original record. Observation tables
are untouched. The read-only web reader tolerates an absent metadata table.
`data/water-reference-levels.json` is the portable published-value export and is
currently empty because live BoM access is blocked. No fixture values were
imported as live metadata. The water FTP formats currently parsed by the collector
contain timestamped measurements and datum parameters, not minor/moderate/major
reference fields. Other BoM products have not been comprehensively surveyed.

The shared hydrograph now accepts reference metadata from the archive series API.
Published minor/moderate/major lines require one explicit matching chart datum.
Provisional dam crests with an unspecified datum may appear on an AHD-only chart
for this test, labelled PROVISIONAL TEST and datum unverified. They are omitted on
LGH or mixed-datum plots. Reference points remain hidden when recorded points are
toggled. Reference metadata is not classified as measured observations.

Explicit import commands from the repository root:

```sh
# Seed the 44 associated supplied crests into metadata storage, no network:
python tools/collect_water_references.py --seed-spillways
# Collect a bounded serial pilot once reg.bom.gov.au is reachable:
python tools/collect_water_references.py --station 540177 --limit 1
# Broader explicit collection; two-second minimum delay, stops on first refusal:
python tools/collect_water_references.py --all --limit 20 --delay 2
# Import a genuine saved BoM page, with station identity validation:
python tools/collect_water_references.py --html 540111=/path/to/page.html
```

The tool uses HISTORY_DATABASE_URL or DATABASE_URL when present, otherwise
`.cache/gauge-references.sqlite`. `--database` can select a separate metadata
store. It creates only the reference table/index and does not run collector
cleanup or mutate observations. Published explicit text values are exported to
`data/water-reference-levels.json` for review and deployment; manual dam crests
remain separate. Partial successful acquisitions are retained and the command
returns failure on refusal. It does not run on page visits or in the collector
schedule. No automatic database import has been run against production.
