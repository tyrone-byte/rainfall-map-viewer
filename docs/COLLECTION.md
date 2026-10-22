# Permanent storm records

The web viewer currently uses replaceable caches, not a permanent historical
database. This separate collector archives real observations independently of
web traffic. Preparing this code does **not** activate a hosted collector.

## What is preserved

- IDQ65900: genuine 15-minute rainfall depths; only confidently identified
  dashboard gauges, using the separately maintained live-map identity audit in
  `data/archive-stations.json`. Missing station matches stay unresolved.
- IDQ60336: native hourly rainfall blocks retained from the hourly bulletin.
- IDQ60348: native three-hour rainfall blocks, including its rolling day of
  history. Missing remains missing. No disaggregation or interpolation.
- IDQ60286: latest water levels, with original observation times and gauge datum.
  Summary timestamps are explicitly marked as inferred from issue day/weekday.
  This captures readings seen on each run; intermediate readings between polls
  can be missed. Existing downloaded full history tables can be imported with
  their explicit timestamps. Automated full water-table/IDQ65911 backfill remains
  a separate step; this collector does not claim a complete sub-hourly water archive.

The source samples show the FTP rainfall file contains about two hours of
overlapping observations, and files remain listed for about two hours. Recovering
all retained files can reach further back, but actual timestamps determine the
coverage. It cannot recreate expired observations. A collector outage longer
than the retained window can leave permanent 15-minute gaps. Hourly and
three-hour sources remain separate fallbacks, never substitute observed bursts.

Original compressed source responses, source issue timestamps, source quality
codes, current values and changed-value revisions are stored in the database.
HCS quality code meanings remain unverified; the archive retains the codes
without labeling them quality-approved. CSV exports distinguish source kind,
interval, unit and datum. Do not sum overlapping hourly/three-hour/15-minute
series together. For mixed-resolution analysis, select a non-overlapping set of
complete intervals and label their resolutions explicitly.

Duplicate water readings at a minute are retained in the original source and
revision audit; the current-value export contains the last table-order reading.
Station identity is intentionally separate from observations and coordinates.
The one-day identity audit will need maintenance as BoM stations change.

## Keep it running on Render

1. Create a **persistent, paid PostgreSQL database**, in the same Render region
   as the collector. Review the displayed price and backup retention first.
   A time-limited free database is unsuitable for event preservation.
2. Create a **Cron Job** from this repository and `main`, using
   `Dockerfile.collector`. Use the command `python collector.py --once` and the
   schedule `*/10 * * * *` (every ten minutes, UTC).
   `render-collector.yaml` is an optional separate blueprint for this job.
   It does not modify or replace `render.yaml` or the live viewer.
3. Securely set `DATABASE_URL` to the database's **internal connection URL** in
   the job's environment settings. Never paste it into chat or commit it.
4. Optionally set `COLLECTOR_HEARTBEAT_URL` to a private successful-run check-in
   URL from an independent dead-man monitor. Configure that monitor for a
   ten-minute interval and twenty-minute grace period. An empty value disables
   this integration. It detects a scheduler that stops running, as well as errors.
5. Run the job manually once. Confirm exit success and observation counts; check
   that the FTP feed can be reached from Render. GitHub runner connectivity
   has been demonstrated; Render's FTP connectivity has **not** yet been tested.
6. Enable Render failure notifications and verify receipt with an intentional
   test failure. Verify the independent monitor alerts when check-ins stop.
7. Import the privately preserved event captures into this database. The archive
   prepared in the development workspace is not automatically uploaded to Render.
   Supply its external database URL securely through environment settings for
   the one-time import, then revoke unnecessary external access.
8. Check at least two subsequent scheduled successful runs, verify deduplication
   and coverage, and perform an actual database backup-and-restore test before
   calling the archive operational.

The cron scheduler starts a short-lived process for each collection, so the web
service can sleep without interrupting archiving. PostgreSQL holds data through
deploys and process restarts. A database advisory lock prevents concurrent runs.
Each run lists only the relevant FTP product, downloads up to twelve unseen
timestamped files sequentially with pauses, and fetches three web bulletins.
There is no rapid polling loop and no bulk historical website scrape.

No retention deletion is implemented: observations and source snapshots are
retained until explicitly removed. Monitor database storage and set a budget.
Keep automated backups and periodically export to independent storage; a database
alone is not a backup. Confirm BoM feed redistribution terms before publishing
the high-resolution feed in the public viewer. This prototype is not a warning system.

## Developer operations

SQLite requires only Python and is useful for imports/tests. Production uses
PostgreSQL via the pinned optional collector requirements:

```sh
python -m pip install -r requirements-collector.txt
python collector.py --import-files /private/archive/IDQ65900_20261022002300.hcs
python collector.py --export-csv .cache/event-rainfall.csv --station bom:540668
python collector.py --health
```

Without `DATABASE_URL`, these commands use `.cache/history.sqlite`. That file
is local only and must never be used on Render's ephemeral filesystem.
With a securely injected `DATABASE_URL`, the same commands use PostgreSQL.
Import full cached rainfall JSON, water-summary JSON, water-history JSON or raw
supported bulletin HTML; pass captures oldest first. Sources are content-deduped,
and older source revisions cannot overwrite newer values.

`--health` exits nonzero when a required source failed, checks stopped for thirty
minutes, or a source issue time is over an hour old. Successful imports alone are
not proof of a scheduled collector. The dashboard's gauge-status report and saved
quarter-hour totals can read this archive after the web service is configured;
see [Gauge status and archive connection](GAUGE_STATUS.md). A historical slider
and migration of the main map/IFD plots remain subsequent viewer work.

## Event recovery and validation, 22 October 2026

A bounded recovery [completed successfully on GitHub](https://github.com/tyrone-byte/rainfall-map-viewer/actions/runs/39712902575).
Its authenticated `bom-storm-recovery` artifact is retained for 90 days, not
permanently. It contains ten HCS files plus three bulletin captures. The reported
15-minute **interval ends** span 08:15–12:30 AEST; individual gauges have gaps.
Download it before expiry and import it into the permanent archive once provisioned.

Earlier workspace captures were separately copied to a private event ZIP. Seven
captures imported into both SQLite and a real PostgreSQL 17 test database:
8,452 current observations and 8,460 revision records. Reimport added zero.
A PostgreSQL dump restored to a separate database with identical snapshots,
observations, revisions and status records. The test databases were then removed.
These checks demonstrate storage/import/restore behavior, not a live hosted collector.
The automated suite passed 34 Python tests and five JavaScript tests. A local
collector container build could not finish because the Docker build network
cannot resolve Debian's package host. Its build and FTP connectivity still need
validation on Render; this is an environment limitation, not a successful build.
