"""Build the local map snapshot from OSM API XML extracts and Mapzen Terrarium tiles.
Usage: python3 web/scripts/prepare-township.py /path/to/downloads (requires Pillow).
See web/public/township/SOURCES.md for the exact download URLs and attribution.
"""
import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path
from PIL import Image

source = Path(sys.argv[1])
root = Path(__file__).resolve().parents[1]
bounds = [101.555, 2.980, 101.588, 3.031]  # west, south, east, north; includes the complete mapped township boundary
nodes, ways, relations = {}, {}, {}
for file in sorted(source.glob('putra-osm-*.xml')):
    for element in ET.parse(file).getroot():
        if element.tag == 'node': nodes[int(element.get('id'))] = [float(element.get('lon')), float(element.get('lat'))]
        elif element.tag == 'way': ways[int(element.get('id'))] = element
        elif element.tag == 'relation': relations[int(element.get('id'))] = element
assert len(nodes) > 1000, 'OSM extracts are missing or incomplete'

def tags(element): return {tag.get('k'): tag.get('v') for tag in element.findall('tag')}
def references(way): return [int(node.get('ref')) for node in way.findall('nd')]
def geometry(way): return [nodes[ref] for ref in references(way) if ref in nodes]
def center(points): return [sum(p[i] for p in points) / len(points) for i in [0, 1]]
def inside(p): return bounds[0] <= p[0] <= bounds[2] and bounds[1] <= p[1] <= bounds[3]
def area(points):
    return abs(sum(p[0]*q[1]-q[0]*p[1] for p,q in zip(points, points[1:]+points[:1]))) / 2 * 111320**2 * math.cos(math.radians(3))
def numeric(value, fallback):
    match = re.fullmatch(r'(\d+(?:\.\d+)?)\s*(?:m)?', value or '')
    return float(match[1]) if match else fallback

# Retain closed boundary geometry rather than closing incomplete OSM relation fragments.
chains = [references(ways[int(m.get('ref'))]) for m in relations[11911049].findall('member') if m.get('role') == 'outer']
boundary = chains.pop(0)
while chains:
    for i, chain in enumerate(chains):
        if chain[0] == boundary[-1] or chain[-1] == boundary[-1]:
            if chain[-1] == boundary[-1]: chain.reverse()
            boundary += chain[1:]
            chains.pop(i)
            break
    else: raise ValueError('Township boundary is incomplete')
assert boundary[0] == boundary[-1]
boundary = [nodes[ref] for ref in boundary]
assert all(inside(p) for p in boundary)

buildings, lines, areas = [], [], []
for id, way in ways.items():
    t, points = tags(way), geometry(way)
    if len(points) < 2: continue
    if max(p[0] for p in points) < bounds[0] or min(p[0] for p in points) > bounds[2] or max(p[1] for p in points) < bounds[1] or min(p[1] for p in points) > bounds[3]: continue
    closed = points[0] == points[-1] and len(points) >= 4
    if t.get('building') not in [None, 'no'] and closed and all(inside(p) for p in points) and area(points) > 8:
        kind = t['building']
        levels = numeric(t.get('building:levels'), 12 if kind == 'apartments' else 1 if kind in ['industrial', 'warehouse', 'roof', 'hut'] else 2)
        height = numeric(t.get('height'), levels * 3.1)
        buildings.append({'id': id, 'kind': kind, 'height': round(max(2, min(height, 200)), 1), 'estimated': not ('height' in t or 'building:levels' in t), 'points': points[:-1]})
    if t.get('highway') or t.get('railway') in ['light_rail', 'rail', 'subway'] or t.get('waterway') in ['river', 'stream', 'canal', 'drain']:
        kind = 'rail' if t.get('railway') in ['light_rail', 'rail', 'subway'] else t.get('waterway') or t.get('highway')
        widths = {'motorway': 11, 'motorway_link': 7, 'trunk': 10, 'primary': 9, 'secondary': 8, 'tertiary': 7, 'residential': 6, 'service': 4, 'living_street': 5, 'unclassified': 6, 'rail': 3, 'river': 55, 'stream': 5, 'canal': 8, 'drain': 2, 'footway': 1.5, 'path': 1.5, 'cycleway': 2}
        if kind not in widths: continue
        # Keep adjacent off-screen vertices so canvas clipping preserves crossing lines.
        runs, run = [], []
        for a, b in zip(points, points[1:]):
            if any(inside(p) for p in [a, b, [(a[0]+b[0])/2, (a[1]+b[1])/2]]):
                if not run: run.append(a)
                run.append(b)
            elif run: runs.append(run); run = []
        if run: runs.append(run)
        width = numeric(t.get('width'), widths[kind])
        # Klang's whole-river 1000 m tag describes downstream reaches; use an estimated local channel width.
        if id == 163932064: width = 55
        for run in runs:
            lines.append({'id': id, 'kind': kind, 'width': width, 'bridge': t.get('bridge') == 'yes', 'points': run})
    if closed and (t.get('landuse') or t.get('natural') in ['water', 'wood', 'scrub', 'grassland', 'heath'] or t.get('leisure') in ['park', 'pitch', 'playground', 'garden', 'swimming_pool']):
        areas.append({'id': id, 'kind': t.get('natural') or t.get('leisure') or t.get('landuse'), 'points': points[:-1]})

# Preserve the original 24 household assignments before extending demo coverage.
clusters = [('The Glades', [101.5750,3.0108]), ('Putra Murni', [101.5757,3.0170]), ('Putra Bahagia', [101.5693,2.9990]), ('Putra Mahkota', [101.5699,2.9925]), ('Putra Indah', [101.5654,2.9900]), ('Putra Harmoni', [101.5820,3.0070])]
plots = []
def distance(a,b): return math.hypot((a[0]-b[0])*111167, (a[1]-b[1])*111320)
candidates = [b for b in buildings if b['kind'] in ['house','detached','semidetached_house','bungalow'] and 35 < area(b['points']) < 500]
for zone, target in clusters:
    count = 0
    for b in sorted(candidates, key=lambda b: distance(center(b['points']),target)):
        point = center(b['points'])
        if any(distance(point,p['point']) < 65 for p in plots): continue
        plots.append({'id': f'SG-{len(plots)+1:03}', 'zone': zone, 'point': point, 'buildingId': b['id']})
        count += 1
        if count == 4: break
assert len(plots) == 24 and len({p['buildingId'] for p in plots}) == 24

def in_polygon(point, polygon):
    x, y = point
    result = False
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        if (a[1] > y) != (b[1] > y) and x < a[0] + (y-a[1]) * (b[0]-a[0]) / (b[1]-a[1]):
            result = not result
    return result

# Spread additional roof anchors through each neighbourhood, rather than stacking adjacent dots.
roofs = [(b, center(b['points'])) for b in candidates if b['height'] < 15]
roofs = [(b, point) for b, point in roofs if in_polygon(point, b['points']) and in_polygon(point, boundary)]
for zone, target in clusters:
    nearby = [(b, point) for b, point in roofs if distance(point, target) < 650
              and min(clusters, key=lambda cluster: distance(point, cluster[1]))[0] == zone]
    for _ in range(16):
        used = {p['buildingId'] for p in plots}
        available = [(b, point) for b, point in nearby if b['id'] not in used]
        assert available, f'Not enough mapped residential roofs in {zone}'
        b, point = max(available, key=lambda item: (min(distance(item[1], p['point']) for p in plots), -item[0]['id']))
        assert min(distance(point, p['point']) for p in plots) > 30
        plots.append({'id': f'SG-{len(plots)+1:03}', 'zone': zone, 'point': point, 'buildingId': b['id']})
assert len(plots) == 120 and len({p['buildingId'] for p in plots}) == 120
assert all(in_polygon(p['point'], next(b['points'] for b in buildings if b['id'] == p['buildingId'])) for p in plots)

landmark_sources = [('The Glades',1254607330),('The Glades Plaza',1254607329),('Subang Alam LRT',424882052),('Alam Megah LRT',407156831),('Serasi Residences',1511293419),('Kingsley International School',824734088),('Masjid Putra Heights',900231661),('Putra Heights LRT',401169425),('Community Park',874595014),('Damayan Residences',1508423536)]
landmarks = [{'name': name,'point': center(geometry(ways[id])),'sourceId': id} for name,id in landmark_sources]
landmarks.append({'name':'Kingsley Hill', 'point': nodes[8353801611], 'sourceId':8353801611})

# Terrarium encodes metres as R*256 + G + B/256 - 32768; sample the native grid, north to south.
tiles = {row: Image.open(source / f'putra-terrain-{row}.png').convert('RGB') for row in [2013,2014]}
size, heights = 129, []
for y in range(size):
    lat = bounds[3] - y/(size-1)*(bounds[3]-bounds[1])
    py = (1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*4096
    for x in range(size):
        lon = bounds[0]+x/(size-1)*(bounds[2]-bounds[0])
        px = (lon+180)/360*4096
        r,g,b = tiles[int(py)].getpixel((min(255,int((px-int(px))*256)), min(255,int((py-int(py))*256))))
        heights.append(round(r*256+g+b/256-32768,1))
assert len(heights) == size*size and all(-100 < h < 400 for h in heights)
assert len(buildings) > 5000 and len(lines) > 500
result = {'bounds':bounds, 'fetchedAt':str(date.today()), 'source':'OpenStreetMap contributors / ODbL 1.0', 'terrainSource':'Mapzen Terrain Tiles / SRTM', 'boundary':boundary, 'buildings':buildings, 'lines':lines, 'areas':areas, 'terrain':{'size':size,'heights':heights}}
(root/'public/township/putra-geography.json').write_text(json.dumps(result,separators=(',',':')))
metadata = '// Generated by scripts/prepare-township.py from the attributed map snapshot.\nimport type { DemoPlot, Landmark } from "./townshipLayout";\n'
metadata += 'export const demoPlots: DemoPlot[] = '+json.dumps(plots,indent=2)+';\n'
metadata += 'export const landmarks: Landmark[] = '+json.dumps(landmarks,indent=2)+';\n'
metadata += f'export const mappedBuildingCount = {len(buildings)};\n'
(root/'src/townshipSites.ts').write_text(metadata)
print(f'{len(buildings)} buildings, {len(lines)} road/rail/water segments, {len(areas)} land areas; elevations {min(heights)}–{max(heights)} m')
print(f'Height metadata on {sum(not b["estimated"] for b in buildings)} buildings; {len(plots)} synthetic overlays placed on distinct mapped footprints.')
