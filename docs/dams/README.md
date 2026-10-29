# GaugeView Dams

The /dams page explores water-plan areas containing dams, separately from Rainfall and Water levels. It uses existing read-only archive endpoints. No collector, database schema, retention policy or historical observations change.

## Dam inventory

The project owner supplied 49 dam/storage records on 29 October 2026: 25 Seqwater, 24 Sunwater. The original CSV is preserved here. Catchment areas are hectares, user confirmed; displayed km² = ha / 100. Coordinate datum and asset positions have not been independently verified. Other engineering columns lack confirmed units/datum and are not calculation inputs. No current capacity claims are made.

Build the location/station catalogue with `python tools/build_dam_catalogue.py`. It contains mapped identities from the existing audited station catalogues, not observation copies.

## Uploaded water-plan boundaries

Source: Queensland Spatial Catalogue extract supplied by the user, `QSC_Extracted_Data_20261029_100816361430-2380.zip`, preserved as `data/dams/water-plan-source.zip` with its original XML/HTML metadata and File Geodatabase.

Dataset: **Water plan catchments - Queensland**, 187 valid MultiPolygon features, all marked Current in this extract; original CRS EPSG:4283 (GDA94). Copyright © The State of Queensland 2025, licensed CC BY 4.0. Source attribution and licence link appear on the map. Metadata explains that the areas are administrative and may follow cadastral rather than drainage boundaries. They are not assumed to delineate dam inflows.

Preparation: `pip install pyogrio shapely pyproj`, then `python tools/build_dam_boundaries.py`. These are offline preparation dependencies, not Render runtime or collector dependencies. Rebuild after changing either the dam/gauge catalogue or source polygons. Source SHA256 is retained in `public/dam-boundaries.json`.

46 of 49 dam coordinates fall inside a polygon. **Burdekin Falls Dam, EJ Beardmore Dam and Leslie Dam** have no containing feature and show no gauges. No nearest-area snapping or radius fallback occurs. Original dam `catchmentBoundary` values remain null: water-plan matches are stored separately. `boundary-matches.json` records the matching results.

Where polygons overlap, prefer Subcatchment Area over Catchment Area, then smallest projected area, then source object ID for a deterministic tie. Julius is inside both; its Upper Leichhardt subcatchment is selected rather than the parent Leichhardt catchment. Wivenhoe and Somerset both match Central Brisbane River; this is not their full upstream contributing drainage area.

Gauge membership is calculated from the **original unsimplified polygons**, respecting holes and multipart geometry; points on polygon edges are included. Coordinates are transformed to the source CRS for matching. The supplied dam coordinate datum remains an assumption; no sub-metre matching accuracy is claimed. No adjacent/upstream catchments are inferred or combined.

Only the 35 distinct display polygons needed by matched dams are shipped. Each outline is loaded on selection and simplified by 40 m in Australian Albers EPSG:3577, then transformed to EPSG:4326 GeoJSON. Simplification affects display only, never gauge membership. Fine boundary details may therefore differ visually from exact membership; this is a context map. Original shapes remain in the source ZIP.

## Viewer behavior

Selecting a dam draws/fits its matched water-plan polygon. Both map and list exclude gauges outside that polygon. Other dam markers remain visible for context. Only BoM basin frames needed for within-area mapped station IDs are requested, at most two concurrently. No spatial database or observation joins are introduced.

Rain circles show selected-duration measured totals; incomplete records are grey. Water squares show the existing measured 60-minute rising/falling comparison. These are display colours, not warnings. Layer visibility is independent. Boundary-name and water-plan labels stay visible. No rainfall area average, runoff, inflow or storage response is calculated.

Shared ending time is Brisbane AEST, aligned to quarter hours and bounded by the latest common available rain/water extent. If one extent is unavailable the other remains usable. Stale responses are ignored. A failed basin does not discard successful results. Failed boundary-index loading pauses gauge display; an outline-file failure retains source-derived filtering and shows a message. Time changes preserve map position; selecting a different dam fits its area.

Charts contain recorded observations only. Missing rainfall stays missing; water lines break at missing/different-datum readings or gaps over 60 minutes. The full-gauge viewer link provides existing detailed tools and BoM links. Phone order is controls, map, chart, list. Desktop and phone use normal document scrolling, including scrolling over the map without wheel zoom.

## Next work

Add user-supplied streamlines as geographic context when available. Verify genuine contributing dam boundaries and transfer-source catchments before any runoff calculations. Off-stream storages and nested dams need specific treatment. Owner storage feeds and station-specific IFD acquisition remain separate work.
