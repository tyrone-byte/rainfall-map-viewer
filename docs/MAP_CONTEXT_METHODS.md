# Catchment hierarchy and stream continuity

The Rainfall, Water levels and Point Rainfall IFD viewers use the same saved map
context. The Dams viewer's original source files are retained unchanged.

## What appears as you zoom

| Layer | Minimum zoom | Appearance |
| --- | ---: | --- |
| Catchment / water-plan overview areas | 9 | Solid muted green outline |
| Named rivers / larger creeks | 11 | Solid blue lines with rounded joins |
| Supplied subcatchment areas | 12 | Thinner dashed dividers |
| Stream names | 13 | Limited, deduplicated labels following the line |

The supplied Queensland water-plan source contains **41 Catchment Area** records
and **146 Subcatchment Area** records. These include creek areas such as Cabbage
Tree Creek, Lockyer Creek, Obi Obi Creek, Currumbin Creek and Tallebudgera Creek.
They are the source's named water-plan areas, not a complete creek-drainage
inventory and not verified upstream contributing areas for each gauge.

Some plans (including Moreton and Mary Basin) contain only subcatchment records.
To retain low-zoom context, **19 derived water-plan overviews** combine the
supplied areas by their source waterplan name. These overviews are exact unions
of the supplied geographic areas, explicitly labelled as derived plan overviews,
not newly delineated drainage catchments. Native catchment records remain
distinguishable in hover information. The broader overview hover areas sit below
all native areas, so they cannot cover a smaller area's name.

The Layers panel distinguishes both boundary styles and provides a subcatchment
toggle. Subcatchments include their solid enclosing catchment outlines: enabling
subcatchments enables catchments; disabling catchments also hides subcatchments.
At lower zoom, the panel prompts users to zoom closer. Names and a subtle area
highlight are available by hovering/tapping the source polygon. Context remains
below gauge symbols and does not affect observation colours or IFD assignments.

## Why overlapping dashes no longer become solid

Original, unsimplified boundaries are transformed to Australian Albers metres
and placed on a 1 m display-precision grid. Shared edges within each hierarchy
are noded and dissolved into one line network **before** the existing 40 m
cartographic simplification. Major edges take precedence over coincident minor
edges, including coincidences introduced by simplification/transformation.
Line networks are clipped into viewport-loadable tiles. Half-open ownership
keeps a stroke that lies on a tile edge in only one tile.

The source polygons remain separate hover areas, with **no stroke and no fill
unless hovered**. Their outlines are never drawn again. This separates feature
identity from cartography: neighbouring polygons can both be identified without
painting their common edge twice. Small display precision/simplification changes
are not a change to the source's geographic membership or drainage definition.

## What improves stream continuity

The builder reuses the saved Dams river/larger-creek extracts. For each exact
source name it dissolves duplicated segments, nodes intersections and line-merges
segments that actually touch. It retains line components from mixed geometry
intersections instead of dropping an entire result when a point-only contact
is also present. Connected linework is merged again after clipping to tiles.
The viewer disables additional browser line simplification and uses rounded
joins/caps so genuine connections remain clean at tile and segment boundaries.

Across the supplied extracts, **9,802 input line parts**, including duplicates,
become **3,431 merged parts** under **343 distinct source names**. This does not
mean there are only 343 hydrologically distinct streams: names are not unique
identifiers, and disconnected segments with the same name remain disconnected.

There is **no endpoint snapping, buffering, interpolation, inferred connection or
bridging of gaps** in stream processing. These are partial extracts around the
Dams source areas, with unnamed tributaries and gullies omitted. Remaining real
coverage gaps require the original complete watercourse source or another
suitable licensed network. A complete/finer creek-catchment dataset is likewise
needed for creek areas not present among the 146 supplied subcatchments.

## Rebuild and validation

Run `tools/build_map_context.py` offline with pyogrio, pyproj and shapely. The
running app needs no extra dependencies and makes no new remote GIS requests.
`public/map-context/index.json` version 2 records source checksums, hierarchy
counts, methods, attribution and per-file viewport bounds.

Geometry regression checks verify shared edges are single strokes, major/minor
networks have no overlapping line length beyond numerical tile-intersection roundoff, tile seams have single ownership,
mixed intersections retain linework, and real stream gaps remain unbridged.
The generated statewide outline files are also checked for duplicate linework.
Browser checks verify zoom thresholds, independent stream control, subcatchment
styles, unstroked hover polygons, geographic labels, context failure handling and
mobile interaction. The normal application suites cover existing map/chart use.
