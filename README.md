# Rainfall Atlas — Southeast Queensland

A working prototype using **real Bureau of Meteorology IDQ60348 observations**, Leaflet, Chart.js and OpenStreetMap. Plain HTML/CSS/JavaScript, a small Python server, and a separate station coordinate file. No database, authentication, or API key.

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
- Adjust the initial 5 / 15 / 30 mm display boundaries. These are **user display thresholds, not official BoM warning thresholds**. Settings last for the browser session.
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
