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
  they do not establish datum compatibility. No database migration, background
  threshold harvesting, new reference overlays or spillway colouring is enabled yet.
