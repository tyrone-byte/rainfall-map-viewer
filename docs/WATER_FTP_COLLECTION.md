# River-height FTP cutover

This update changes the water portion of the shared `rainfall-collector` job.
Rainfall still uses the unchanged IDQ65900 15-minute depth feed. No ten-minute
rainfall totals are invented from it.

## Sources and retained observations

- IDQ65911: recent three-hour river-height observation history. Three hours is
  the available history window, not a sampling interval.
- IDQ65910: most recent observations; supplements newer readings and gauges
  absent from the history product.

The captured directory listing shows IDQ65910 files 15 minutes apart (11 files),
and IDQ65911 files 60 minutes apart (6 files). This is observed publication
cadence, not a guaranteed gauge measurement interval. IDQ65911 is allowed 90
minutes of generation age to accommodate its hourly release; IDQ65910 is allowed
60 minutes. Health reports use the freshest product issue after validating both.

The verified uploaded samples contain 10,152 rows across 1,140 gauges in IDQ65911
and 1,183 latest readings in IDQ65910. The Mulgowie 040835 sample contains gaps of
60 and 15 minutes in the history file, plus a later reading in the latest file.
Many other gauges have one-minute observations. Actual source cadence varies.
The source datatype is WL/1, units metres, with an explicit AHD or LGH field in
SensorParam1. Datum labels matched all 204/190 overlapping Brisbane stations
checked against preserved BoM bulletin metadata. Quality code 1 is retained
without assigning an independently unverified meaning to it.

Every reported numeric reading is retained with its exact explicit timestamp,
including seconds, and unchanged levels at new timestamps. There is no temporal
sampling, alignment, averaging, interpolation or rate-of-rise filtering. Missing
values remain missing. Unknown measurement definitions, units, datums or timezones
fail validation rather than being guessed. Overlapping products/windows deduplicate
by station, timestamp and datum. Genuine corrections retain QA/revision history.

Collection reads one FTP directory listing for rainfall and water, then up to 12
unseen files per product sequentially, pausing between downloads. Routine water
collection no longer requests regional webpages. FTP failures are reported; there
is no silent switch back to the sparse website source. Both products must be
available and recently generated to pass the cutover check. Generation freshness
is distinct from observation freshness: a dry or change-reporting gauge may
legitimately have an old reading.

The existing logical series identifier `water-summary` is retained internally for
viewer/archive compatibility; new measurements are FTP observations, not webpage
summaries. No schema migration is required. Source definitions and bounded digest
receipts are retained, not downloaded file contents.

## User-authorized reset

After both FTP products have been successfully collected, a one-time transaction
removes readings and corrections belonging to old non-FTP water sources. It
verifies that numeric FTP observations remain, preserves rainfall and the station
catalogue, and records `water-ftp-history-v1`. Later runs skip this reset. If FTP
validation/collection fails, no legacy water deletion occurs. A failed reset is
rolled back. Old web water imports are blocked after successful cutover.

The current feeds cannot reconstruct last week's hydrograph after the product's
retained files expire. This reset deliberately removes the sparse old web record,
as requested; history subsequently grows from the actual FTP observations available.

## Viewing and archives

The same database and water-history page read the full timestamped series. Official
BoM plot/table links are direct where recorded; otherwise the viewer resolves
station hyperlinks from the official basin bulletin, caching metadata for a day.
That lookup reads links only; it does not import webpage water-level values.

The existing grouped archive exporter exports FTP water observations, datum,
quality and source product alongside rainfall. Automatic monthly archival and
age-based deletion remain disabled pending the planned archive testing. Some
stations report continuously in dry weather; storage depends on actual reporting
cadence rather than rainfall alone. No new raw-file repository is created.

## Deploy

1. Deploy the latest **rainfall-map-viewer** commit for link lookup support.
2. Rebuild **rainfall-collector** with the same Dockerfile, database URL, command
   and ten-minute schedule. Environment → Edit → Save, rebuild, and deploy can
   rebuild it without changing variables.
3. Trigger one run when the rebuild finishes. Look for `waterFTPCutover` with
   `status: switched`, the removed web-reading count, retained FTP-reading count,
   and normal collection output with `errors: []`.
4. Check subsequent runs and Mulgowie's recorded points against BoM. No new paid
   service or database is needed. Do not run the old web collector after cutover.

## Verification evidence

The two full uploaded samples were imported into disposable PostgreSQL limited
to 0.1 CPU and 256 MiB RAM. All 10,954 distinct station/timestamp/datum
observations were retained; replaying both files added no duplicates. Ingest
took approximately 50 seconds in that local check. The grouped monthly archive
exported and verified all 10,954 readings. This is not a production runtime or
storage-growth guarantee. Separate cutover tests verify removal of old water
readings while rainfall and station metadata remain intact.
