> Water collection update: [WATER_FTP_COLLECTION.md](WATER_FTP_COLLECTION.md) supersedes the web-water sources below. The collector now retains all available FTP river-height observations and performs the explicitly requested one-time removal of old web water history after a validated FTP start. Rainfall collection is unchanged.

# Our observation history: compact storage and one-time cleanup

The deployed collector now uses compact storage. Normal collection keeps only:

- 15-minute rainfall depth, including valid zero depths, for every reporting ID
  in the Queensland IDQ65900 feed (not limited to the 280 map matches).
- Water-summary readings from all twelve IDQ60285–IDQ60296 bulletins. A new
  station/time/datum reading is recorded once; polling does not fabricate a
  regular water-level sampling interval. The ten-minute schedule is unchanged.
- Observation times, source issue and receipt timestamps, raw QA codes/comments,
  datum and timestamp-basis metadata. Station names/locations/group information
  are kept in the separate registry, never invented from gauge names.

Station catalogue entries can exist without any recorded reading; reliable source-listed IDs/names are retained for future grey/no-data map points. No missing measurement is invented to populate a gauge.

No incoming BoM file is retained. The legacy-named `snapshots` table contains
only current source definitions/timestamps with empty raw-data fields. A bounded
cache (24 file checksums/identifiers per measurement kind) avoids downloading the
same retained FTP files repeatedly. It contains no file contents and cannot grow
into an archive of downloaded files.

## Compact PostgreSQL representation

`history_readings` stores numeric station/feed/datum references and native
PostgreSQL timestamps rather than repeating long text identifiers and timestamp
strings with each reading. It has indexes for individual gauges and time windows.
An `observations` compatibility view provides the columns used by the existing
history APIs and archive exporter. SQLite remains a local test implementation.

Unchanged readings do not update their observation rows. Current feed issue
watermarks prevent older files from overwriting a newer known state. Only genuine
value or QA changes retain a previous-state correction record; an initial reading
is not copied into a second history table. Collector run logs are bounded to 30
days. Actual reading history is not age-pruned by this change.

## One-time cleanup

The first run of the new collector, under the existing PostgreSQL advisory lock:

1. Fingerprints retained measurements, timestamps and QA and records their IDs in
   a temporary verification table.
2. Extracts any previously unextracted Queensland rainfall observations from the
   old saved HCS files before discarding those files. Newest captured source wins
   for recovered observations. Existing observations are not overwritten.
   Recovery inserts missing readings in bounded COPY batches on PostgreSQL, rather
   than issuing individual INSERT/UPDATE round trips. Progress logs report source
   files completed and readings recovered every five files.
3. Removes unused hourly rainfall, three-hour rainfall and imported detailed
   water histories, then removes raw files and duplicate initial revision copies.
4. Moves descriptive station fields to the registry. Existing one-off event
   estimates remain intact; no new estimates or historical interpolation run.
5. Verifies the original readings and QA, then verifies the complete dataset
   before/after conversion to typed PostgreSQL storage. Verification streams the
   physical records and uses a count plus an order-independent SHA-256 row
   fingerprint, avoiding large database sorts and joined-view reconstruction. Any mismatch rolls back
   the cleanup and stops that run. The old physical observation table is dropped
   only after verification succeeds. An import receipt makes retries idempotent.
6. Physically compacts the tables with a one-time `VACUUM FULL`, with a five-second
   lock wait and three-minute statement limit per table. This may briefly delay
   database readers. If compaction cannot acquire its lock or finishes late, the
   measurements remain committed and compaction retries next run.

Source references are resolved through a small temporary mapping table during
the typed-table copy; PostgreSQL does not rewrite the legacy observations just
to change their source identifiers. Correction references are updated in bulk.
Legacy observation metadata is not rewritten in place: its compact form is
created during the typed-table copy, in batches of 5,000 rows. Foreign-key
constraints are validated in bulk before the compact tables become visible. The registry reads
each water gauge description once. Progress includes copied/total row counts. Cleanup logs each major stage; SQL
statements have a five-minute timeout and lock waits a ten-second limit, so a
blocked step fails with rollback rather than waiting indefinitely. Failures log
the stage, exception type and SQLSTATE without exposing connection details.
A failed cleanup is durably paused; ordinary reading collection continues on
subsequent scheduled runs instead of automatically repeating the full cleanup.
An operator can explicitly retry with `--once --retry-cleanup` after fixing the
reported cause. The first failure is reported as a failed run, but still attempts
normal collection before exiting. A paused cleanup alone does not mark future
collection runs as failed.

The original snapshot-linked receipt time is the best recoverable receipt time
for migrated records; it cannot establish their first-ever arrival after old
collector updates. New readings preserve their receipt time through later
corrections. Original observation QA and one-off backfill provenance remain
available, with descriptive/source-interpretation metadata represented separately.

## Deployment

If an older cleanup run is still active, cancel that run before rebuilding the
collector. Do not trigger overlapping cleanup attempts. Cancelling an unfinished
transaction rolls it back; a completed migration receipt is detected on retry.

1. Deploy the latest **rainfall-map-viewer** web service first. This updates read
   compatibility for PostgreSQL timestamp values and the separate station registry;
   it does not change the grouping/zoom interface.
2. Rebuild **rainfall-collector** from the latest commit. The existing Dockerfile,
   DATABASE_URL and `*/10 * * * *` schedule remain valid. In Render this can be
   done through Environment → Edit → Save, rebuild, and deploy.
3. Trigger one run (or let the next scheduled run start). Logs include
   `historyCleanup`, `storageCompaction`, and normal collection counts/errors.
   `original_verified` confirms existing data; `recovered_statewide_readings`
   counts additional source readings recovered before deleting files.
4. Compare the logged before/after byte counts and Render's storage metrics.
   PostgreSQL/WAL and platform metrics can temporarily lag relation compaction.

No new environment variables or credentials are needed. An obsolete
EVENT_IMPORT_KEY does not reactivate historical imports. The collector image no
longer includes the old event import/backfill packages. Do not roll the collector
back to the pre-migration writer against the typed database; it cannot write to
the compatibility view. Retained history remains queryable through the new code.

## Archive/retention boundary

The basin-group archive exporter reads the compact representation and still
exports only our quarter-hour rainfall and collected water-summary series. The
archive-viewer/group-selection changes are a later step. No automatic deletion
of readings older than three months is enabled: durable monthly archives and
successful archive verification must be operational before that can be safe.
Existing workspace event backup files and repository sample archives are not
production database files and are not removed by this cleanup.

## Verification

- A 600,000-reading synthetic PostgreSQL migration passed with the database
  limited to 0.1 CPU and 256 MiB RAM. Cleanup and compaction took 481 seconds,
  excluding recovery from saved source files; this is not a production ETA.
- SQLite unit tests: original records/QA unchanged, recovery before file removal,
  failed-verification rollback, existing estimates preserved, no duplicate writes,
  corrections/out-of-order protection, bounded receipts and statewide source set.
- Real PostgreSQL migration: 5,316 original retained rows verified; 23,776 genuine
  additional rainfall readings recovered; 29,092 retained rows afterwards. The
  1,721 rainfall IDs in the sample were retained; 204 water-summary IDs were retained.
- PostgreSQL test database decreased from roughly 26 MB before cleanup to roughly
  15 MB after compaction, despite the added readings. This is not a production
  space-reduction guarantee. Fixed database overhead is included.
- Existing map/history queries and basin-group ZIP export verified against the
  typed database, including re-opening the writer, skipping unchanged records,
  accepting corrections and rejecting older corrections.

Optional repeatable PostgreSQL test:
`TEST_POSTGRES_URL=<isolated-local-test-server> python -m unittest discover -s tests -p test_compact_postgres.py -v`.
It only accepts localhost and creates/drops its own randomly named test database.
