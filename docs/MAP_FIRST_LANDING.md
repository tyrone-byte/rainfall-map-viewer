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
Expanded-map mode remains available. Gauge plots and source notes open in a non-modal detail panel; the desktop
legend/layer rail keeps an identical width across Rainfall, Water levels and IFD.
Group summaries remain in the station sidebar. Opening a settings disclosure does not add a large white
block above the map.

Dams keeps its dam selector immediately available on phones. Other dam/time/layer
controls move into an on-map disclosure on phones and remain in the desktop
sidebar. Dam attributes and source notes are in a disclosure below the map;
selecting a dam no longer expands a large metadata block ahead of its map.
Dams also shares the broader catchment context, while retaining its own selected
area, named-stream and gauge controls.

## Wider-scale catchments and colours

- **Zoom 5–8:** broad catchment/plan outlines and coloured overview areas.
- **Zoom 9 onward:** detailed catchment/plan geometry.
- **Zoom 11 onward:** supplied subcatchment dividers and their shading, together
  with streams. Stream names appear from zoom 13.
- Subcatchments and streams temporarily hide when at least half the saved gauge
  locations of another group are visible; broad catchment context stays visible.

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

Mouse-wheel/trackpad map zoom is available after selecting Move map. Maps
start locked to protect comparisons across Rainfall, Water levels and Point IFD.
Gauge plots open in a non-modal panel rather than requiring a page scroll.
Phone page scrolling remains available; Move map unlocks pinch zoom as well as
panning. Phone users find the ranked gauge list and search below the map.

Catchment fills, boundary lines and their tiles are passive visual context. They
have no click selection, mouse highlight or polygon tooltip; their SVG panes let
pointer events pass through. Gauges, dam markers, map controls and background
selection remain interactive. Geographic colours and layer toggles are retained.

## Gauge-group navigation and detail scrolling

Rainfall, Point Rainfall IFD and Water levels keep the group selector available
while a group is selected. Choosing another group fits its gauges; changing the
within-group filter also refits the displayed gauges.

Before a group is selected, group names appear only while hovering over a group
footprint. Clicking the area selects it; overlapping footprints offer a chooser.
On touchscreens, tap an area or use the group selector.
Selecting a group hides overview hover labels at close views. Once at least 50%
of another group’s saved gauge locations are visible, background selection and
small hover names return for that group. This is a gauge-location proportion,
not an area measurement or a hydrological relationship. Selecting it recentres
the map and replaces the displayed gauges. The group selector and active page
tab also remain available. Only the selected group’s gauge dataset is displayed. Selecting a group fits its gauges. A background click inside one saved
group footprint selects it; overlapping footprints offer a chooser. Gauge clicks,
map controls and passive catchment polygons retain their existing behaviour and
shading.

`public/gauge-group-overview.json` is generated with
`python3 tools/build_gauge_group_overview.py` from the rainfall and water group
catalogues. Locations determine overview visibility; convex hulls support background
navigation only. These hulls are not catchment boundaries or authoritative coverage
areas. Regenerate the file when the source catalogues change. If it is unavailable,
the normal group selector continues to work.

Selecting a gauge opens its totals and plots in a side panel / phone bottom
sheet, closing an expanded map when necessary. It does not scroll or pan the map.
Time updates remain in that panel. Choosing a group returns to the map;
explicit gauge selections on the Dams page also reveal the associated plot.

Gauge hover labels use 10 px text and contain only the name, measurement and
associated duration. Point IFD hover also identifies the estimated AEP; source,
coverage and detailed time context remain in the selected-gauge detail panel.

Switching among Rainfall, Point Rainfall IFD and Water levels via the page tabs
carries the selected group and the saved geographic viewport. A one-time
`view=keep` navigation flag avoids refitting on arrival; an explicit group change
or Fit gauges action still refits normally. Gauge IDs are not copied between
different observation types. The active page tab still returns to its overview.

Map-page navigation links also encode `mapLat`, `mapLng` and `mapZoom` and update
when the map moves, or before a link is opened/copied. Valid explicit coordinates
take precedence over tab-local storage, allowing right-click Open in new tab to
retain the group and viewport even when the new tab has no copied session store.
Invalid coordinates fall back to the normal saved/default view.

On the Rainfall page, the IFD comparison defaults to the wettest complete window
for each duration in the 24 hours preceding the selected ending time. The Ending
at selected time mode remains available. The map and hyetograph still reflect the
selected rainfall duration; it does not restrict that preceding-day IFD search.

See `COMPARISON_WORKFLOW.md` for the current panel, fixed legend rail, gesture
lock, gauge-deep-link priority and measured caching improvements.
