# GaugeView Dams

The Dams page shows dam attributes, its water-plan area and named watercourses, and **one nearest mapped water-level station**. Rainfall and Water levels remain separate full viewers. No collector, reading schema, retention or database content changes.

## Supplied dam attributes

49 dam/storage records, 25 Seqwater and 24 Sunwater, supplied 29 October 2026. Original CSV preserved here. User confirmed catchment and full-supply surface areas in hectares and full supply volume in megalitres. Surface area is at full supply; volume is a supplied full-supply attribute, not a live storage reading or verified current operating capacity. Coordinates and their unspecified datum remain unverified. No conversion from observed level to volume is attempted.

`python tools/build_dam_catalogue.py` builds `public/dams-catalogue.json` and the review list `nearest-water-gauges.json`. Gauges come from the existing audited mapped station catalogue. The nearest is chosen by great-circle distance to the supplied dam point, irrespective of water-plan boundaries or saved data availability. Identical-distance ties prefer a name without the TW token, then station ID. The available coordinates do not resolve such co-located headwater/tailwater sites physically. No name-based override of a genuinely closer point is applied. Distance in kilometres and the full station name are displayed, with storage association explicitly unverified. Only the selected station is drawn and queried; other nearby/within-area gauges and rainfall points are removed.

This is not proof of storage-level measurement. The closest stations for **Eungella, Fred Haigh, Maroon and Wuruma** have TW in their BoM names. Bromelton, Isis, Moura and West Barron also select river gauges that may not measure the storage. No claim that most nearest gauges are storage gauges is made. A later verified association/override table may be appropriate. There is no silent switch to a different gauge if the nearest lacks observations.

## Water-plan areas

The original source extract is `data/dams/water-plan-source.zip`, including XML/HTML metadata and File Geodatabase. Dataset: Water plan catchments - Queensland; 187 valid polygons, all marked Current in the extract; EPSG:4283 GDA94. © The State of Queensland 2025, CC BY 4.0. Planning areas may follow cadastral rather than drainage boundaries, and are not verified upstream dam catchments.

46 dam points have a containing polygon; Burdekin Falls, EJ Beardmore and Leslie do not. The most specific Subcatchment Area is preferred to a parent Catchment Area, then smallest projected area. Both area title and broader water-plan name are displayed. No matching boundary is required for nearest-station selection. CatchmentBoundary remains null in the dam catalogue; contextual water-plan associations are separate.

Offline preparation: install pyogrio, shapely and pyproj, then `python tools/build_dam_boundaries.py`. Outputs contain source hash and matching report, plus 35 display outlines simplified 40 m in EPSG:3577 and transformed to EPSG:4326. Previous exact source-polygon gauge memberships remain in the index as preparation metadata but **no longer control gauge display**. Rebuild after changing source dam/station inventory. No GIS packages are needed on Render.

## Watercourses

User-supplied `QSC_Extracted_Data_20261029_101604167654-3208.zip`: Watercourse identification map — watercourses, 9,311 source features in GDA2020 EPSG:7844. Source XML confirms © The State of Queensland 2025, CC BY 4.0. Original upload remains in the workspace attachments; this larger ZIP is not copied into Git. `watercourses-source.json` records its source filename, checksum and preparation settings.

Prepare with `python tools/build_dam_watercourses.py <source.zip>` using the same offline GIS dependencies. The dataset has **no stream order or primary/major classification**. Our display heuristic retains named rivers and named creeks with at least 10 km summed mapped length by exact name, excluding unnamed tributaries, drains and gullies. Shared names can refer to disconnected reaches: this is cartographic filtering, not a hydrological classification or complete river network. 4,059 source segments qualify statewide.

Features are clipped to each selected water-plan area; for the three unmatched dams, context is clipped to a 20 km radius. Display lines are simplified 30 m in Australian Albers, then converted to 2D EPSG:4326 GeoJSON. Source Z/M values are dropped for display only; they are not used as elevation or flow information. The dataset is a watercourse-identification map, not a guarantee of every stream's mapping or physical extent. One per-dam context file loads on selection. Toggle hides/shows streams without changing observations, map position or ending time; hover identifies the stream. Attribution remains visible.

## Gauge observations and links

One water-only basin frame and one station series are queried from existing read-only APIs, using the nearest station's own BoM basin, even if it lies outside the contextual polygon. Default duration 24 h, up to 7 d. Ending time is Brisbane AEST, bounded by water archive extent at minute resolution. No rainfall availability dependency. The hydrograph opens automatically after frame loading; explicit gauge clicks can scroll phones to it. Stale async responses are ignored. Boundary or stream loading failure does not block the gauge.

Measured water levels remain at original observation times. Missing readings, datum changes and gaps over 60 minutes break the line. No interpolated levels, rainfall estimates, runoff, storage response or warnings are generated. Current display colours use the existing measured 60-minute movement comparison. Normal document scrolling works over the map without wheel zoom.

BoM plot/table paths are taken from the station catalogue or existing verified-link API. Paths must match the selected six-digit station ID and expected BoM path pattern; no guessed direct plot URLs. Where a direct link is unavailable the source group bulletin remains available when present. The full Water levels viewer link carries station, basin, ending and duration. Direct BoM links show its current record, potentially different dates from the selected saved window.

## Viewer refinements

The three numeric reference-stat titles are **Assumed surface area at full supply**, **Assumed full supply volume**, and **Assumed catchment area**. Owner and water-plan names retain their descriptive titles.

The card below the automatic water hydrograph lists the **closest rainfall gauge**, its distance to the dam and a link to the Rainfall viewer. This replaces the redundant water-gauge list; the map still shows only the nearest water-level gauge. Rainfall association uses the same geographic distance method and mapped station catalogue, without implying catchment representation. The link carries the duration and selected ending time rounded down to a measured rainfall quarter-hour; Rainfall applies its existing archive-extent checks. No additional rainfall frame/series requests are made on the Dams page.

Watercourse names appear at zoom 11 and above, only for paths with at least 80 screen pixels visible. One label per name is placed on a visible path, with bounding-box overlap checks and a limit of 12 labels (6 on narrow maps). Labels refresh after pan, zoom, resize or dam changes; disabling Named watercourses hides both lines and labels. Labels are noninteractive so scrolling and map interaction remain available. These are names from the uploaded watercourse dataset, not a new stream hierarchy.
