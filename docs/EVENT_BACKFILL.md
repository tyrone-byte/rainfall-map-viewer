# One-off uniform rainfall estimates for the October event

The viewer is restored to commit 159fcc2. No coarse-period fallback remains in
its map, chart or IFD logic. The collector runs `event_backfill.backfill_event`
once against the existing database, protected by the normal collector lock and
an `event_imports` receipt. No import key or new environment variable is needed.

This is explicitly user-authorized estimation, not recovered observations.
Saved three-hour depths are divided by twelve and inserted into the normal
`rain-15m` series only where there is no existing quarter-hour row. Missing coarse
depths are skipped. Conversion is bounded to quarter-hour ends after 21 October
2026 06:00 AEST through 22 October 2026 08:00 AEST, before the first genuine
08:15 observation. The original three-hour observations and source snapshots
remain unchanged. This does not enable estimation for future missing readings.

Each estimate has quality `ESTIMATED_UNIFORM_3H`, metadata `estimated: true`,
the parent observation ID, parent depth/end and conversion method. Exports retain
the quality code. Genuine quarter-hour readings take priority even if their
source issue is older than the estimate's parent bulletin. Revision history is
preserved when a real observation replaces an estimate.

The restored viewer uses the uniform estimates in map totals, bars and IFD
calculations as requested. It does not distinguish their appearance. They cannot
reproduce embedded bursts; all twelve estimates have the same depth. If existing
native observations cover part of a coarse block, those native values are kept;
the combined block total may therefore differ from the coarse bulletin total.

Deploy the web service and rebuild the collector from the latest commit. On the
next collector run its logs include `eventBackfill` with inserted count; subsequent
runs report `already-imported`. Existing collection continues as before. Source
freshness timestamps are not updated by this historical import.
