import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { demoPlots, landmarks, mapPosition, mapBounds, elevationAt, validateGeography, mappedBuildingCount, type Geography } from "../src/townshipLayout";
import { formatSignal, townshipWindow, usagePattern, usageBand } from "../src/signalSimulation";

test("township plot IDs are unique, bounded and cover the demo fixture", () => {
  expect(demoPlots.map((plot) => plot.id)).toEqual(Array.from({ length: 24 }, (_, i) => `SG-${String(i + 1).padStart(3, "0")}`));
  for (const item of [...demoPlots, ...landmarks]) {
    const [x, z] = mapPosition(item.point);
    expect(Math.abs(x)).toBeLessThan(184);
    expect(Math.abs(z)).toBeLessThan(284);
  }
  expect(usageBand(0, 0)).toBe(0);
  expect(usageBand(10, 10)).toBe(2);
  expect(usageBand(5, 10)).toBe(1);
  expect(usageBand(20, 10)).toBe(4);
});

test("map snapshot retains geographic footprints, scale, terrain and a complete township boundary", () => {
  const data: Geography = JSON.parse(readFileSync(new URL("../public/township/putra-geography.json", import.meta.url), "utf8"));
  expect(validateGeography(data)).toBe(data);
  expect(data.buildings.length).toBe(mappedBuildingCount);
  expect(data.buildings.length).toBeGreaterThan(15000);
  expect(data.boundary[0]).toEqual(data.boundary.at(-1));
  expect(data.lines.filter((line) => line.id === 163932064).every((line) => line.width === 55)).toBeTruthy();
  expect(new Set(data.buildings.map((b) => b.id)).size).toBe(data.buildings.length);
  expect(new Set(demoPlots.map((p) => p.buildingId)).size).toBe(24);
  for (const plot of demoPlots) {
    const building = data.buildings.find((b) => b.id === plot.buildingId)!;
    expect(building).toBeDefined();
    expect(building.height).toBeLessThan(15);
    expect(plot.point[0]).toBeCloseTo(building.points.reduce((sum, p) => sum + p[0], 0) / building.points.length, 8);
  }
  const station = landmarks.find((landmark) => landmark.name === "Putra Heights LRT")!;
  expect(station.point[0]).toBeCloseTo(101.57547, 4);
  expect(station.point[1]).toBeCloseTo(2.99609, 4);
  expect(mapPosition([101.57, 3.01])[1]).toBeLessThan(mapPosition([101.57, 3.00])[1]);
  expect(mapPosition([101.57 + 10 / 111167, 3])[0] - mapPosition([101.57, 3])[0]).toBeCloseTo(1, 6);
  expect(elevationAt(data, landmarks.find((landmark) => landmark.name === "Kingsley Hill")!.point)).toBeGreaterThan(elevationAt(data, station.point));
  const slope = { ...data, terrain: { size: 2, heights: [0, 10, 20, 30] } };
  const center = [(mapBounds[0] + mapBounds[2]) / 2, (mapBounds[1] + mapBounds[3]) / 2] as const;
  expect(elevationAt(slope, center)).toBeCloseTo(1.5);
  expect(elevationAt({ ...slope, terrain: { size: 2, heights: [0, 10, 20, 90] } }, center)).toBeCloseTo(1.5);
  expect(elevationAt(slope, [mapBounds[0] - 1, mapBounds[3] + 1])).toBe(0);
  expect(() => validateGeography({ ...data, terrain: { size: 129, heights: [] } })).toThrow();
});

test("fullscreen top view overlays household patterns and shares pipeline selection", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto("/pipeline");
  const explorer = page.locator(".township-explorer");
  await expect(explorer.locator(".explorer-canvas")).toHaveAttribute("data-ready", "true", { timeout: 15000 });
  await expect(explorer.locator(".explorer-canvas")).toHaveAttribute("data-view", "top");
  await expect(explorer.getByRole("button", { name: "Top view", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await explorer.evaluate((el) => el.matches(":modal"))).toBeTruthy();
  expect(await explorer.boundingBox()).toEqual({ x: 0, y: 0, width: 1512, height: 982 });
  await expect(explorer.getByRole("button", { name: "Aerial photo" })).toHaveCount(0);
  await expect(explorer.locator(".map-home-label .map-pattern")).toHaveCount(24);
  await expect(explorer.locator(".map-home-label .map-pattern rect")).toHaveCount(24 * 28);
  await expect(explorer.locator(".map-home-label:not(.map-label-collapsed)")).toHaveCount(24);
  await explorer.getByLabel("3D household").selectOption("SG-012");
  const at = Date.parse(await explorer.getByLabel("Map simulation time").getAttribute("datetime") ?? "");
  const expected = townshipWindow(at, "week", ["SG-012"]).homes[0];
  for (const utility of ["water", "electricity"] as const) {
    await expect(explorer.getByTestId(`home-${utility}`)).toContainText(formatSignal(utility, usagePattern(expected.points, utility).total));
  }
  await explorer.getByRole("group", { name: "3D utility layer" }).getByRole("button", { name: "Water", exact: true }).click();
  const marker = explorer.locator('[data-anchor="SG-012"]');
  await expect(marker.getByRole("img")).toHaveAttribute("aria-label", "SG-012 water usage pattern, oldest to newest");
  await explorer.getByLabel("3D usage period").selectOption("day");
  await expect(marker.locator("rect")).toHaveCount(24);
  const day = townshipWindow(at, "day", ["SG-012"]).homes[0];
  await expect(explorer.getByTestId("home-water")).toContainText(formatSignal("water", usagePattern(day.points, "water").total));
  await explorer.screenshot({ path: "test-results/putra-fullscreen-top.png" });
  await explorer.getByLabel("Household patterns").uncheck();
  await expect(marker).not.toHaveClass(/map-label-collapsed/);
  await explorer.getByLabel("Household patterns").check();
  await explorer.getByRole("button", { name: "Locate this home" }).click();
  await expect(explorer.locator(".explorer-canvas")).toHaveAttribute("data-view", "top");
  await explorer.screenshot({ path: "test-results/putra-top-home.png" });
  await explorer.getByRole("button", { name: "3D model", exact: true }).click();
  await explorer.getByRole("button", { name: "Locate this home" }).click();
  await explorer.screenshot({ path: "test-results/putra-floating-3d.png" });
  await explorer.getByRole("button", { name: "Top view", exact: true }).click();
  await explorer.getByRole("button", { name: "2D map", exact: true }).click();
  await expect(explorer.getByAltText("Township map", { exact: true })).toBeVisible();
  await explorer.getByRole("button", { name: "Locate this home" }).click();
  await expect(explorer.getByRole("button", { name: "Top view", exact: true })).toHaveAttribute("aria-pressed", "true");
  await explorer.getByRole("button", { name: "Reset township camera" }).click();
  await explorer.getByRole("button", { name: "Zoom in", exact: true }).click();
  await explorer.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(explorer).not.toHaveClass(/explorer-fullscreen/);
  expect(await explorer.evaluate((el) => el.matches(":modal"))).toBeFalsy();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  await expect(page.getByLabel("Household", { exact: true })).toHaveValue("SG-012");
  await expect(page.getByLabel("Usage signal", { exact: true })).toHaveValue("water");
  await expect(page.getByRole("button", { name: "24 hours", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Household", { exact: true }).selectOption("SG-024");
  await expect(explorer.getByLabel("3D household")).toHaveValue("SG-024");
  await explorer.getByRole("button", { name: "Expand map fullscreen" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(explorer.getByRole("button", { name: "Map layers" })).toHaveAttribute("aria-expanded", "false");
  await expect(explorer.getByRole("button", { name: "Household inspector", exact: true })).toHaveAttribute("aria-expanded", "false");
  await explorer.screenshot({ path: "test-results/putra-fullscreen-mobile.png" });
  await explorer.getByRole("button", { name: "Household inspector", exact: true }).click();
  await expect(explorer.getByLabel("3D household")).toBeVisible();
  await explorer.screenshot({ path: "test-results/putra-mobile-inspector.png" });
  await explorer.getByRole("button", { name: "Map layers" }).click();
  await expect(explorer.getByLabel("3D usage period")).toBeVisible();
  await expect(explorer.getByLabel("3D household")).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await explorer.getByRole("button", { name: "Exit fullscreen map" }).click();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await page.getByRole("link", { name: "Pipeline", exact: true }).click();
  await expect(explorer.locator(".explorer-canvas")).toHaveAttribute("data-ready", "true");
  await expect(explorer.locator(".explorer-canvas")).toHaveAttribute("data-view", "top");
  expect(errors).toEqual([]);
});

test("usage pattern bands use each home's own average, preserve zero and handle missing readings", () => {
  const points = [0, 2, 4, 10].map((value, i) => ({ at: i, electricity: value, water: value * 100 }));
  expect(usagePattern(points, "electricity")).toEqual({ total: 16, average: 4, latest: 10, band: 4, bands: [0, 1, 2, 4] });
  expect(usagePattern(points, "water").bands).toEqual([0, 1, 2, 4]);
  expect(usagePattern([{ at: 0, electricity: 0 }], "electricity").latest).toBe(0);
  expect(usagePattern([], "electricity").latest).toBeNull();
});

test("confirmed anomalies remain visible on the top-view footprint with patterns hidden", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto("/pipeline");
  const explorer = page.locator(".township-explorer");
  await expect(explorer.locator(".explorer-canvas")).toHaveAttribute("data-ready", "true", { timeout: 15000 });
  await explorer.getByLabel("3D household").selectOption("SG-012");
  await explorer.getByRole("button", { name: "Run map anomaly demo" }).click();
  await expect(explorer.locator(".map-home-concern")).toHaveCount(0);
  await expect(explorer.getByText("1 demo anomaly located", { exact: true })).toBeVisible({ timeout: 15000 });
  await explorer.getByRole("button", { name: "Pause map simulation" }).click();
  await expect(explorer.locator(".map-home-concern")).toHaveCount(1);
  await expect(explorer.locator(".map-home-concern")).toHaveAttribute("data-anchor", "SG-012");
  await expect(explorer.locator(".map-home-concern")).toHaveAccessibleName(/demo anomaly detected/);
  await explorer.getByLabel("Household patterns").uncheck();
  await expect(explorer.locator(".map-home-concern")).not.toHaveClass(/map-label-collapsed/);
  await explorer.screenshot({ path: "test-results/putra-top-anomaly.png" });
  await explorer.getByRole("button", { name: "Locate anomaly", exact: true }).click();
  await expect(explorer.locator(".explorer-canvas")).toHaveAttribute("data-view", "top");
  await explorer.screenshot({ path: "test-results/putra-anomaly-footprint.png" });
  await explorer.getByRole("button", { name: "Clear map demo" }).click();
  await expect(explorer.locator(".map-home-concern")).toHaveCount(0);
  await expect(explorer.getByRole("button", { name: "Locate anomaly", exact: true })).toHaveCount(0);
});

test("WebGL failure preserves accessible household values and image references", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === "webgl2" || type === "webgl") return null;
      return getContext.apply(this, [type, ...args] as Parameters<typeof getContext>);
    } as typeof getContext;
  });
  await page.goto("/pipeline");
  const explorer = page.locator(".township-explorer");
  await expect(explorer.getByText("The 3D view could not be loaded.")).toBeVisible();
  await explorer.getByLabel("3D household").selectOption("SG-020");
  await expect(explorer.getByTestId("home-electricity")).not.toContainText("—");
  await expect(explorer.getByRole("button", { name: "Locate this home" })).toBeDisabled();
  await explorer.getByRole("button", { name: "2D map", exact: true }).click();
  await expect(explorer.getByAltText("Township map", { exact: true })).toBeVisible();
});

test("failed geography download preserves readings and can be retried", async ({ page }) => {
  await page.route("**/township/putra-geography.json", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/pipeline");
  const explorer = page.locator(".township-explorer");
  await expect(explorer.getByText("The 3D view could not be loaded.")).toBeVisible();
  await expect(explorer.getByTestId("home-water")).not.toContainText("—");
  await page.unroute("**/township/putra-geography.json");
  await explorer.getByRole("button", { name: "Retry 3D view" }).click();
  await expect(explorer.locator(".explorer-canvas")).toHaveAttribute("data-ready", "true", { timeout: 15000 });
  await expect(explorer.locator("canvas")).toHaveCount(1);
});

test("missing household data is not replaced with invented meter readings", async ({ page }) => {
  await page.route("**/api/workspace", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.datasets.find((dataset: { id: string }) => dataset.id === "township-ui-v1").households = [];
    await route.fulfill({ response, json: data });
  });
  await page.goto("/pipeline");
  const explorer = page.locator(".township-explorer");
  await expect(explorer.getByLabel("3D household")).toBeDisabled();
  await expect(explorer.getByTestId("home-water")).toContainText("—");
  await expect(explorer.getByTestId("home-electricity")).toContainText("—");
  await expect(explorer.getByRole("button", { name: /^Select SG-/ })).toHaveCount(0);
});
