# Gauge status and saved quarter-hour rainfall

The user-approved provisional rules are **suspect after 60 minutes** and
**out of action after 6 hours** without a valid observation. These are display
flags, not official BoM station statuses, alarms or proof of hardware failure.
Manual, event-driven and automated gauges report differently. Gauge-specific
reporting expectations remain future work; current limits can be adjusted on
the report page. No rise, fall, difference or rate of change triggers an alarm.

## Enable on the existing Render website

The collector already has its database connection. The **web service** needs
its own securely entered connection to read that same archive:

1. Open the existing `rainfall-map-viewer` web service, **Environment**.
2. Add **HISTORY_DATABASE_URL** with the same **Internal Database URL** from
   `rainfall-history`. Never paste the value into chat, screenshots or Git.
3. Save the setting and deploy the latest `main` commit. The new Docker image
   installs the same pinned PostgreSQL client already verified in the collector.
4. Open **Gauge status** in the navigation, or `/gauge-status`. Confirm it says
   **Connected to the saved observation archive** and shows a recent collector run.
5. Select a rainfall gauge to see **Saved 15-minute rainfall totals** and the
   expandable hourly/three-hour QA comparison.

No new service or paid subscription is required. Collector configuration and
collection continue unchanged. The website connections explicitly use read-only
transactions; they do not create/alter tables or import observations. PostgreSQL
reads have a five-second connection timeout and eight-second statement timeout.
Reads are cached for up to one minute. A dedicated database role with SELECT-only
permissions would provide additional separation beyond the transaction setting.

Without a configured archive connection, the page explicitly reports it pending.
Water statuses can still use the current website summary, but rainfall status and
collector monitoring remain unverified. A missing database/schema or failed read
produces an unavailable message without exposing credentials. No empty database
is silently created. Source collection failure is distinguished from a stale gauge.

## Status meaning

- **Current:** a valid observation newer than the suspect limit, with a recent,
  successfully checked source. A zero measurement is valid.
- **Suspect:** no valid observation for 60 minutes, a newer missing reading, or a
  timestamp more than five minutes in the future. Original records are preserved.
- **Out of action · age flag:** no valid observation for 6 hours. This may reflect
  the gauge's reporting practice rather than an equipment fault.
- **No valid observation:** no valid observation is available to date the gap.
  It is not automatically called an outage of known duration.
- **Unverified:** source/collection failed, its last check is over 30 minutes old,
  its issue time is over an hour old, or no archive status exists. A system-wide
  collection failure must not be presented as simultaneous equipment failures.
- **Identity unresolved:** rainfall station identity has not been confidently
  matched, so no quarter-hour record is assigned.

Last valid observation time and last collector/source check time are separate.
Valid here means a usable numeric observation; the archive preserves source
quality codes but their meanings have not yet been verified or used to certify data.
Repeated downloads cannot refresh the age of an unchanged observation timestamp.
Water summary dates remain explicitly identified as inferred from weekday/issue
time. The report updates each minute; it has no notification or alarm integration.

## Rainfall totals and QA

The new saved totals sum consecutive, complete 15-minute intervals for 15 and
30 minutes and 1, 3, 6, 12 and 24 hours. All end at the newest quarter-hour
timestamp present anywhere in the archive, which is displayed. A missing/null
block means **Incomplete**, never zero or a complete partial total. Duplicate
quarter-hours require investigation. A total can only cover archived history:
the collector cannot reconstruct expired fine-resolution observations.

Hourly and three-hour bulletin records remain stored as independent QA sources.
The latest available native block of each duration is compared with quarter-hours
for that exact same station identity and exact window. Agreement within 0.1 mm is
labelled a match; differences are shown without changing records or raising an
alarm. Partial quarter-hour coverage is not compared, and coarse values never
fill missing quarters. Rounding, publication timing and revisions can differ;
the earlier sample's matching hourly sums do not prove identical processing for
every BoM station or bulletin.

The original bulletin map, hyetograph and IFD comparison still use their labelled
three-hour observations. The separate [Rainfall history view](HISTORICAL_RAINFALL.md)
now provides a time slider, rolling map accumulations and quarter-hour IFD data
from the archive. The source/time basis stays explicit in each view.

Validation: unit tests cover age boundaries, missing versus zero, stale sources,
exact block alignment, repeatable read-only queries and QA gaps. Browser tests
cover report filters/limits, missing archive configuration and incomplete totals.
The read path was also exercised against a real PostgreSQL 17 test database;
stored records remained unchanged and transaction_read_only was on. Hosted
database access from the web service still requires the environment setting and
post-deployment verification described above.
