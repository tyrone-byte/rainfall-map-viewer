# GaugeView Dams: initial viewer

The /dams page is a spatial exploration prototype, separate from the existing Rainfall and Water levels viewers. It uses their existing read-only archive endpoints. No collector, reading schema, retention policy or historical observations change.

## Inventory and provenance

The project owner supplied 49 dam/storage records on 29 October 2026: 25 Seqwater, 24 Sunwater. Original CSV is preserved here. Owner is retained explicitly. Catchment areas are hectares, confirmed by the user; displayed km² = ha / 100. Coordinates are supplied longitude/latitude, but their datum and asset positions have not been independently verified. Other engineering columns have no confirmed units/datum and are deliberately not exposed as calculation inputs. Current capacities may differ from historical full supply volumes; this page makes no storage/capacity claims.

public/dams-catalogue.json contains dam points and mapped station identities from the existing audited rainfall and water catalogues. These station identities remain separate from observation records. No observation values are duplicated into static files.

## Boundaries still needed

All catchmentBoundary values are null. No authentic boundaries have yet been obtained. The selectable 25/50/100 km dashed search circle is explicitly proximity only, not a contributing catchment, drainage delineation or hydrological gauge assignment. Gauges outside contributing catchments can appear. No area average, runoff, inflow or dam storage response is calculated.

Research attempts against Queensland spatial services/open data, Seqwater, Sunwater and data.gov.au were blocked by the execution environment proxy (403). Candidate routes remain Queensland Globe's underlying spatial datasets, asset-owner catchments and, if necessary, validated upstream aggregation of BoM Geofabric catchments. Availability/licensing have not been verified. Off-stream and balancing storages need transfer-source information; nested dams need full versus incremental catchment distinctions.

## Observed context

Only basin frames containing mapped gauges inside the chosen proximity radius are requested, at most two concurrently. Rainfall and water appear together with distinct circle/square symbols and independently selectable visibility. Rain colours use selected duration depth, with incomplete records grey. Water colour uses the existing measured 60-minute movement comparison (no interpolation). These are display colours, not official thresholds. Other dams remain on the map for context.

Ending time is shared in Brisbane AEST, aligned to quarter hours, and bounded by the latest common available rainfall/water extent; if one extent is unavailable the other remains usable. Frame requests are cancellable and stale responses ignored. One failed basin does not discard successful results. Radius changes fit the map; duration/ending changes preserve its position. Successful frame queries use existing server caches.

Gauge charts use measured observations only. Rain charts show 15-minute bars, missing values remain gaps; water lines break at missing levels, datum differences and gaps exceeding 60 minutes. A link opens the selected gauge in its full existing viewer, including its detailed tools and BoM links. The Dams prototype does not duplicate IFD analysis. Phone order: controls, map, selected gauge chart, list.

## Next work

Obtain and verify true contributing boundaries, including source/version/licence/CRS and transfer context. Then replace proximity-based selection with verified catchment membership while preserving optional nearby/downstream context. Dam-specific official information links and reliable timestamped owner storage feeds can follow. Gauge-specific IFD acquisition is separate work, not included in this initial Dams page.

The Dams page uses a single document scrollbar on desktop and phone, overriding the shared history stylesheet's fixed-height desktop pane layout. Scrolling over the map scrolls the page rather than zooming it.
