# Rainfall Atlas — Southeast Queensland

A Queensland prototype using saved BoM observations, Leaflet and Chart.js, with
plain HTML/CSS/JavaScript, a small Python server and PostgreSQL history storage.

The home page opens **Rainfall** (`/history`); **Water levels**
(`/water-history`) and **Gauge status** are the other views. Select a BoM basin
before gauges appear. The old bulletin pages have been retired; `/water` redirects
to water history. History durations extend to seven days. Missing readings remain
missing, and the rainfall IFD comparison remains bounded to the preceding 24 hours.

The collector stores IDQ65900 quarter-hour rainfall and all available river-height
observations from IDQ65911/IDQ65910. See [water FTP collection](docs/WATER_FTP_COLLECTION.md)
and [compact history](docs/COMPACT_HISTORY.md). The viewer requires its configured
`HISTORY_DATABASE_URL` (or `DATABASE_URL`); collection runs independently of visitors.

Water markers can show rising/falling, measured rate of rise, or observation age.
Rate display bands are prototype settings, not warning thresholds; tidal effects
are not removed. Street, greyscale and satellite-with-labels backgrounds are
available on both viewers. On phones the page order is time controls, map,
plots, then station search/list, with jump links between map and gauges.
Names and coordinates are stored separately from
observations; unresolved coordinates are never invented.

## Open it as a website

The included `render.yaml` and `Dockerfile` prepare this app for Render hosting. The code must first be committed and pushed to your GitHub repository; files in this cloud workspace are not automatically on GitHub.

1. Create an account at https://render.com using your GitHub account.
2. Once this code is on GitHub, choose **New → Blueprint** in Render and connect `tyrone-byte/rainfall-map-viewer`.
3. Review the proposed free web service and choose **Deploy Blueprint**. Do not select a paid plan unless you want one.
4. When deployment finishes, open the website address Render displays. That is the link to use on your computer or phone.

The free service may sleep when unused, so the first visit may take a while. History remains in the configured persistent database; the web service uses its internal connection URL. Automatic deployment is disabled in the blueprint so later GitHub changes do not automatically publish. Render must be able to reach BoM. The container listens on Render's assigned `PORT` and all network interfaces.

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

Selecting a saved rainfall gauge displays its hyetograph and design-depth
comparison. The IFD calculation uses the preceding 24 hours of complete observed
15-minute blocks, independently of the map/chart duration (which can be seven
days). “Ending at selected time” and “Wettest windows in preceding 24 hours”
remain available. Missing blocks leave gaps; no return period is assigned to an
event. The default reference is the supplied Brisbane 2030 table; saved local
ARR tables require explicit scenario selection as described below.

## Historical water levels and map controls

`/water-history` reads the FTP observations stored by the collector. Select a
BoM basin, duration, ending time and gauge. Original timestamps, AHD/LGH datums,
missing values and negative heights are preserved. Recorded points can be turned
on; dashed segments indicate observation gaps without fabricating measurements.
Official BoM plot/table links allow comparison with the current source record.

Controls above the map select rising/falling, rate of rise or observation-age
colours, and a separate change-comparison period. Street, greyscale and satellite
with labels are available on both history maps. See [MAP_CONTROLS.md](docs/MAP_CONTROLS.md)
for definitions, display bands and missing-data handling. Background changes do
not alter zoom or observations. Browser storage remembers the background choice;
map position is shared between views, and selecting a new basin fits its gauges.

The former `/` bulletin and `/water` live pages have been retired and redirect
to the corresponding saved-history views. Their dedicated frontend scripts and
obsolete browser tests have been removed; collector/migration code is unchanged.

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

### Observation storage update

The compact collector and verified cleanup are documented in
[COMPACT_HISTORY.md](docs/COMPACT_HISTORY.md). Deploy the web reader first, then
rebuild/run the collector. Viewer grouping changes and automatic three-month
retention are separate next steps.
