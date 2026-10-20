# Putra Heights visual references

Downloaded 20 October 2026. Images belong to their respective rights holders, including Sime Darby Property. Retained as attributed demo references, not original SimeGuardian artwork. No broader reuse licence is asserted.

| Local file | Original asset | Source page |
| --- | --- | --- |
| `putra-heights-map.png` | https://www.simedarbyproperty.com/putra-heights/images/ph-art-map.png | https://www.simedarbyproperty.com/putra-heights/ |
| `putra-heights-aerial.png` | https://imagedelivery.net/TdjZsXzzZt_je48pBzV3SA/d6bcd34e-36b0-4c57-046e-64a7f9b59400/public | https://www.simedarbyproperty.com/putra-heights/ |
| `glades-masterplan.png` | https://imagedelivery.net/TdjZsXzzZt_je48pBzV3SA/b56e6e86-6339-42a9-8b49-a7483dc28d00/1920 | https://www.simedarbyproperty.com/putra-heights/the-residences/ |
| `serasi-type-a.png` | https://www.simedarbyproperty.com/putra-heights/serasi-residences/images/type-a-new.png?v3= | https://www.simedarbyproperty.com/putra-heights/serasi-residences/ |

## Geographic reconstruction

The current model uses actual OpenStreetMap footprints, street alignments, rail routes, water features and land-use polygons, with Mapzen elevation tiles. Google Maps satellite view at [Putra Heights](https://www.google.com/maps/@3.004,101.574,15z/data=!3m1!1e3) was inspected as a visual reference for terrace density, roofs, road corridors and the hill. No Google imagery or tiles are bundled or used as model textures.

The [downloadable geography snapshot](putra-geography.json) contains 15,857 building footprints, 3,667 road/rail/water segments, 408 land-use polygons, the closed Putra Heights township boundary (OSM relation 11911049), and a 129 × 129 elevation grid. Bounds: west 101.555°, south 2.980°, east 101.588°, north 3.031°. The rectangle includes surrounding neighbourhoods; the dashed line marks the mapped township boundary. Counts describe mapped features, not a complete property inventory. Source map data may contain omissions, errors and outdated developments.

### OpenStreetMap attribution and licence

© OpenStreetMap contributors. The OSM-derived database in `putra-geography.json` and the locations in `web/src/townshipSites.ts` are made available under the [Open Database Licence 1.0](https://opendatacommons.org/licenses/odbl/1-0/). See [OpenStreetMap copyright](https://www.openstreetmap.org/copyright). Preserve this attribution and the applicable share-alike terms when redistributing the derived database.

Five official OSM API extracts were retrieved on 20 October 2026 (longitude, latitude bounding boxes). To reproduce, save these as `putra-osm-0.xml` through `putra-osm-4.xml` in one directory:

1. https://api.openstreetmap.org/api/0.6/map?bbox=101.55,2.98,101.5725,3.004
2. https://api.openstreetmap.org/api/0.6/map?bbox=101.5725,2.98,101.595,3.004
3. https://api.openstreetmap.org/api/0.6/map?bbox=101.55,3.004,101.5725,3.028
4. https://api.openstreetmap.org/api/0.6/map?bbox=101.5725,3.004,101.595,3.028
5. https://api.openstreetmap.org/api/0.6/map?bbox=101.55,3.028,101.595,3.031

### Elevation

Terrain: Mapzen Terrain Tiles. SRTM data courtesy of the U.S. Geological Survey. [Dataset](https://registry.opendata.aws/terrain-tiles/) · [Source attribution and terms](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).

Save these Terrarium tiles as `putra-terrain-2013.png` and `putra-terrain-2014.png`:

- https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/3203/2013.png
- https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/3203/2014.png

`python3 web/scripts/prepare-township.py /path/to/downloads` regenerates the JSON and TypeScript locations (requires Pillow). Terrain is decoded using `R × 256 + G + B / 256 − 32768`, sampled to the geographic grid and interpolated by the renderer. One scene unit represents 10 metres; north is negative Z. Elevation is coarse terrain context, not a site survey. Neither the source data nor these modifications imply endorsement by USGS or OSM.

### What is estimated

313 mapped buildings have height or floor-count metadata; other heights are type-based estimates (usually two storeys for houses and twelve for apartment blocks). Floor counts are converted using 3.1 metres per storey. Pitched roofs, façade windows, roof colours and individual trees are procedural approximations informed by the aerial references. Road and waterway widths use source tags when usable, otherwise class-based estimates. Klang River way 163932064 has a 1,000 m whole-river width tag that is unsuitable here; the local channel is drawn at an estimated 55 m. Roads and rail are drawn on the terrain surface; bridge elevations, individual trees, property boundaries, building interiors and current construction progress are not surveyed. Standalone polygon footprints are used; complex multipolygon building parts and holes are not reconstructed.

The 24 `SG-*` meter overlays are placed on distinct mapped house footprints for demonstration. Their IDs, neighbourhood grouping and simulated usage have no association with the properties' actual residents, addresses or meters. All other buildings have no utility data. The Serasi apartment plan remains a separate reference, not the plan of any demo landed house. This is a geographic visualization with estimated architecture, not photogrammetry or a surveyed digital twin.
