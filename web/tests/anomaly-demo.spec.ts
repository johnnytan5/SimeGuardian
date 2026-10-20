import { expect, test } from "@playwright/test";
import {
  applyDemoAnomaly, demoAnomalyEvidence, SIGNAL_INTERVAL, simulateSignals,
  townshipWindow, type AnomalyDemoState,
} from "../src/signalSimulation";

test("demo injects one household and flags only corroborated low usage", () => {
  const at = Date.parse("2026-10-19T09:00:00+08:00");
  const demo: AnomalyDemoState = { household: "SG-012", from: at - 6 * 3_600_000, step: 9 };
  const normal = Array.from({ length: 97 }, (_, index) => simulateSignals(at - (96 - index) * SIGNAL_INTERVAL, demo.household));
  const observed = normal.map((point) => applyDemoAnomaly(point, demo.household, demo));
  expect(applyDemoAnomaly(normal[0], demo.household, demo)).toEqual(normal[0]);
  expect(applyDemoAnomaly(normal.at(-1)!, "SG-013", demo)).toEqual(normal.at(-1));
  expect(applyDemoAnomaly(normal.at(-1)!, demo.household, null)).toEqual(normal.at(-1));
  expect(demoAnomalyEvidence(normal, normal, demo.from).detected).toBe(false);
  for (const step of [0, 3, 5]) {
    const partial = normal.map((point) => applyDemoAnomaly(point, demo.household, { ...demo, step }));
    expect(demoAnomalyEvidence(normal, partial, demo.from).detected).toBe(false);
  }
  const evidence = demoAnomalyEvidence(normal, observed, demo.from);
  expect(evidence.electricity).toBeCloseTo(0.04);
  expect(evidence.water).toBeCloseTo(0.04);
  expect(evidence.activity).toBe(false);
  expect(evidence.detected).toBe(true);
  expect(demoAnomalyEvidence([], [], demo.from).detected).toBe(false);
  expect(demoAnomalyEvidence(normal, observed.slice(1), 0).detected).toBe(false);
  const conflicting = observed.map((point, index) => index === 96 ? { ...point, app: 1 } : point);
  expect(demoAnomalyEvidence(normal, conflicting, demo.from).detected).toBe(false);
  const oneUtility = observed.map((point, index) => ({ ...point, water: normal[index].water }));
  expect(demoAnomalyEvidence(normal, oneUtility, demo.from).detected).toBe(false);

  const township = townshipWindow(at, "day", ["SG-012", "SG-013"], demo);
  const baseline = townshipWindow(at, "day", ["SG-012", "SG-013"]);
  expect(township.homes[1]).toEqual(baseline.homes[1]);
  expect(township.homes[0].points.at(-1)!.electricity).toBeCloseTo(baseline.homes[0].points.at(-1)!.electricity * 0.04);
  for (const [index, point] of township.totals.entries()) {
    expect(point.electricity).toBeCloseTo(township.homes.reduce((sum, home) => sum + home.points[index].electricity, 0));
  }
});

test("anomaly walkthrough animates, pauses, flags the selected home and clears without replay writes", async ({ page }) => {
  const writes: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/")) writes.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/pipeline");
  await page.getByLabel("Household", { exact: true }).selectOption("SG-012");
  await page.getByRole("button", { name: "Run anomaly demo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Demo in progress" })).toBeDisabled();
  await expect(page.locator(".anomaly-demo")).toHaveClass(/animating/);
  await expect(page.getByRole("heading", { name: "Normal routine", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "24 hours", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Usage drops", exact: true })).toBeVisible({ timeout: 6000 });
  await page.getByRole("button", { name: "Pause demo", exact: true }).click();
  const pausedTime = await page.getByLabel("Simulation time").getAttribute("datetime");
  const pausedCurve = await page.locator(".anomaly-chart .recharts-area-curve").getAttribute("d");
  await page.waitForTimeout(1200);
  await expect(page.getByRole("heading", { name: "Demo paused" })).toBeVisible();
  expect(await page.getByLabel("Simulation time").getAttribute("datetime")).toBe(pausedTime);
  expect(await page.locator(".anomaly-chart .recharts-area-curve").getAttribute("d")).toBe(pausedCurve);
  await expect(page.locator(".anomaly-demo")).not.toHaveClass(/animating/);
  await page.getByRole("button", { name: "Continue demo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Demo anomaly detected", exact: true })).toBeVisible({ timeout: 12000 });
  await page.getByRole("button", { name: "Pause simulation", exact: true }).click();
  await expect(page.locator(".anomaly-evidence")).toContainText("4% of usual");
  await expect(page.locator(".heatmap-flagged")).toHaveCount(1);
  await expect(page.locator(".heatmap-flagged")).toContainText("SG-012");
  expect(await page.locator(".heatmap-anomaly").count()).toBeGreaterThan(0);
  await expect(page.locator(".anomaly-demo .panel-footer")).toContainText("no incident or notification created");
  await page.locator(".anomaly-demo").screenshot({ path: "test-results/anomaly-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.locator(".anomaly-demo").screenshot({ path: "test-results/anomaly-mobile.png" });
  await page.getByRole("button", { name: "Replay anomaly demo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Normal routine", exact: true })).toBeVisible();
  await expect(page.locator(".heatmap-flagged")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear demo", exact: true }).click();
  await page.waitForTimeout(1200);
  await expect(page.locator(".anomaly-content")).toHaveCount(0);
  await expect(page.locator(".anomaly-reading")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run anomaly demo", exact: true })).toBeEnabled();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("reduced-motion demo advances without effects and switching homes cancels it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/pipeline");
  await page.getByRole("button", { name: "Run anomaly demo", exact: true }).click();
  await expect(page.locator(".anomaly-demo")).not.toHaveClass(/animating/);
  await expect(page.getByRole("heading", { name: "Demo anomaly detected", exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Replay anomaly demo", exact: true }).click();
  await page.getByLabel("Household", { exact: true }).selectOption("SG-024");
  await expect(page.locator(".anomaly-content")).toHaveCount(0);
  await expect(page.locator(".anomaly-demo .panel-heading")).toContainText("SG-024");
  await expect(page.locator(".heatmap-flagged")).toHaveCount(0);
});
