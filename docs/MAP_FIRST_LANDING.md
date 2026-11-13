# Map-first landing and coloured catchment context

## Landing behaviour

Rainfall, Water levels and Point Rainfall IFD now open directly on their maps.
A cold browser tab starts at a Queensland overview; the existing shared viewport
is retained when moving between viewers. A compact **Group** select loads the
chosen observation group. No group observation query is sent before a group is
chosen. Group rainfall summaries and the original group cards remain available
beside the map on desktop and below it on phones. Existing bookmarked group,
gauge, time and duration URLs continue to load their saved selections.

Re-clicking the active page tab clears the selected group and brings back the
compact group select without hiding the map. The old full-page group gate is
removed; this does not load all statewide gauge histories into the browser.

The masthead and page navigation are compact. Map height is calculated from the
actual remaining viewport, rather than a fixed pixel height or viewport fraction.
Map resizing preserves geographic centre/zoom. Tests check that the whole map
fits initially at 320 × 568, 390 × 844, 844 × 390 and 1440 × 1000.

Phone time/display settings are in **Map & time**, on the map. Fit/find actions
are also on the map. Larger desktop screens retain the sidebar controls.
Expanded-map mode remains available. Plots, source notes and group summaries
are reached by scrolling below the map; desktop viewer panes keep their existing
independent scrolling. Opening a settings disclosure does not add a large white
block above the map.

Dams keeps its dam selector immediately available on phones. Other dam/time/layer
controls move into an on-map disclosure on phones and remain in the desktop
sidebar. Dam attributes and source notes are in a disclosure below the map;
selecting a dam no longer expands a large metadata block ahead of its map.
Dams also shares the broader catchment context, while retaining its own selected
area, named-stream and gauge controls.

## Wider-scale catchments and colours

- **Zoom 5–8:** broad catchment/plan outlines and coloured overview areas.
- **Zoom 7–8:** supplied subcatchment overview dividers and coloured areas.
- **Zoom 9 onward:** detailed catchment/plan and supplied subcatchment geometry.
- Streams remain available from zoom 11, with stream names from zoom 13.

Overview geometry uses a 1 km precision grid and 1.2 km simplification for display
at small scales. It is replaced, not overpainted, by the existing detailed geometry
from zoom 9. This reduces wide-view file requests and avoids drawing both outline
representations together. Overview geometry is unsuitable for boundary/location
measurements. Native source polygons, detailed boundary topology and the regional
IFD assignments are unchanged.

Area fills use deterministic categorical colours. They distinguish geographic
areas; **they do not encode rainfall, AEP, water levels or warnings**. Translucent
fills preserve the basemap and sit below gauges. Catchment outlines remain solid,
subcatchment dividers remain dashed, and area polygons have no strokes of their
own. The **Area colours** checkbox in Layers removes fills while retaining
outlines. Areas are non-interactive: fills do not change on hover or capture
clicks intended for gauges.

All 41 native catchments, 146 supplied subcatchments and 19 derived water-plan
overviews remain governed by the source limitations documented in
[Map context methods](MAP_CONTEXT_METHODS.md). No new hydrological delineation,
stream connection or observation is inferred.

## Background selection is retained

**Background** is in Map & time on phones, beside the map on desktop viewers,
and in the dam settings panel for Dams. Options remain:

- Street (OpenStreetMap).
- Greyscale (the same OSM tiles, with only the tile imagery desaturated).
- Satellite + labels (Esri imagery and its place-label overlay).

Greyscale does not desaturate catchment fills, gauge symbols or chart colours.
Background choice remains remembered and does not change observations or map
position. Browser tests exercise hybrid imagery and greyscale selection on a
phone. External production tile availability is separate from these UI checks.

## Review evidence

With the same UI fixtures at 390 × 844, maps were measured as follows:

| View | Map top | Map bottom | Map height |
| --- | ---: | ---: | ---: |
| Rainfall / Water / IFD landing | 155 px | 835 px | 680 px |
| Selected rainfall group | 133 px | 835 px | 702 px |
| Dams landing | 158 px | 835 px | 677 px |

The prior mobile review placed the rainfall/water map around 264 px down the
page, with height 557 px, and required a separate group landing screen. The new
map is both earlier and fully visible on initial landing. Actual metrics vary
with device fonts, browser chrome, notice text and saved state.

Screenshots and layout measurements from the local fixture review are retained
outside the checkout at `/workspace/map-landing-review`. Data shown in those
screenshots is for UI validation, not a live rainfall assessment.

## Mouse interaction update

Mouse-wheel/trackpad scrolling over the map zooms the map again, across Rainfall,
Water levels, Point Rainfall IFD and Dams. Scroll outside the map, use the gauge
jump links, or scroll the chart panels to reach the plots. Phone touch page
scrolling, explicit Move map and pinch zoom retain their existing behaviour.

Catchment fills, boundary lines and their tiles are passive visual context. They
have no click selection, mouse highlight or polygon tooltip; their SVG panes let
pointer events pass through. Gauges, dam markers, map controls and background
selection remain interactive. Geographic colours and layer toggles are retained.
