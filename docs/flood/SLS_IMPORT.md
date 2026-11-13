# Queensland SLS classification heights

Source: user-supplied BoM **Service Level Specification for Flood Forecasting and
Warning Services for Queensland, version 3.7**, edition December 2025. The original
PDF is retained at `public/reference/QLD_SLS_v3.7.pdf` and served at
`/reference/QLD_SLS_v3.7.pdf`. The import report records its SHA-256, exact page and
schedule for every row, matched/unmatched station IDs and all raw classification
cells. Copyright Commonwealth of Australia 2025, published by BoM.

Only Schedules 2 and 3 (pages 19–59) are parsed. There are 1,073 rows for 1,069
unique station IDs; four consistent repeated definitions are deduplicated. Exact
six-digit station-number matching, preserving leading zeroes, matches 808 viewer
gauges and imports 2,417 numeric heights. The other 261 source IDs are retained in
the report, not attached to similarly named gauges. The 678 distinct catalogue
gauges without matching SLS definitions remain unclassified.

PDF word coordinates, with each page's Minor/Moderate/Major header locations,
identify cells independently of whitespace and station-name wrapping. Topmost
headers take precedence over body cells saying Moderate. A second independent
plain-text extraction agrees on all 1,065 complete numeric triples; the remaining
eight rows contain blanks or explicit N/A cells. No blank/N/A is converted to
zero. Equal published minor/moderate levels are retained; the higher reached class
wins at an equal threshold. A missing definition remains unknown, whereas explicit
N/A means that class is not defined at that station. A category is established
only when higher categories can be excluded or their thresholds have been reached.

## Datum basis

The SLS labels heights in metres but does not name AHD/LGH for every station.
The user explicitly confirmed that classifications share the water-level
observation datum at each matched gauge. We retain `datum: null` to reflect what
the PDF publishes and record `datumBasis: same-station-observation` and
`datumVerified: true` with the confirmation in each record. This basis is applied
only to references looked up by the exact station ID, and only to observations
with an explicit AHD or LGH datum. No numerical datum conversion is performed.
Unspecified or mixed chart datums cannot activate SLS reference lines. Existing
sources with an explicit AHD/LGH datum continue to require a direct match.

Never copy a threshold between same-named stations. For example, source page 31
lists Hinze Dam HW automatic station 540610 at 98.1/100.7/102.3 m, but station
040847 at 3.6/6.2/7.8 m. These remain separate station definitions.

The portable export is read automatically on deployment; no production database
write is required. Existing independently sourced database metadata is preserved.
The original PDF can be opened from the hydrograph data notes. The storm overview
is rainfall-only and performs no water queries.

## Rebuild

Run `python3 tools/import_sls_references.py`. Poppler `pdftotext` is required only
for this explicit offline import, not on the deployed server. The importer checks
the verified source checksum and row count before writing. It replaces only this
source edition's prior import, preserving other sources. Tests check source
checksums, independent extraction, same-name/different-ID examples, missing cells,
partial classifications, datum compatibility and actual archive/map integration.
