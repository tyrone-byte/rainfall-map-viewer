# Recover the morning event inside Render

This is an opt-in one-time import, not a new hosting service and not a change
to the current maps or time resolution. It preserves original 15-minute, hourly,
three-hour and water-table observations. Coarse rainfall is never divided into
invented quarter-hours. Database credentials stay in Render.

## Current recovery state

Seven original workspace captures are available and packaged. The separately
saved [GitHub recovery artifact](https://github.com/tyrone-byte/rainfall-map-viewer/actions/runs/39712902575)
contains ten overlapping HCS files and three bulletins. Its `bom-storm-recovery`
ZIP must be downloaded by the signed-in user and attached to this workspace:
the workspace's GitHub API access cannot download that authenticated artifact.
It is retained for 90 days from 22 October 2026, not permanently.

The current encrypted bundle is intentionally labelled
`includesGitHubRecovery: false` in its manifest. It is not a claim that all
morning data is included. Rebuild with the additional ZIP before enabling the
hosted import whenever possible. A later expanded package can also be imported
safely: source hashes and source-issued timestamps deduplicate existing records.

## How the import works

`tools/prepare_event_recovery.py` validates the explicitly selected private
captures and optional recovery ZIP, verifies artifact checksums, and builds an
AES-256-GCM encrypted package at `data/event-recovery/2026-10-22.json`. Public
Git history contains encrypted bytes plus an aggregate provenance manifest,
not rainfall observation rows. The random decryption key is written only to
ignored `.cache/event-preservation/event-import-key.txt` with mode 0600. Never
commit it, print it into logs, or include it in screenshots. No database URL
or database password is included in this package.

The collector only attempts recovery when **EVENT_IMPORT_KEY** is configured.
It reads the fixed repository-local package, authenticates/decrypts it, checks
capture hashes and original timezones, and runs the existing defensive parsers.
No remote archive URL is accepted and no capture contents are executed.
Compressed/unpacked payload sizes and capture counts are bounded.

Each source is committed independently. If a later source fails validation,
earlier imported observations remain preserved and a retry safely resumes.
A completed package receives a durable `event_imports` receipt. Re-running it
reports `already-imported` without repeating source processing. A crash before
the receipt is written is also safe because source snapshots are deduplicated.

Newer observations/revisions cannot be replaced by an older source issue time.
The import never updates source-health checks or marks old gauges current.
Normal live collection still runs if recovery fails; the job reports the import
failure in its normal error list and exits nonzero so it cannot look successful.
The website has no public write/import endpoint.

## Final user action once the full package is ready

1. Download the privately provided import-key file and copy its one-line value.
   This is a package key, **not** a replacement database password.
2. In **rainfall-collector → Environment**, add **EVENT_IMPORT_KEY** with that value.
   Keep the existing **DATABASE_URL** unchanged. Do not share the key in chat.
3. Save and deploy the collector's latest commit. Trigger one run, or wait for
   the next scheduled run. No console/SSH commands are required.
4. Check that `eventRecovery.status` is `imported` (or `already-imported`), the
   overall run succeeded, and normal `errors` is empty. Counts depend on overlap
   with observations already present in the hosted database.
5. After successful verification, remove **EVENT_IMPORT_KEY** from the collector
   environment. Its import receipt and observations remain in the database.

These steps have **not** been performed on the hosted database merely by
preparing or pushing the code. Until the package is enabled and its run verified,
the production event has not been backfilled. Historical map controls, archive
coverage verification, automatic-run checks, hosted backups and failure alerts
remain separate follow-up work.

## Validation

The seven-capture package was imported into an isolated PostgreSQL 17 test
database using the pinned cryptography dependency. It produced 8,452 current
records and 8,460 changed-record revisions, including 2,392 quarter-hour rainfall
records. Reimport reported `already-imported` and zero new/changed records.
Source-health timestamps remained unchanged. Unit tests also cover altered
ciphertext, incorrect keys, checksum/provenance validation, protection of newer
revisions and continuing live collection after an import failure.
