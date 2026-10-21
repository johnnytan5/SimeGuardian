import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ShapeUtils, Triangle, Vector2, Vector3 } from "three";
import { demoPlots, landmarks, mapPosition, mapBounds, elevationAt, validateGeography, mappedBuildingCount, type Geography } from "../src/townshipLayout";
import { formatSignal, townshipWindow, usagePattern, usageBand } from "../src/signalSimulation";

test("township plot IDs are unique, bounded and cover the demo fixture", () => {
  expect(demoPlots.map((plot) => plot.id)).toEqual(Array.from({ length: 120 }, (_, i) => `SG-${String(i + 1).padStart(3, "0")}`));
  expect(new Set(demoPlots.map((plot) => plot.zone)).size).toBe(6);
  for (const zone of new Set(demoPlots.map((plot) => plot.zone))) {
    expect(demoPlots.filter((plot) => plot.zone === zone)).toHaveLength(20);
  }
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
  expect(new Set(demoPlots.map((p) => p.buildingId)).size).toBe(120);
  for (const plot of demoPlots) {
    const building = data.buildings.find((b) => b.id === plot.buildingId)!;
    expect(building).toBeDefined();
    expect(building.height).toBeLessThan(15);
    expect(plot.point[0]).toBeCloseTo(building.points.reduce((sum, p) => sum + p[0], 0) / building.points.length, 8);
    expect(ShapeUtils.triangulateShape(building.points.map(([x, y]) => new Vector2(x, y)), []).some((indices) => {
      const [a, b, c] = indices.map((i) => new Vector3(...building.points[i], 0));
      return new Triangle(a, b, c).containsPoint(new Vector3(...plot.point, 0));
    })).toBeTruthy();
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

test("fullscreen top view starts with compact markers and shares pipeline selection", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto("/overview");
  const explorer = page.locator(".township-explorer");
  await expect(explorer.locator(".explorer-canvas")).toHaveAttribute("data-ready", "true", { timeout: 15000 });
  await expect(explorer.locator(".explorer-canvas")).toHaveAttribute("data-view", "top");
  await expect(explorer.getByRole("button", { name: "Top view", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await explorer.evaluate((el) => el.matches(":modal"))).toBeTruthy();
  expect(await explorer.boundingBox()).toEqual({ x: 0, y: 0, width: 1512, height: 982 });
  await expect(explorer.getByRole("button", { name: "Aerial photo" })).toHaveCount(0);
  await expect(explorer.locator(".map-home-label .map-pattern")).toHaveCount(120);
  await expect(explorer.locator(".map-home-label .map-pattern rect")).toHaveCount(120 * 28);
  await expect(explorer.getByLabel("Show all patterns")).not.toBeChecked();
  await expect(explorer.locator(".map-home-label:not(.map-label-collapsed)")).toHaveCount(1);
  await explorer.screenshot({ path: "test-results/putra-operations-desktop.png" });
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
  await explorer.getByLabel("Show all patterns").check();
  await expect.poll(() => explorer.locator(".map-home-label:not(.map-label-collapsed)").count()).toBeGreaterThan(1);
  await explorer.getByLabel("Show all patterns").uncheck();
  await expect(marker).not.toHaveClass(/map-label-collapsed/);
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
  await explorer.getByRole("link", { name: "Inspect all six signals", exact: false }).click();
  await expect(page).toHaveURL(/\/pipeline#household-signals$/);
  await expect(explorer).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Daily signal flow" })).toBeInViewport();
  await expect(page.getByLabel("Household", { exact: true })).toHaveValue("SG-012");
  await expect(page.getByLabel("Usage signal", { exact: true })).toHaveValue("water");
  await expect(page.getByRole("button", { name: "24 hours", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Household", { exact: true }).selectOption("SG-024");
  await page.getByRole("link", { name: "Township overview", exact: true }).click();
  await expect(explorer.getByLabel("3D household")).toHaveValue("SG-024");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(explorer.getByRole("button", { name: "Household list", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(explorer.getByRole("button", { name: "Household inspector", exact: true })).toHaveAttribute("aria-expanded", "false");
  await explorer.screenshot({ path: "test-results/putra-fullscreen-mobile.png" });
  await explorer.getByRole("button", { name: "Household inspector", exact: true }).click();
  await expect(explorer.getByLabel("3D household")).toBeVisible();
  await explorer.screenshot({ path: "test-results/putra-mobile-inspector.png" });
  await explorer.getByRole("button", { name: "Household list", exact: true }).click();
  await expect(explorer.getByRole("searchbox", { name: "Search mapped households" })).toBeVisible();
  await expect(explorer.getByLabel("3D household")).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await explorer.getByRole("button", { name: "Exit fullscreen map" }).click();
  await page.getByRole("button", { name: "Show sidebar" }).click();
  await page.locator("#workspace-sidebar").getByRole("link", { name: "Model training", exact: true }).click();
  await page.locator("#workspace-sidebar").getByRole("link", { name: "Overview", exact: true }).click();
  await expect(explorer.locator(".explorer-canvas")).toHaveAttribute("data-ready", "true");
  await expect(explorer.locator(".explorer-canvas")).toHaveAttribute("data-view", "top");
  await expect.poll(() => explorer.locator(".map-home-dot").evaluateAll((dots) => {
    const top = document.querySelector(".explorer-map-options")!.getBoundingClientRect().bottom;
    const bottom = document.querySelector(".explorer-trends")!.getBoundingClientRect().top;
    return dots.every((dot) => {
      const r = dot.getBoundingClientRect();
      return r.width > 0 && r.left >= 0 && r.right <= window.innerWidth && r.top > top && r.bottom < bottom;
    });
  })).toBeTruthy();
  await explorer.screenshot({ path: "test-results/putra-operations-mobile-initial.png" });
  await page.setViewportSize({ width: 1280, height: 720 });
  await explorer.getByRole("button", { name: "Reset township camera" }).click();
  await explorer.screenshot({ path: "test-results/putra-operations-laptop.png" });
  expect(errors).toEqual([]);
});

test("household operations filter locally while both floating trends keep the township totals", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto("/overview");
  const explorer = page.locator(".township-explorer");
  await expect(explorer.locator(".explorer-canvas")).toHaveAttribute("data-ready", "true");
  const households = explorer.getByRole("group", { name: "Mapped household readings" });
  await expect(households.getByRole("button")).toHaveCount(120);
  const at = Date.parse(await explorer.getByLabel("Map simulation time").getAttribute("datetime") ?? "");
  const ids = demoPlots.map((plot) => plot.id);
  for (const range of ["day", "week", "month"] as const) {
    await explorer.getByLabel("3D usage period").selectOption(range);
    const data = townshipWindow(at, range, ids);
    for (const utility of ["electricity", "water"] as const) {
      const expected = formatSignal(utility, usagePattern(data.totals, utility).total);
      await expect(explorer.getByTestId(`map-total-${utility}`)).toContainText(expected);
      await expect(explorer.getByTestId(`chart-total-${utility}`)).toContainText(expected);
    }
  }
  const before = await explorer.getByTestId("chart-total-electricity").innerText();
  await explorer.getByRole("searchbox").fill(" SG-012 ");
  await expect(households.getByRole("button")).toHaveCount(1);
  await households.getByRole("button", { name: "Locate SG-012" }).click();
  await expect(explorer.getByLabel("3D household")).toHaveValue("SG-012");
  await expect(explorer.getByTestId("chart-total-electricity")).toHaveText(before);
  await explorer.getByRole("searchbox").fill("no such home");
  await expect(explorer.getByText("No households match your search.", { exact: true })).toBeVisible();
  await explorer.getByRole("searchbox").fill("");
  await explorer.getByRole("group", { name: "Filter mapped households" }).getByRole("button", { name: "Anomalies" }).click();
  await expect(households.getByRole("button")).toHaveCount(0);
  await expect(explorer.getByText("No detected anomalies match this search.")).toBeVisible();
  await explorer.getByRole("group", { name: "Filter mapped households" }).getByRole("button", { name: /^All / }).click();
  await expect(households.getByRole("button")).toHaveCount(120);
  for (const utility of ["electricity", "water"]) {
    await explorer.getByRole("button", { name: `Collapse ${utility} chart` }).click();
    await expect(explorer.locator(`#map-${utility}-chart`)).toBeHidden();
    await explorer.getByRole("button", { name: `Expand ${utility} chart` }).click();
    await expect(explorer.locator(`#map-${utility}-chart`)).toBeVisible();
  }
  await explorer.getByRole("button", { name: "Reset township camera" }).click();
  await expect.poll(() => explorer.locator('[data-anchor="SG-012"]').evaluate((marker) => {
    const card = marker.querySelector(".map-home-reading")!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>("[data-map-obstacle]")].filter((el) => el.checkVisibility()).every((el) => {
      const r = el.getBoundingClientRect();
      return card.right <= r.left || card.left >= r.right || card.bottom <= r.top || card.top >= r.bottom;
    });
  })).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(explorer.getByRole("img", { name: /^Township electricity trend/ })).toBeVisible();
  await expect(explorer.getByRole("img", { name: /^Township water trend/ })).toBeVisible();
  await explorer.getByRole("button", { name: "Household list", exact: true }).click();
  await expect(explorer.locator(".explorer-trends")).toBeHidden();
  await explorer.getByRole("searchbox").fill("SG-024");
  await households.getByRole("button", { name: "Locate SG-024" }).click();
  await expect(explorer.getByRole("button", { name: "Household list", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(explorer.locator(".explorer-trends")).toBeVisible();
});

test("expanded rooftop coverage exposes coordinates and pulses only when motion is enabled", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto("/overview");
  const explorer = page.locator(".township-explorer");
  await expect(explorer.locator(".explorer-canvas")).toHaveAttribute("data-ready", "true", { timeout: 15000 });
  await expect(explorer.locator(".map-home-dot")).toHaveCount(120);
  const marker = explorer.locator('[data-anchor="SG-120"]');
  const plot = demoPlots.find((p) => p.id === "SG-120")!;
  await expect(marker).toHaveAttribute("data-building-id", String(plot.buildingId));
  await expect(marker).toHaveAttribute("data-latitude", String(plot.point[1]));
  await expect(marker).toHaveAttribute("data-longitude", String(plot.point[0]));
  const animation = () => marker.locator(".map-home-dot").evaluate((dot) => getComputedStyle(dot, "::after").animationName);
  await expect.poll(animation).toBe("rooftop-pulse");
  await explorer.screenshot({ path: "test-results/putra-rooftop-coverage.png" });
  await explorer.getByRole("button", { name: "Pause map simulation" }).click();
  await expect.poll(animation).toBe("none");
  await explorer.getByLabel("3D household").selectOption("SG-120");
  await expect(explorer.getByTestId("roof-coordinate")).toHaveText(`${plot.point[1].toFixed(6)}° N · ${plot.point[0].toFixed(6)}° E`);
  await expect(marker.locator(".map-roof-coordinate")).toHaveText(`${plot.point[1].toFixed(6)}, ${plot.point[0].toFixed(6)}`);
  await expect(explorer.getByRole("link", { name: `#${plot.buildingId} ↗` })).toHaveAttribute("href", `https://www.openstreetmap.org/way/${plot.buildingId}`);
  await explorer.getByRole("button", { name: "Locate this home" }).click();
  await explorer.getByRole("button", { name: "3D model", exact: true }).click();
  await explorer.getByRole("button", { name: "Locate this home" }).click();
  await explorer.screenshot({ path: "test-results/putra-rooftop-coordinate.png" });
  await explorer.getByRole("button", { name: "Resume map simulation" }).click();
  await expect.poll(animation).toBe("rooftop-pulse");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(animation).toBe("none");
  await explorer.getByRole("button", { name: "Resume map simulation" }).click();
  await expect.poll(animation).toBe("none");
  await explorer.getByRole("link", { name: "Inspect all six signals", exact: false }).click();
  await expect(page.getByLabel("Household", { exact: true })).toHaveValue("SG-120");
  await expect(page.getByRole("button", { name: /^Inspect household SG-120,/ })).toHaveAttribute("aria-pressed", "true");
});

test("usage pattern bands use each home's own average, preserve zero and handle missing readings", () => {
  const points = [0, 2, 4, 10].map((value, i) => ({ at: i, electricity: value, water: value * 100 }));
  expect(usagePattern(points, "electricity")).toEqual({ total: 16, average: 4, latest: 10, band: 4, bands: [0, 1, 2, 4] });
  expect(usagePattern(points, "water").bands).toEqual([0, 1, 2, 4]);
  expect(usagePattern([{ at: 0, electricity: 0 }], "electricity").latest).toBe(0);
  expect(usagePattern([], "electricity").latest).toBeNull();
});

test("landscape top view keeps north to the right through locate and camera reset", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 2560, height: 1080 });
  await page.goto("/overview");
  const explorer = page.locator(".township-explorer");
  await expect(explorer.locator(".explorer-canvas")).toHaveAttribute("data-ready", "true", { timeout: 15000 });
  await expect(explorer.getByLabel("North points right", { exact: true })).toHaveText("N →");
  const northPointsRight = async () => {
    const south = await explorer.locator('[data-anchor="SG-013"] .map-home-dot').boundingBox();
    const north = await explorer.locator('[data-anchor="SG-014"] .map-home-dot').boundingBox();
    return !!south && !!north && north.x - south.x > Math.abs(north.y - south.y) * 3;
  };
  await expect.poll(northPointsRight).toBeTruthy();
  await expect.poll(() => explorer.locator(".map-home-dot").evaluateAll((dots) => {
    const rects = dots.map((dot) => dot.getBoundingClientRect()).filter((r) => r.width > 0);
    const width = Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left));
    const height = Math.max(...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top));
    return width / height;
  })).toBeGreaterThan(1.3);
  await explorer.screenshot({ path: "test-results/putra-landscape-wide.png" });
  await explorer.getByLabel("3D household").selectOption("SG-013");
  await explorer.getByRole("button", { name: "Locate this home" }).click();
  await expect.poll(northPointsRight).toBeTruthy();
  await explorer.getByRole("button", { name: "3D model", exact: true }).click();
  await explorer.getByRole("button", { name: "Top view", exact: true }).click();
  await explorer.getByRole("button", { name: "Reset township camera" }).click();
  await expect.poll(northPointsRight).toBeTruthy();
});

test("confirmed anomalies remain visible on the top-view footprint with patterns hidden", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto("/overview");
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
  await explorer.getByLabel("Show all patterns").uncheck();
  await expect(explorer.locator(".map-home-concern")).not.toHaveClass(/map-label-collapsed/);
  await explorer.screenshot({ path: "test-results/putra-top-anomaly.png" });
  await explorer.getByRole("group", { name: "Filter mapped households" }).getByRole("button", { name: "Anomalies" }).click();
  await expect(explorer.getByRole("group", { name: "Mapped household readings" }).getByRole("button")).toHaveCount(1);
  await expect(explorer.getByRole("group", { name: "Mapped household readings" }).getByRole("button")).toHaveAccessibleName("Locate SG-012");
  await explorer.getByRole("button", { name: "Locate anomaly", exact: true }).click();
  await expect(explorer.locator(".explorer-canvas")).toHaveAttribute("data-view", "top");
  await explorer.screenshot({ path: "test-results/putra-anomaly-footprint.png" });
  await explorer.getByRole("link", { name: "Inspect all six signals", exact: false }).click();
  await expect(page.locator(".heatmap-flagged")).toContainText("SG-012");
  await expect(page.getByRole("button", { name: "Resume simulation", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Township overview", exact: true }).click();
  await expect(explorer.locator(".map-home-concern")).toHaveAttribute("data-anchor", "SG-012");
  await explorer.getByRole("group", { name: "Filter mapped households" }).getByRole("button", { name: "Anomalies" }).click();
  await explorer.getByRole("button", { name: "Clear map demo" }).click();
  await expect(explorer.locator(".map-home-concern")).toHaveCount(0);
  await expect(explorer.getByRole("button", { name: "Locate anomaly", exact: true })).toHaveCount(0);
  await expect(explorer.getByRole("group", { name: "Mapped household readings" }).getByRole("button")).toHaveCount(0);
});

test("WebGL failure preserves accessible household values and image references", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === "webgl2" || type === "webgl") return null;
      return getContext.apply(this, [type, ...args] as Parameters<typeof getContext>);
    } as typeof getContext;
  });
  await page.goto("/overview");
  const explorer = page.locator(".township-explorer");
  await expect(explorer.getByText("The 3D view could not be loaded.")).toBeVisible();
  await explorer.getByLabel("3D household").selectOption("SG-020");
  await expect(explorer.getByTestId("home-electricity")).not.toContainText("—");
  await expect(explorer.getByRole("button", { name: "Locate this home" })).toBeDisabled();
  await explorer.getByRole("button", { name: "2D map", exact: true }).click();
  await expect(explorer.getByAltText("Township map", { exact: true })).toBeVisible();
});

test("township loader rotates the brand logo, respects reduced motion and clears when ready", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/township/putra-geography.json", async (route) => { await pending; await route.continue(); });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/overview");
  const loader = page.locator(".explorer-loading");
  const logo = loader.locator("img");
  try {
    await expect(loader).toBeVisible();
    await expect(loader).toHaveAttribute("role", "status");
    await expect(loader).toContainText("Building the township…");
    await expect(logo).toHaveCSS("animation-name", "spin");
    await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: "test-results/township-loader-desktop.png" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(logo).toHaveCSS("animation-name", "none");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(loader.locator("strong")).toBeInViewport();
    await page.screenshot({ path: "test-results/township-loader-mobile.png" });
  } finally {
    release();
  }
  await expect(page.locator(".explorer-canvas")).toHaveAttribute("data-ready", "true", { timeout: 15000 });
  await expect(loader).toHaveCount(0);
});

test("failed geography download preserves readings and can be retried", async ({ page }) => {
  await page.route("**/township/putra-geography.json", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/overview");
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
  await page.goto("/overview");
  const explorer = page.locator(".township-explorer");
  await expect(explorer.getByLabel("3D household")).toBeDisabled();
  await expect(explorer.getByTestId("home-water")).toContainText("—");
  await expect(explorer.getByTestId("home-electricity")).toContainText("—");
  await expect(explorer.getByRole("button", { name: /^Select SG-/ })).toHaveCount(0);
  await expect(explorer.getByTestId("chart-total-electricity")).toContainText("—");
  await expect(explorer.getByTestId("map-total-water")).toContainText("—");
});
