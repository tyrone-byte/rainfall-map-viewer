# Regional default 2030 IFD references

The supplied `initial_IFD_regions.zip` contains 18 LGA polygons in GDA2020.
Each region has one ARR **Default Current (2030) Baseline** sampled at its
area-weighted polygon centroid. Centroids are calculated in **EPSG:9473,
GDA2020 / Australian Albers**, transformed to WGS84 and rounded to six decimals.
All 18 centroids are inside their own polygons. No centroid was moved to another
point. The source ZIP, polygon GeoJSON, source checksums and centroid method are
retained under `data/ifd/regions/`.

Assignment uses the saved rainfall catalogue (`data/rainfall-groups.json`),
not catchment membership or nearest-centroid distance. Point-in-polygon uses
`covers`, so boundaries count; multiple matches are flagged and not assigned.
Of 2,007 catalogue entries, 633 match exactly one region, 698 are outside all
regions and 676 have no coordinates. There are no ambiguous matches. Covered
entries represent 631 distinct coordinates; duplicate coordinates share the
same reference. These counts describe the catalogue, not gauges with current
observations. Missing locations are not inferred.

## Viewer behaviour

`data/ifd/index.json` maps gauge coordinate keys to centroid coordinate keys in
`regionalAssignments`; the existing `locations` map resolves those keys to
saved reference files. All covered gauges automatically use their region's
single default current 2030 table, including Goolman. The previously imported
Goolman multi-scenario file is retained but does not override its assigned region.
Uncovered gauges retain the existing explicitly labelled Brisbane fallback or
saved local reference. A failed assignment index or a failed known regional file
shows an error without displaying Brisbane curves.

The viewer identifies the LGA, centroid, ARR version, baseline and units. It
states that this is a regional centroid sample, not a gauge-specific IFD.
Orographic variation inside a region is not represented. These are design
references, not observations or a return period assigned to observed rainfall.
The displayed/downloadable dataset contains only the default current 2030 table;
the unmodified raw ARR response also includes a historical table for audit.
ARR chooses its default underlying dataset; the JSON response does not identify
the selected underlying family, so no LIMB/QRA/BoM attribution is invented.

## Explicit collection and reproducibility

Collection is manual only. The web server and page visits never call ARR.
`tools/collect_regional_ifd.py` requests `BoMIFD=1&type=json` for one centroid
at a time, waits **10 seconds after completion** before the next download, and
has no additional batch pause. It stops on the first HTTP error, rate limit,
timeout, coordinate mismatch or malformed table. There are no automatic retries.
Any returned `Retry-After` is recorded for review, not retried. A successful small
run does not establish a published service limit.

Every response is checked for matching coordinates, positive ordered durations,
unique valid AEP columns, required chart AEPs, rectangular finite nonnegative
depths and the exact current 2030 table name. Raw responses, SHA-256 receipts,
fetch timestamps and collection outcomes are saved. Re-running validates and
reuses cached successes. Viewer assignments are written only after every region
has a valid saved dataset. An interrupted run can resume with `--collect`.

To rebuild GIS preparation, extract only the shapefile components from the saved
ZIP to a local directory. GIS dependencies are build tools, not server runtime
requirements. The preparation used Python 3.12, pyshp 3.1.8, shapely 2.2.0 and
pyproj 3.8.0:

```sh
/workspace/rainfall-venv/bin/python tools/collect_regional_ifd.py \
  --source /workspace/ifd-regions-source/initial_IFD_regions.shp
```

To explicitly collect missing centroid references or validate cached results:

```sh
/workspace/rainfall-venv/bin/python tools/collect_regional_ifd.py --collect
```

Do not delete caches merely to rerun collection. Refreshing published source
values requires a separate deliberate decision. Preparation and saved
assignments must be regenerated when region boundaries or gauge coordinates
change. The collector/history database and original rainfall observations are
unmodified. No deployment, push or publication is part of this change.
