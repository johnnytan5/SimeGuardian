import { expect, test } from "@playwright/test";

for (const reducedMotion of [false, true]) {
  test(`phase changes ${reducedMotion ? "respect reduced motion" : "morph the indicator, including the fullscreen map"}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
    await page.addInitScript(() => {
      const start = document.startViewTransition.bind(document);
      (window as any).phaseTransitions = [];
      document.startViewTransition = (update) => {
        const transition = start(update);
        const result = { ready: false, finished: false, error: "", animations: [] as string[] };
        (window as any).phaseTransitions.push(result);
        transition.ready.then(() => {
          result.ready = true;
          result.animations = document.getAnimations().map((animation) => (animation as CSSAnimation).animationName ?? "");
          if ((window as any).pauseMorph) {
            document.getAnimations().forEach((animation) => {
              const duration = animation.effect?.getTiming().duration;
              if ((animation as CSSAnimation).animationName?.includes("phase") && typeof duration === "number") {
                animation.pause();
                animation.currentTime = duration / 2;
              }
            });
          }
        }, (error) => { result.error = String(error); });
        transition.finished.then(() => { result.finished = true; });
        return transition;
      };
    });
    await page.goto("/overview");
    let flow = page.getByRole("dialog", { name: "Putra Heights" }).getByRole("navigation", { name: "Demo flow" });
    await expect(flow).toBeVisible();
    for (const [index, stage] of ["Monitoring", "Model training", "Anomaly detection", "Rescue", "Overview"].entries()) {
      if (!reducedMotion && index === 1) await page.evaluate(() => { (window as any).pauseMorph = true; });
      await flow.getByRole("link", { name: stage, exact: true }).focus();
      await page.keyboard.press("Enter");
      if (!reducedMotion && index === 1) {
        await expect.poll(() => page.evaluate((i) => (window as any).phaseTransitions[i]?.ready, index)).toBe(true);
        await page.screenshot({ path: "test-results/phase-morph-midpoint.png", clip: { x: 0, y: 0, width: 1280, height: 160 } });
        await page.evaluate(() => {
          (window as any).pauseMorph = false;
          document.getAnimations().filter((animation) => (animation as CSSAnimation).animationName?.includes("phase")).forEach((animation) => animation.play());
        });
      }
      await expect.poll(() => page.evaluate((i) => (window as any).phaseTransitions[i]?.finished, index)).toBe(true);
      const result = await page.evaluate((i) => (window as any).phaseTransitions[i], index);
      expect(result.error).toBe("");
      expect(result.ready).toBe(true);
      expect(result.animations.some((name: string) => name.includes("phase-indicator"))).toBe(!reducedMotion);
      flow = stage === "Overview"
        ? page.getByRole("dialog", { name: "Putra Heights" }).getByRole("navigation", { name: "Demo flow" })
        : page.locator(".topbar").getByRole("navigation", { name: "Demo flow" });
      await expect(flow.getByRole("link", { name: stage, exact: true })).toHaveAttribute("aria-current", "step");
    }
    expect(errors).toEqual([]);
  });
}

test("phase links still navigate when view transitions are unavailable", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(document, "startViewTransition", { value: undefined }));
  await page.goto("/demo");
  await page.getByRole("navigation", { name: "Demo flow" }).getByRole("link", { name: "Rescue", exact: true }).click();
  await expect(page).toHaveURL(/\/response$/);
  await expect(page.getByRole("heading", { name: "Rescue", exact: true })).toBeVisible();
});

for (const width of [1440, 900, 390]) {
  test(`demo navigation keeps its dimensions between stages at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/overview");
    let flow = page.getByRole("dialog", { name: "Putra Heights" }).getByRole("navigation", { name: "Demo flow" });
    await expect(flow).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const dimensions = () => flow.evaluate((nav) => {
      const bounds = (element: Element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      return {
        bar: bounds(nav),
        steps: Array.from(nav.querySelectorAll(".demo-step")).map(bounds),
        font: getComputedStyle(nav).fontFamily,
      };
    });
    const overview = await dimensions();
    expect(overview.steps).toHaveLength(5);
    expect(overview.bar.height).toBe(width <= 680 ? 80 : 64);
    for (const stage of ["Monitoring", "Model training", "Anomaly detection", "Rescue", "Overview"]) {
      await flow.getByRole("link", { name: stage, exact: true }).click();
      flow = stage === "Overview"
        ? page.getByRole("dialog", { name: "Putra Heights" }).getByRole("navigation", { name: "Demo flow" })
        : page.locator(".topbar").getByRole("navigation", { name: "Demo flow" });
      await expect(flow.getByRole("link", { name: stage, exact: true })).toHaveAttribute("aria-current", "step");
      await expect(flow.locator('[aria-current="step"]')).toHaveCount(1);
      expect(await dimensions()).toEqual(overview);
    }
    await flow.screenshot({ path: `test-results/demo-flow-${width}.png` });
  });
}

test("overview opens fullscreen by default and supports exit, re-entry and reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/overview$/);
  const explorer = page.getByRole("dialog", { name: "Putra Heights" });
  await expect(explorer).toBeVisible();
  expect(await explorer.evaluate((element) => element.matches(":modal"))).toBe(true);
  expect(await explorer.boundingBox()).toEqual({ x: 0, y: 0, width: 1440, height: 1100 });
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await expect(page.getByRole("heading", { name: "Daily signal flow" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Household usage heatmap" })).toHaveCount(0);
  await expect(explorer.locator(".explorer-canvas")).toHaveAttribute("data-ready", "true");
  await page.screenshot({ path: "test-results/township-overview-page.png", fullPage: true });
  await page.keyboard.press("Escape");
  expect(await explorer.evaluate((element) => element.matches(":modal"))).toBe(false);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await page.getByRole("button", { name: "Expand map fullscreen" }).click();
  expect(await explorer.evaluate((element) => element.matches(":modal"))).toBe(true);
  await page.getByRole("button", { name: "Exit fullscreen map" }).click();
  await page.getByRole("button", { name: "Show sidebar" }).click();
  await expect(page.locator("#workspace-sidebar").getByRole("link", { name: "Overview", exact: true })).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(explorer).toBeVisible();
  expect(await explorer.evaluate((element) => element.matches(":modal"))).toBe(true);
  await explorer.getByRole("navigation", { name: "Demo flow" }).getByRole("link", { name: "Monitoring", exact: true }).click();
  await expect(page).toHaveURL(/\/pipeline$/);
  await expect(explorer).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await expect(page.getByRole("heading", { name: "Daily signal flow" })).toBeVisible();
});

test("demo flow connects the five pages and keeps the trimmed sidebar optional", async ({ page }) => {
  await page.goto("/training");
  const flow = page.getByRole("navigation", { name: "Demo flow" });
  const sidebar = page.locator("#workspace-sidebar");
  await expect(sidebar).toBeHidden();
  await expect(flow.getByRole("link")).toHaveText(["1Overview", "2Monitoring", "3Model training", "4Anomaly detection", "5Rescue"]);
  await expect(flow.getByRole("link", { name: "Model training", exact: true })).toHaveAttribute("aria-current", "step");
  await page.locator(".topbar").screenshot({ path: "test-results/demo-flow-desktop.png" });
  await page.getByRole("button", { name: "Show sidebar" }).click();
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole("link")).toHaveText(["Overview", "Monitoring", "Model training", "Anomaly detection", "Rescue"]);
  await expect(page.getByRole("button", { name: "Hide sidebar" })).toHaveAttribute("aria-expanded", "true");
  await page.screenshot({ path: "test-results/demo-flow-sidebar.png" });
  await sidebar.getByRole("link", { name: "Anomaly detection", exact: true }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(sidebar.getByRole("link", { name: "Anomaly detection", exact: true })).toHaveAttribute("aria-current", "page");
  await sidebar.getByRole("link", { name: "Model training", exact: true }).click();
  await page.getByText("Advanced model controls", { exact: true }).click();
  await page.getByRole("link", { name: "Model registry", exact: true }).click();
  await expect(page).toHaveURL(/\/models$/);
  await expect(flow.getByRole("link", { name: "Model training", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(sidebar.getByRole("link", { name: "Model training", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Hide sidebar" }).click();
  await expect(sidebar).toBeHidden();

  await flow.getByRole("link", { name: "Anomaly detection", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Anomaly detection", exact: true })).toBeVisible();
  await expect(flow.getByRole("link", { name: "Anomaly detection", exact: true })).toHaveAttribute("aria-current", "step");
  await flow.getByRole("link", { name: "Rescue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Rescue", exact: true })).toBeVisible();
  await flow.getByRole("link", { name: "Monitoring", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Monitoring", exact: true })).toBeVisible();
  await expect(page.locator(".township-explorer")).toHaveCount(0);
  await page.getByRole("link", { name: "Township overview", exact: true }).click();
  const map = page.getByRole("dialog", { name: "Putra Heights" });
  await expect(map).toBeVisible();
  const mapFlow = map.getByRole("navigation", { name: "Demo flow" });
  await expect(mapFlow.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute("aria-current", "step");
  await mapFlow.getByRole("link", { name: "Model training", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Model training", exact: true })).toBeVisible();
  await expect(map).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await expect(sidebar).toBeHidden();
});

test("training and anomaly detection retain access to supporting evidence", async ({ page }) => {
  await page.goto("/training");
  const flow = page.getByRole("navigation", { name: "Demo flow" });
  await expect(page.getByRole("heading", { name: "Model evolution", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Validation F1 by model version/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Action", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Model registry", exact: true })).toBeHidden();
  await page.getByRole("link", { name: "View training data", exact: false }).click();
  await expect(page).toHaveURL(/\/datasets$/);
  await expect(page.getByRole("heading", { name: "Datasets & lineage", exact: true })).toBeVisible();
  await expect(flow.getByRole("link", { name: "Model training", exact: true })).toHaveAttribute("aria-current", "step");
  await flow.getByRole("link", { name: "Model training", exact: true }).click();
  await page.getByText("Advanced model controls", { exact: true }).click();
  await page.getByRole("link", { name: "Detailed evaluation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Validation confusion counts", exact: true })).toBeVisible();
  await flow.getByRole("link", { name: "Anomaly detection", exact: true }).click();
  await expect(page.getByRole("button", { name: "Run registered model", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Inspect current trace", exact: false }).click();
  await expect(page).toHaveURL(/\/(inference|incidents\/[^/]+)$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(flow.getByRole("link", { name: "Anomaly detection", exact: true })).toHaveAttribute("aria-current", "step");
});

test("demo flow and sidebar toggle fit a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/training");
  await page.getByRole("button", { name: "Show sidebar" }).click();
  await expect(page.locator("#workspace-sidebar")).toBeVisible();
  for (const link of await page.locator("#workspace-sidebar").getByRole("link").all()) {
    await expect(link).toBeInViewport();
  }
  await page.screenshot({ path: "test-results/demo-sidebar-mobile.png" });
  await page.getByRole("button", { name: "Hide sidebar" }).click();
  for (const path of ["/training", "/pipeline", "/overview"]) {
    await page.goto(path);
    const flow = path === "/overview"
      ? page.getByRole("dialog", { name: "Putra Heights" }).getByRole("navigation", { name: "Demo flow" })
      : page.getByRole("navigation", { name: "Demo flow" });
    await expect(flow).toBeVisible();
    for (const link of await flow.getByRole("link").all()) {
      await expect(link).toBeInViewport();
      const box = await link.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
});

test("responder navigation stays restricted to rescue", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("simeguardian-role", "responder"));
  await page.goto("/");
  await expect(page).toHaveURL(/\/response$/);
  const flow = page.getByRole("navigation", { name: "Demo flow" });
  await expect(page.getByRole("heading", { name: "Your assigned check-ins" })).toBeVisible();
  await expect(flow.getByRole("link")).toHaveCount(1);
  await expect(flow.locator('[aria-disabled="true"]')).toHaveCount(4);
  await expect(flow.getByRole("link", { name: "Rescue", exact: true })).toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: "Show sidebar" }).click();
  await expect(page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("link")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("link", { name: "Rescue", exact: true })).toHaveAttribute("aria-current", "page");
});
