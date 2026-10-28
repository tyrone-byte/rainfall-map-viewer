> Samples are now verified and the collector implementation is documented in [WATER_FTP_COLLECTION.md](../WATER_FTP_COLLECTION.md). This page describes the earlier discovery-only step.

# Water-level FTP candidates

The preserved official BoM product catalogue in
`docs/research/bom-feed-coverage/additional-products.json` lists:

| Product | Official description | Formats |
| --- | --- | --- |
| IDQ65910 | River height most recent observations for QLD | csv, hcs, txt |
| IDQ65911 | River height last 3-hour observations for QLD | csv, hcs, txt |

Catalogue source: https://www.bom.gov.au/catalogue/data/SMSRPR09.json
These are catalogue findings, not proof of live coverage or sample validation.
A three-hour observation window is not a claim of three-hour sampling intervals.
Catalogue deletion fields are not interpreted as update frequencies.

The read-only `Check BoM water-level FTP products` GitHub workflow performs one
anonymous FTP directory listing and downloads at most one latest listed HCS file
per candidate. It never guesses a filename. It runs when the pilot script or
workflow is updated on main, or by manual workflow dispatch. It does not run on
a schedule and does not alter the operational collector or any database.

The `bom-water-ftp-discovery` artifact contains raw samples and report.json, kept
for 14 days for this diagnostic. The report includes station coverage, units,
sensor fields, Mulgowie ID 040835 timestamps and actual gaps. Coordinates and
water datums are not inferred. The parser reports raw water values without
resampling, interpolation or numeric conversion. It validates the HCS envelope;
that alone does not establish a suitable water measurement/datum definition.

Before any production switch, establish the real measurement meaning, datum,
quality semantics, update cadence, reporting-station coverage and overlap with
BoM's detailed station table. Verify deduplication of overlapping history windows
and preservation of the existing history. No new collector source has been
enabled by this discovery work. Direct FTP DNS and live BoM web access were
blocked in the Codex workspace during this investigation, so use the GitHub
runner result rather than describing a local attempt as live verification.
