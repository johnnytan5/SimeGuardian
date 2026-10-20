import { expect, test } from "@playwright/test";
import {
  SIGNAL_INTERVAL, signalParameters, simulateSignals, townshipRanges,
  townshipWindow, type TownshipRange,
} from "../src/signalSimulation";

test("normal-day signals stay bounded, vary daily and preserve shared trips", () => {
  const start = Date.parse("2026-10-19T00:00:00+08:00");
  const samples = Array.from({ length: 14 * 96 }, (_, index) => simulateSignals(start + index * SIGNAL_INTERVAL));
  expect(simulateSignals(start)).toEqual(simulateSignals(start));
  for (const [id, parameter] of Object.entries(signalParameters)) {
    const values = samples.map((sample) => sample[id]);
    expect(values.every((value) => Number.isFinite(value) && value >= 0 && value <= parameter.reference)).toBeTruthy();
    expect(new Set(values).size).toBeGreaterThan(1);
    if (!["electricity", "water"].includes(id)) expect(values.every(Number.isInteger)).toBeTruthy();
  }
  expect(samples.every((sample) => sample.parking === sample.gate)).toBeTruthy();
  for (const id of ["electricity", "water"]) {
    expect(samples[7 * 4][id]).toBeGreaterThan(samples[3 * 4][id] * 2);
    expect(samples[19 * 4][id]).toBeGreaterThan(samples[3 * 4][id] * 2);
  }
});

test("township totals reconcile across distinct homes and every time range", () => {
  const at = Date.parse("2026-10-19T09:00:00+08:00");
  const households = Array.from({ length: 24 }, (_, index) => `SG-${String(index + 1).padStart(3, "0")}`);
  for (const [range, settings] of Object.entries(townshipRanges)) {
    const window = townshipWindow(at, range as TownshipRange, households);
    expect(window.homes).toHaveLength(24);
    expect(window.totals).toHaveLength(settings.hours / settings.bucketHours);
    expect(window.totals.at(-1)?.at).toBe(at);
    for (const [index, point] of window.totals.entries()) {
      for (const key of Object.keys(signalParameters)) {
        expect(point[key]).toBeCloseTo(window.homes.reduce((sum, home) => sum + home.points[index][key], 0), 8);
      }
    }
    const lastHomePoint = window.homes[0].points.at(-1)!;
    const hourlySamples = Array.from({ length: settings.bucketHours }, (_, index) => simulateSignals(at - index * 3_600_000, "SG-001"));
    for (const key of Object.keys(signalParameters)) {
      expect(lastHomePoint[key]).toBeCloseTo(hourlySamples.reduce((sum, sample) => sum + sample[key], 0), 8);
    }
    const patterns = window.homes.map((home) => {
      const total = home.points.reduce((sum, point) => sum + point.electricity, 0);
      return home.points.map((point) => (point.electricity / total).toFixed(4)).join(",");
    });
    expect(new Set(patterns).size).toBe(24);
  }
});

test("pipeline animates all signals, pauses, resumes and supports selection and mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/pipeline");
  await expect(page.getByRole("heading", { name: "Daily signal flow" })).toBeVisible();
  await expect(page.locator(".signal-readings .source-card")).toHaveCount(6);
  await expect(page.locator(".signal-chart .recharts-area-curve")).toHaveCount(6);
  await expect(page.locator(".signal-features dt")).toHaveText([
    "electricity ratio", "water ratio", "gate frequency ratio", "resident interactions",
  ]);

  const clock = page.getByLabel("Simulation time");
  const firstTime = await clock.getAttribute("datetime");
  await expect.poll(() => clock.getAttribute("datetime")).not.toBe(firstTime);
  await page.getByRole("button", { name: "Pause simulation" }).click();
  const frozenTime = await clock.getAttribute("datetime");
  const frozenCurve = await page.locator(".recharts-area-curve").last().getAttribute("d");
  await page.waitForTimeout(1200);
  expect(await clock.getAttribute("datetime")).toBe(frozenTime);
  expect(await page.locator(".recharts-area-curve").last().getAttribute("d")).toBe(frozenCurve);
  await page.getByRole("button", { name: /Water.*litres/ }).click();
  await expect(page.getByRole("heading", { name: "Water details" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Water.*litres/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".signal-readings .source-card[aria-pressed=true]")).toHaveCount(1);
  await page.locator(".signal-chart").hover({ position: { x: 150, y: 100 } });
  await expect(page.locator(".signal-tooltip > div")).toHaveCount(6);
  await expect(page.locator(".signal-tooltip")).toContainText("kWh");
  await expect(page.locator(".signal-tooltip")).toContainText("litres");
  const selectedCurve = await page.locator(".recharts-area-curve").last().getAttribute("d");
  await page.getByRole("button", { name: "Resume simulation" }).click();
  await expect.poll(() => clock.getAttribute("datetime")).not.toBe(frozenTime);
  await expect.poll(() => page.locator(".recharts-area-curve").last().getAttribute("d")).not.toBe(selectedCurve);
  await page.getByRole("button", { name: "Pause simulation" }).click();
  await page.screenshot({ path: "test-results/pipeline-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Resume simulation" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: "test-results/pipeline-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("reduced motion starts paused and missing replay inputs stay missing", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/workspace", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.features.water_ratio = null;
    await route.fulfill({ response, json: data });
  });
  await page.goto("/pipeline");
  await expect(page.getByRole("button", { name: "Resume simulation" })).toBeVisible();
  await expect(page.locator(".signal-features > div").filter({ hasText: "water ratio" })).toContainText("Missing");
  const clock = page.getByLabel("Simulation time");
  const initial = await clock.getAttribute("datetime");
  await page.waitForTimeout(1200);
  expect(await clock.getAttribute("datetime")).toBe(initial);
  await expect(page.locator(".pipeline-stages")).not.toHaveClass(/flowing/);
  await page.getByRole("button", { name: "Resume simulation" }).click();
  await expect.poll(() => clock.getAttribute("datetime")).not.toBe(initial);
});

test("management can change range and signal, compare homes and drill into a routine", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/pipeline");
  await page.getByRole("button", { name: "Pause simulation" }).click();
  await expect(page.getByRole("heading", { name: "Township usage overview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "7 days", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /^Inspect household/ })).toHaveCount(24);
  const firstRow = page.getByRole("button", { name: /^Inspect household SG-001,/ });
  await expect(firstRow.locator(".heatmap-cell")).toHaveCount(28);
  const weeklyTotal = await page.locator(".township-summary dd").nth(1).textContent();

  await page.getByRole("button", { name: "30 days", exact: true }).click();
  await expect(firstRow.locator(".heatmap-cell")).toHaveCount(30);
  await expect(page.locator(".township-summary dd").nth(1)).not.toHaveText(weeklyTotal!);
  await page.getByLabel("Usage signal", { exact: true }).selectOption("water");
  await expect(page.locator(".township-chart-heading")).toContainText("Water across all homes");
  await expect(page.locator(".heatmap-total").first()).toContainText("litres");
  await page.screenshot({ path: "test-results/township-desktop.png", fullPage: true });

  const originalCurve = await page.locator(".signal-chart .recharts-area-curve").last().getAttribute("d");
  await page.getByLabel("Find a household pattern").fill("SG-012");
  await expect(page.getByRole("button", { name: /^Inspect household/ })).toHaveCount(1);
  await page.getByRole("button", { name: /^Inspect household SG-012,/ }).click();
  await expect(page.getByLabel("Household", { exact: true })).toHaveValue("SG-012");
  await expect(page.locator(".signal-panel .panel-heading")).toContainText("SG-012 · Split routine");
  await expect(page.locator(".signal-chart .recharts-area-curve").last()).not.toHaveAttribute("d", originalCurve!);
  await page.getByLabel("Find a household pattern").fill("no household");
  await expect(page.getByText("No households match your search.")).toBeVisible();
  await page.getByLabel("Find a household pattern").fill("");
  await page.getByRole("button", { name: "24 hours", exact: true }).click();
  await expect(firstRow.locator(".heatmap-cell")).toHaveCount(24);
  await page.getByLabel("Household", { exact: true }).selectOption("SG-024");
  await expect(page.getByRole("button", { name: /^Inspect household SG-024,/ })).toHaveAttribute("aria-pressed", "true");

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: "test-results/township-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
