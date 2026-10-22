# Rainfall Atlas — Southeast Queensland

A working prototype using **real Bureau of Meteorology IDQ60348 observations**, Leaflet, Chart.js and OpenStreetMap. Plain HTML/CSS/JavaScript, a small Python server, and a separate station coordinate file. Live bulletin views require no database, authentication, or API key.

An optional, separate [permanent observation collector](docs/COLLECTION.md) is
prepared for PostgreSQL and a scheduled job is not activated by deploying the
viewer. Archive views require the web service's own database connection.

Before purchasing collection hosting, use the [BoM FTP connection test](docs/BOM_CONNECTION_TEST.md)
on the existing free Render service at `/diagnostics/bom`. It requires one explicit
button click and does not create paid resources.

The [gauge-status report and saved 15-minute totals](docs/GAUGE_STATUS.md) read
the collector archive when `HISTORY_DATABASE_URL` is configured on the web service.
Report age limits default to 60 minutes / 6 hours; no rapid-change alarms are used.

[Morning-event recovery](docs/EVENT_RECOVERY.md) is prepared as an opt-in import
inside the collector. Preparing the package does not backfill the hosted database.

## Open it as a website

The included `render.yaml` and `Dockerfile` prepare this app for Render hosting. The code must first be committed and pushed to your GitHub repository; files in this cloud workspace are not automatically on GitHub.

1. Create an account at https://render.com using your GitHub account.
2. Once this code is on GitHub, choose **New → Blueprint** in Render and connect `tyrone-byte/rainfall-map-viewer`.
3. Review the proposed free web service and choose **Deploy Blueprint**. Do not select a paid plan unless you want one.
4. When deployment finishes, open the website address Render displays. That is the link to use on your computer or phone.

The free service may sleep when unused, so the first visit may take a while. Its local rainfall cache is temporary and can disappear on restart; the app fetches the real BoM bulletin again. No credentials or database are required. Automatic deployment is disabled in the blueprint so later GitHub changes do not automatically publish. Render must be able to reach BoM. The container listens on Render's assigned `PORT` and all network interfaces.

The hosting files are prepared here; that does not mean a Render account, deployment or public URL has been created. The app itself has passed local backend and browser tests. A local container-build attempt could not finish because its build network could not reach package repositories, so the container build and Render deployment still need validation.

## Run it

Install Python 3.10+, Node.js 18+, and curl if they are not already available. From this project folder:

```sh
npm ci
npm start
```

Open your browser at `http://localhost:8000`. Keep the terminal running. Press Ctrl+C to stop.

The initial installation needs internet access. After installation, the server needs access to `reg.bom.gov.au`; your browser needs `tile.openstreetmap.org`. Leaflet and Chart.js are served locally. No secret keys are needed.

If port 8000 is already in use: `python3 server.py --port 8001`.

## What you can do

- Pan/zoom the map and select a coloured gauge, or search the station list.
- Filter by catchment/station group and rainfall colour band.
- See the latest completed 3-hour rainfall, the sum across the bulletin's eight separate blocks, an observation table and a chronological bar-chart hyetograph.
- Adjust the initial 5 / 15 / 30 / 40 / 50 / 80 / 130 / 180 / 200 mm display boundaries. Values above 200 mm have their own band. The gauge list sorts by latest completed 3-hour rainfall, highest first, with missing readings last and alphabetical ties. These are **user display thresholds, not official BoM warning thresholds**. Settings last for the browser session.
- Check the BoM issue time and freshness status. Refresh manually or let the page check every five minutes.

## Data integrity and limitations

Source: https://reg.bom.gov.au/cgi-bin/wrap_fwo.pl?IDQ60348.html

This particular bulletin covers Brisbane, Pine, Caboolture and tributaries, not every southeast Queensland catchment. The prototype deliberately follows the requested source.

The actual bulletin retrieved on 22 October 2026 at issue time 08:53 AEST contained **321 gauge rows, with 181 confidently matched map locations and 140 unresolved locations**. Counts will vary with source updates. Unresolved stations remain searchable and show rainfall tables/charts but are not plotted.

- Empty cells, dashes, and unrecognised observations stay missing (`null`), never zero. Unknown readings generate a visible notice. The chart leaves missing bars empty.
- The recent total is the sum of the eight available 3-hour blocks, not a BoM daily total. If any blocks are missing it is explicitly labelled a **partial sum**; entirely missing data has no total.
- All dates use AEST (UTC+10). The rightmost column is anchored at or before bulletin issue time, with earlier columns dated backwards in 3-hour steps across midnight. Unexpected headings, missing issue times or malformed row lengths reject the update rather than shifting readings into incorrect columns.
- Latest colour uses the same final completed period for every station. Missing latest values stay grey even if an earlier value exists.
- Separate `data/stations.json` coordinates come from official BoM Queensland flood network catalogues, sections [1](https://reg.bom.gov.au/qld/flood/networks/section1.shtml), [2](https://reg.bom.gov.au/qld/flood/networks/section2.shtml), and [3](https://reg.bom.gov.au/qld/flood/networks/section3.shtml), dated **5 January 2022**. Each record includes station number, source, catalogue date, and matching method. Coordinates are historical catalogue locations, not newly surveyed locations.
- Matching uses exact names after punctuation/case normalisation and removal of catalogue telemetry suffixes. No approximate geocoding or invented coordinates. Multiple catalogue matches more than roughly 150 metres apart are rejected. Only positions within the southeast Queensland region are eligible.
- Two different observations in the captured bulletin are both named “Dayboro” in the same group. Both are retained with distinct IDs; neither is plotted because the source does not establish which gauge is which.
- The last successful parsed bulletin is cached in `.cache/bulletin.json`. Refresh failures preserve that genuine bulletin and display a warning. First-load failures display an error and no observations. Old cached data never becomes fresh merely because a request succeeds.
- Freshness is a display heuristic: a bulletin over four hours old, latest period over six hours old, clock mismatch, or refresh failure is flagged. It is not an official BoM service status.
- New or renamed stations may require a coordinate catalogue update. Coordinate discovery is never repeated during rainfall refreshes.

This is a prototype, **not an operational warning system**. Source data may be delayed, incomplete or incorrect. Follow official warnings. Rainfall © Commonwealth of Australia, Bureau of Meteorology; some data may originate from contributing agencies. Base map © OpenStreetMap contributors.

## Validation

```sh
npm test
```

Runs parser and server-cache regression tests, including missing observations, midnight rollover, malformed source pages, official coordinates, and failed refreshes. `tests/fixtures/bulletin.html` is an actual BoM capture, used only for testing; the running app does not load it as live data.

With the app running, browser tests use a local Chromium installation:

```sh
npx playwright test
```

If Chromium is elsewhere, set `CHROMIUM_PATH` to its executable path. Tests exercise the live API, map selection, chart values, search and filters, threshold editing, missing bars, partial sums, outage messages, and mobile layout. Browser failure-case tests deliberately alter network responses; these values never reach the running app or rainfall cache.

## Files

- `server.py`: static files, live BoM fetching, validated local cache and coordinate join.
- `rainfall.py`: defensive HTML bulletin parser, dates and separate observations.
- `public/`: interface, Leaflet map, Chart.js hyetograph and styles.
- `data/stations.json`: reusable, sourced coordinate catalogue.
- `tools/import_coordinates.py`: one-off catalogue import helper; not used by live refreshes.
- `tests/`: real-source regression fixture, backend tests and browser tests.

To refresh coordinates, download the official section1/2/3 catalogues as `bom-rain.html`, `bom-stations.html`, and `bom-telemetry.html`, then run `python3 tools/import_coordinates.py <paths to those files>`. Review the resulting records and matches before accepting them. The catalogue format is fixed-width and an upstream layout change needs a reviewed importer adjustment.

## Brisbane IFD reference

`data/brisbane-ifd-2030.csv` preserves the product owner’s supplied “Default Current (2030) Baseline.csv” as reference material. Its 180-minute row includes 130.2 mm at 1% AEP, 180.0 mm at 0.1% AEP, and 195.9 mm at 0.05% AEP. The product owner confirmed the values are rainfall depths in millimetres. The file itself does not establish location, authorship or climate-adjustment provenance; its Brisbane/2030 context is user supplied. These reference estimates are not rainfall observations, station-specific exceedance assessments, or official warning thresholds. The display bands remain user-defined and are not automatically labelled with AEP or return periods.

## IFD comparison

Selecting a gauge displays the supplied Brisbane 2030 design depth curves (50%, 20%, 10%, 5%, 2%, 1%, 0.1% AEP) from 5 minutes through 24 hours, with observed accumulation points from 3 hours onwards. The horizontal axis uses a logarithmic duration scale; the vertical axis shows depth in mm. This is a depth–duration comparison, not a reconstructed sub-hourly intensity record.

- **Ending at latest observation** sums consecutive blocks backwards from the bulletin’s last completed block.
- **Wettest available window** searches all complete block-aligned windows for each duration independently. Points can have different start/end times, shown in tooltips. It cannot find a peak window offset from the 3-hour block boundaries.
- Missing or discontinuous blocks invalidate a window. The wettest mode warns when excluded windows mean the actual peak is unknown. No gap is filled with zero.
- A table compares 3-, 6-, 12- and 24-hour observed depths with exact 10%, 1% and 0.1% AEP values from the supplied table. No return period or station AEP is inferred.
- Only the current bulletin window is used; no persistent observation history has been added.
- The supplied Brisbane 2030 reference is contextual for other gauge locations and is not automatically valid local design rainfall or an official warning threshold. Short-duration reference curves are shown, but no observed rainfall is invented below 3 hours.

`npm test` includes Node.js regression tests for these calculations. Browser checks include both modes, missing windows, malformed references and mobile layouts.

## Water levels page

Use the **Rainfall / Water levels** navigation tabs to switch between separate dashboards. `/water` uses BoM IDQ60286 for Brisbane, Pine, Caboolture and tributaries. Selecting a point or station fetches its linked official observation table and plots a water-level hydrograph, with 3-hour, 6-hour, 12-hour, 24-hour, 72-hour and 7-day windows ending at the latest available report.

- Gauge coordinates in `data/water-stations.json` are imported by exact station number from the official BoM section 3 river catalogue dated 5 January 2022, independently of rainfall names and rainfall updates. The captured bulletin has 233 gauges; 226 have catalogue matches and 7 remain explicitly unresolved.
- Markers and default ranking use BoM's **reported flood classification**, not the raw numerical height. Colours are below flood level (teal), minor (yellow), moderate (orange), major (red), and missing level/unsupplied classification (grey). Unknown classification never means safe or below flood level.
- Heights preserve their stated AHD or LGH datum, including negative and missing values. Raw heights from different stations must not be ranked as if they were comparable water depths.
- Flood classification reference lines are shown only when explicitly supplied by the gauge's history page and matching the bulletin datum. They are not invented or transferred from a nearby station. Tendency is the source's reported tendency, not a calculated forecast.
- Source observation times are preserved, including irregular sampling and duplicate timestamps. Missing values and intervals over six hours break the plotted line. The recent table shows up to 100 readings in the selected window, newest first; the chart includes all reported readings in that window.
- Bulletin weekday/time dates are inferred from the issue time within the preceding seven days. Raw reported times remain visible. The history table supplies full observation dates. Observations older than three hours are flagged separately from bulletin freshness.
- Current bulletin and history snapshots are labelled separately, since BoM can update them at different times. Refreshes occur every five minutes, with history fetched on selection. Failed refreshes retain only genuine previous data with a warning; first-load failures show no invented series.
- History requests accept only station IDs present in the summary and use the bulletin's validated BoM history paths. No arbitrary URL fetching is exposed.
- This does not provide predictions, discharge, rainfall-to-river modelling, or operational warning decisions. Follow official warnings and agency guidance.

`water.py` parses the two river formats; `water_service.py` fetches and caches them; `public/water.html` and `public/water.js` provide the dashboard. The Docker image includes both new Python modules. Real captured fixtures and browser regression checks cover station identity, datums, missing/negative heights, failed histories, navigation and selection races.

## Shared map viewport

Panning or zooming either dashboard saves its map centre and zoom for this browser tab. Switching between Rainfall and Water levels, or reloading, restores that viewport. Automatic data refreshes do not refit the map. **Fit gauges** still deliberately fits the currently visible gauges. A new tab with no saved viewport uses the normal initial fit. Browser storage is optional: blocked or corrupt storage never prevents either dashboard from loading.

## Local ARR 2030 IFD datasets and manual collection pilot

Goolman's user-uploaded ARR JSON has been imported at the verified coordinates `-27.736111, 152.766667`. The normalized local file contains all 12 supplied 2030 tables: three source families and SSP1/SSP2/SSP3/SSP5. No family or scenario is chosen automatically. In the rainfall gauge detail, explicitly choose a **Local dataset and climate scenario**. Other gauges currently show the shared Brisbane reference with an explicit no-local-table notice. A known local-file failure never silently substitutes the Brisbane table.

`data/ifd/index.json` maps exact six-decimal gauge coordinates to files under `data/ifd/locations/`. Each file records coordinates, source request, ARR version, named families/scenarios, units, raw-response SHA-256, import time and acquisition method. Manual uploads have no invented fetch timestamp. Original JSON responses are retained under `data/ifd/raw/` for traceability, excluded from the app image. The public viewer reads saved files only; it never makes ARR requests.

`tools/import_arr_ifd.py` validates a manually downloaded JSON before importing. It requires explicit expected latitude/longitude, rejects mismatched locations and malformed axes/values, preserves every supplied 2030 table, and never extrapolates or calculates missing design values. Example for the supplied file:

```sh
python3 tools/import_arr_ifd.py results.json --lat=-27.736111 --lon=152.766667
```

The **Collect ARR IFD pilot** GitHub Actions workflow is manual only, with read-only repository permission. It is not triggered by commits, schedules, page visits or viewer refreshes. Run it from GitHub → Actions → Collect ARR IFD pilot → Run workflow. Choose 1, 3 or 5 maximum new coordinate requests. It uses only the documented `CCAdjIFDDatasets=1` point API, with verified target coordinates in `data/ifd/targets.json`.

- One request at a time, at least 30 seconds between requests, no automatic retries, and at most five new requests per run. This spacing is our conservative trial setting, not a published ARR limit or a guarantee of permitted bulk use. Stop on any access refusal, HTTP error, rate limit, timeout, format change or coordinate mismatch. Rate-limit `Retry-After` is recorded for review; the job does not retry automatically or bypass restrictions.
- Completed downloads are cached between manual workflow runs when the GitHub cache remains available. Existing normalized files are skipped. GitHub caches may be evicted, so review previous downloads before repeating a trial. The job is serialised to avoid overlapping runs.
- Results and `pilot-report.json` are saved as the **arr-ifd-pilot-results** workflow artifact for 30 days, including partial results on failure. Download that ZIP and provide it for validation/import. The workflow does not commit data, update Render, or publish automatically.
- The target list covers the 181 confidently mapped rainfall coordinates from the captured bulletin. Unsupported/missing coordinates are excluded; coincident coordinates share a download. This is a capped pilot, not an enabled all-gauge batch.

No pilot has been launched by preparing these files. Actual ARR access from a GitHub runner still needs testing. Review the pilot outcome and ARR usage guidance before enabling any broader collection.
