export type Utility = "electricity" | "water";
export type MapPoint = readonly [number, number]; // longitude, latitude
export type DemoPlot = { id: string; zone: string; point: MapPoint; buildingId: number };
export type Landmark = { name: string; point: MapPoint; sourceId: number };
export type Geography = {
  bounds: number[]; fetchedAt: string; source: string; terrainSource: string;
  boundary: MapPoint[];
  buildings: { id: number; kind: string; height: number; estimated: boolean; points: MapPoint[] }[];
  lines: { id: number; kind: string; width: number; bridge: boolean; points: MapPoint[] }[];
  areas: { id: number; kind: string; points: MapPoint[] }[];
  terrain: { size: number; heights: number[] };
};
export { demoPlots, landmarks, mappedBuildingCount } from "./townshipSites";
export const mapBounds = [101.555, 2.980, 101.588, 3.031] as const;
export const googleSatelliteUrl = "https://www.google.com/maps/@3.004,101.574,15z/data=!3m1!1e3";
export const mapPosition = ([lon, lat]: MapPoint): [number, number] => [
  (lon - (mapBounds[0] + mapBounds[2]) / 2) * 11116.7,
  ((mapBounds[1] + mapBounds[3]) / 2 - lat) * 11132,
]; // One scene unit = 10 metres. North is negative Z.

export function elevationAt(data: Geography, [lon, lat]: MapPoint) {
  const { size, heights } = data.terrain;
  const x = Math.max(0, Math.min(size - 1, (lon - data.bounds[0]) / (data.bounds[2] - data.bounds[0]) * (size - 1)));
  const y = Math.max(0, Math.min(size - 1, (data.bounds[3] - lat) / (data.bounds[3] - data.bounds[1]) * (size - 1)));
  const ix = Math.min(size - 2, Math.floor(x)), iy = Math.min(size - 2, Math.floor(y));
  const tx = x - ix, ty = y - iy;
  const a = heights[iy * size + ix], b = heights[(iy + 1) * size + ix];
  const c = heights[(iy + 1) * size + ix + 1], d = heights[iy * size + ix + 1];
  // Match PlaneGeometry's diagonal so roads and building foundations stay on the terrain.
  return (tx + ty <= 1 ? a * (1 - tx - ty) + b * ty + d * tx : b * (1 - tx) + d * (1 - ty) + c * (tx + ty - 1)) / 10;
}

export function validateGeography(data: Geography) {
  const path = (points: MapPoint[], minimum: number) => Array.isArray(points) && points.length >= minimum &&
    points.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) &&
      point[0] >= 100 && point[0] <= 103 && point[1] >= 1 && point[1] <= 5);
  if (!data || !Array.isArray(data.bounds) || data.bounds.some((v, i) => v !== mapBounds[i]) || data.bounds.length !== 4 ||
      !Array.isArray(data.buildings) || !data.buildings.length || !Array.isArray(data.lines) || !Array.isArray(data.areas) ||
      !path(data.boundary, 4) ||
      !data.buildings.every((b) => b && Number.isFinite(b.id) && typeof b.kind === "string" && Number.isFinite(b.height) && b.height > 0 && b.height <= 200 && path(b.points, 3)) ||
      !data.lines.every((line) => line && typeof line.kind === "string" && Number.isFinite(line.width) && line.width > 0 && line.width <= 100 && path(line.points, 2)) ||
      !data.areas.every((area) => area && typeof area.kind === "string" && path(area.points, 3)) ||
      data.terrain?.size !== 129 || !Array.isArray(data.terrain.heights) || data.terrain.heights.length !== 129 * 129 ||
      !data.terrain.heights.every((height) => Number.isFinite(height) && height > -100 && height < 400)) {
    throw new Error("The township map snapshot is missing or invalid.");
  }
  return data;
}

export const townshipReferences = [
  { id: "plan", name: "Township map", image: "/township/putra-heights-map.png", url: "https://www.simedarbyproperty.com/putra-heights/#map", note: "Official illustrated map; not a survey or a cadastral plan." },
  { id: "glades", name: "The Glades masterplan", image: "/township/glades-masterplan.png", url: "https://www.simedarbyproperty.com/putra-heights/the-residences/", note: "Official neighbourhood masterplan. Building massing and waterways inform the model." },
  { id: "floor", name: "Serasi floor plan", image: "/township/serasi-type-a.png", url: "https://www.simedarbyproperty.com/putra-heights/serasi-residences/", note: "Serasi Type A apartment reference. This is not the floor plan of the simulated landed homes." },
] as const;

