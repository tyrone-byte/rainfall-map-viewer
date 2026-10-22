# BoM rainfall feed coverage check — 22 October 2026

This is a read-only investigation. No collector, archive, dashboard data source, or ARR batch was started or changed.

## Follow-up: IDQ65900 is the more relevant product to investigate

The full machine-readable [BoM anonymous FTP product catalogue](https://www.bom.gov.au/catalogue/data/SMSRPR09.json), loaded by the public catalogue page, explicitly lists:

| Product | Official description | Formats |
|---|---|---|
| **IDQ65900** | **Rain gauge 15 minute observations for QLD** | CSV, HCS, TXT |
| IDQ65910 | River height most recent observations for QLD | CSV, HCS, TXT |
| IDQ65911 | River height last 3-hour observations for QLD | CSV, HCS, TXT |

These records are preserved in `additional-products.json`. IDQ65900 was missed in the initial investigation. The eight-station result below applies only to **IDQ60920**, not to IDQ65900 or all BoM services. It must not be interpreted as a whole-network availability conclusion.

IDQ65900 should now be the first rainfall product examined for the flood-gauge network. At the initial check, a sample had **not yet been obtained or parsed**: `/fwo/IDQ65900.csv` is not available at the standard HTTPS product path tested (404), while anonymous FTP connectivity could not be verified from this environment. A missing HTTPS mirror does not mean the FTP product is unavailable.

Before using it, check the actual station IDs against our network and establish whether the values are interval totals, cumulative counters, or another observation representation; the catalogue name alone does not establish exact accumulation boundaries. Confirm timestamps, update cadence, missing-value conventions, resets and corrections. Catalogue `delete_time=2` means the product can expire after two hours without replacement, **not** that it necessarily contains two hours of history. No scheduled collection or dashboard feed change has been made.

### Sample download follow-up

The first GitHub FTP attempt reached the server but returned curl error 78 (the assumed `IDQ65900.csv` file did not exist). A bounded directory-listing job subsequently found **nine timestamped HCS files**, spaced 15 minutes apart by filename, and successfully downloaded one: **`IDQ65900_20261022002300.hcs` (862,934 bytes)**. The public run status confirms retrieval; the actual source content remains in the authenticated `bom-idq65900-discovery` artifact pending inspection. Neither station coverage nor rainfall accumulation semantics has yet been verified. Filename spacing alone does not prove 15-minute accumulation blocks.

The successful job is [run 39711565724](https://github.com/tyrone-byte/rainfall-map-viewer/actions/runs/39711565724). Both sample workflows have been left manual-only, with no schedule and no automatic further downloads. No source observations are committed or published to the dashboard. Future manual sample runs discover filenames and prefer the newest supported file. A direct HTTPS request for the exact discovered filename also returned 404; FTP availability does not imply a public HTTPS mirror.

## Evidence and scope

The official ten-minute Queensland observation product **IDQ60920** was retrieved successfully from [BoM's HTTPS product directory](https://reg.bom.gov.au/fwo/IDQ60920.xml). Its issue time in the capture is **22 October 2026, 11:51:01 AEST**. The [technical guide](https://www.bom.gov.au/catalogue/Observations-XML.pdf) also lists it on anonymous FTP at `ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ60920.xml`. Direct FTP access could not be verified from this environment: the hostname did not resolve. Successful HTTPS access does not establish FTP connectivity or registered-service access.

The product contains **153 weather stations**. The current rainfall bulletin capture contains **321 rows** (issued 11:23 AEST), including two indistinguishably named Dayboro rows. To avoid confusing nearby instruments, gauge names were joined to station IDs explicitly published in BoM's [current flood map](https://reg.bom.gov.au/qld/flood/brisbane.shtml), then matched by the **same BoM station number** to IDQ60920. No fuzzy name or nearest-station substitution was used.

## Coverage result

| Classification | Bulletin rows |
|---|---:|
| Same station ID appears in IDQ60920 | 8 |
| Unique live flood-map ID established, but not in IDQ60920 | 272 |
| Identity unresolved from this map capture | 41 |
| Total | 321 |

The 41 unresolved rows comprise 39 names not uniquely identified on this map capture and two ambiguous Dayboro rows. They are not assumed to be absent from all BoM services.

The eight confirmed overlaps are:

| Rainfall bulletin name | BoM station ID | WMO ID | Explicit `rain_ten` in capture? | Cumulative rainfall present? |
|---|---|---|---|---|
| Archerfield Airport | 040211 | 94575 | No | Yes |
| Brisbane (Raymond Park) | 040913 | 94576 | No | Yes |
| Brisbane Aero | 040842 | 94578 | No | Yes |
| Redland (Alexandra Hills) | 140007 | 94561 | No | Yes |
| Beerburrum | 040284 | 95566 | No | Yes |
| Gatton (UQ) | 040082 | 94562 | No | Yes |
| Amberley AMO | 040004 | 94568 | No | Yes |
| Greenbank | 140009 | 94419 | No | Yes |

**None of these eight has an explicit ten-minute interval rainfall amount in this snapshot.** Seven stations elsewhere in the Queensland product have `rain_ten`, largely portable instruments, but no verified overlap with this bulletin was established. Field presence varies with observation message type and availability; this capture is not a guarantee of permanent presence or absence.

The eight overlapping stations do provide cumulative rainfall with start/end timestamps. Recording successive counters may let us derive sub-hourly increments. A collection trial is still needed to validate actual intervals, gaps, day resets, corrections and precision. Counter element timestamps can differ from the station period timestamp or product issue time: intervals must use the rainfall element's own timestamps. Polling every ten minutes does not itself guarantee exact ten-minute rainfall periods. No sub-hourly values have been calculated from this single capture.

The public Amberley station-history JSON was also inspected using the link on its official station page. It contained `rain_trace` but no `rain_ten` field in the sampled records. It does not establish a ready-made complete ten-minute historical series.

## Useful interim source: one-hour rainfall

The official flood-data index links [IDQ60336](https://reg.bom.gov.au/cgi-bin/wrap_fwo.pl?IDQ60336.html), the one-hour rainfall bulletin for the same catchments. Its capture (11:53 AEST) contains **320 rows matching 320 of our 321 current rows**, including the duplicate named rows. Toogoolawah Post Office is absent in that capture; it must not be filled with zero.

This could improve whole-network rainfall resolution from three hours to one hour, but **does not meet the requested sub-hourly burst-analysis requirement**. The current one-hour table contains eight completed hourly blocks, so persistence would still be needed for an event archive.

## Station identity differences requiring review

The new live-map station IDs differ from eight IDs inferred from the older 2022 catalogue currently used by the viewer. These are not automatically treated as station relocations or instrument equivalence:

| Gauge | Historical catalogue ID | Current flood-map ID |
|---|---|---|
| North Pine Dam | 540202 | 540277 |
| Bribie Island | 040978 | 540743 |
| Gregor Creek | 040822 | 540139 |
| Bill Gunn Dam | 540472 | 540563 |
| Rosewood | 540193 | 540388 |
| Kalbar Weir HW | 540058 | 540151 |
| Ipswich | 040101 | 040831 |
| Greenbank | 040659 | 140009 |

These should be reconciled before expanding coordinate-based IFD collection or introducing a station-based archive. No map coordinates or ARR targets were changed by this investigation. `gauge-coverage.csv` records the exact matches, live-map coordinates, historic-ID differences, cumulative-rainfall timestamps and hourly-table membership for every row.

## Recommended next enquiries

For most of the network, ask BoM Data Services for the high-frequency **flood-warning/ALERT rainfall telemetry** product, rather than assuming the general weather AWS product covers it. Request:

- Station coverage for the IDs in the attached table, especially the IDQ60348/IDQ60336 network.
- Five-, ten- or fifteen-minute increments, or timestamped cumulative/tipping-bucket observations suitable for deriving increments.
- FTP, SFTP or other supported automated delivery; product IDs, update intervals, retention, backfill, quality and correction flags.
- Access arrangements, fees, and permission to archive, export and display the data on this shared dashboard.

The [catalogue](https://www.bom.gov.au/catalogue/data-feeds.shtml) identifies registered services for support/continuity and distinguishes anonymous-service usage conditions. The documented contact is `webreg@bom.gov.au`. No enquiry has been sent on the user's behalf.

## Reproducibility

`summary.json` contains counts, issue times and SHA-256 checksums. Gzip files preserve the actual checked weather feed, live flood map, parsed current rainfall bulletin and hourly bulletin. The CSV contains no invented observations or coordinate substitutions.

The offline audit can be repeated with `tools/audit_bom_feed_coverage.py`; it makes no network requests. This is a snapshot coverage audit, not proof that unlisted stations lack any other BoM or agency feed.
