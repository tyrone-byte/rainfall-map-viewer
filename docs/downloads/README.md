# Local archive sample

Download [rainfall-archive-sample-2026-10.zip](rainfall-archive-sample-2026-10.zip).
On GitHub, open the ZIP file page and choose **Download raw file** (the download
arrow). Save it on your computer, right-click it and choose **Extract All**.

Open `READ-ME.txt` first. You can open `stations.csv` and the observation CSVs in
Excel. `index.json` is the catalogue a future viewer will use to select files by
station, geographic cell and time coverage without processing every CSV.

This is a **partial preserved October 2026 event sample**, not a full month or an
export from the live Render database. It contains 11,813 records, 385 distinct
archive station identities and 28 observation CSV files. Compressed size is
100,520 bytes (about 98 KiB). This small event sample is not a reliable projection
of a full month's archive size.

The sample includes native 15-minute rainfall, older hourly/three-hour QA rainfall,
water summaries and the two detailed water histories available in the preserved
local database. They are in separate source folders: overlapping rainfall sources
must not be summed together. Some archive identities remain unresolved and have
no invented coordinates. The native 15-minute source contains 4,946 records in
this local sample, not the full production history.

The exporter verified checksums, row counts, numeric sums and unique observation
identities after reading the ZIP back. Source database count matches all 11,813
exported records. See [archive-sample-verification.json](archive-sample-verification.json).
Tests also check that source database bytes remain unchanged and missing values,
zero, negative water levels, datum and estimated-value flags survive export.

No live database changes, deletion, scheduled export or cloud-account connection
has been made. No raw BoM download files or database credentials are in this ZIP.
The local exporter in `tools/export_archive.py` is a format prototype that buffers
partitions in memory; a production monthly job will need bounded-memory writing,
independent archive storage and retention controls. The multi-month interactive
archive viewer is a separate next step, not included in this sample.
