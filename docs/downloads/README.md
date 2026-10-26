# Local archive sample — BoM basin groups

Download [rainfall-archive-sample-2026-10.zip](rainfall-archive-sample-2026-10.zip).
On GitHub, open the ZIP page and choose **Download raw file** (the download arrow).
Save it on your computer, right-click and choose **Extract All**.

## What is inside

```text
READ-ME.txt
index.json
stations.csv
brisbane-bremer-pine-caboolture/
  rainfall-15min.csv
  water-level.csv
```

**Only two observation CSVs**, rather than the original 28. The folder represents
BoM's “Brisbane, Bremer, Ipswich Cks, Brisbane Cks, Pine, Caboolture” bulletin group.
It is not a latitude/longitude square. This sample has no empty folders for regions
with no saved observations. Its station catalogue covers 344 distinct identities.

- Rainfall: **4,946 native 15-minute records** from the preserved database.
- Water levels: **370 collected summary records**, forming our own timestamped history.
- Total: **5,316 records**, about **40 KB compressed**.
- Excluded: hourly rainfall, three-hour rainfall and detailed BoM water histories.
- No recurring estimate column. The October-only development backfill is documented
  once in the archive notes; existing observation QA codes remain preserved.

This is a **partial preserved event sample**, not a complete month, not a statewide
archive and not an export from the live Render database. It is not a reliable
projection of a full month's size. It uses the local preserved records as they are;
no new observations, estimates or missing intervals have been generated.

## Grouping and index

The archive format lists all 12 basin groups from the BoM hourly/24-hour bulletin
index. Verified station IDs from the existing Brisbane gauge registry assign the
rainfall gauges. Water-summary source product IDs identify the matching bulletin
group. No coordinate-based guessing is used for basin membership. Unknown
memberships are retained in `unassigned`, not dropped.

Other populated groups will have their own rainfall and water files. A group with
only one measurement type needs only one file. Basin definitions are stored once
in `index.json`, together with each file's label, station IDs, dates, record count
and checksum. The station catalogue separately retains names, coordinates, source
and coordinate date. Missing coordinates remain blank.

Open `stations.csv` or either observation CSV in Excel. Blank measurements are
missing values, not zero. Water levels require their datum. Timestamps are UTC;
monthly boundaries follow Brisbane time. `source_fetched_utc` refers to the linked
snapshot; it is not necessarily the first time we ever saw that observation.

## Verification and limits

Checksums, counts, numeric sums and unique observation identities were checked by
reopening the ZIP. Counts and decimal sums for the two selected series match the
source database. See [archive-sample-verification.json](archive-sample-verification.json).
Tests also cover missing values, zeros, water-level datum, exclusion of unwanted
series, group assignment, unassigned stations and unchanged source database bytes.

No live collection changes, source-record deletions, scheduled exports, viewer
changes or cloud-account connections were made. The ZIP contains no raw BoM source
files or credentials. Format version 2 replaces the earlier coordinate-grid sample.
The local exporter still buffers partitions in memory: production monthly jobs
need bounded-memory output and independent archive storage before retention can
be enabled. A multi-month archive viewer remains a separate next step.
