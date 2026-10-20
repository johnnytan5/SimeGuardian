import { test, expect, type APIRequestContext } from "@playwright/test";

async function session(request: APIRequestContext, role = "operator") {
  const result = await (await request.get(`/api/session?role=${role}`)).json();
  return { Authorization: `Bearer ${result.token}` };
}
async function replay(request: APIRequestContext) {
  return (
    await request.get("/api/workspace", { headers: await session(request) })
  ).json();
}
async function reset(request: APIRequestContext) {
  const data = await replay(request);
  await request.post("/api/demo", {
    headers: await session(request),
    data: { action: "reset", revision: data.state.revision },
  });
}

test("main routes and dataset drill-down survive direct navigation and refresh", async ({
  page,
}) => {
  const pages = [
    ["/", "A clearer view. A better check-in."],
    ["/pipeline", "Signal pipeline"],
    ["/datasets", "Datasets & lineage"],
    ["/training", "Training"],
    ["/evaluation", "Evaluation"],
    ["/models", "Model registry"],
    ["/inference", "Inference & incidents"],
    ["/operations", "Operations & coverage"],
    ["/demo", "Demo controls"],
    ["/response", "Township response"],
  ];
  for (const [path, title] of pages) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  await page.goto("/datasets/township-ui-v1?household=SG-004");
  await expect(
    page.getByRole("heading", { name: "Six-source UI fixture", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Household", { exact: true })).toHaveValue(
    "SG-004",
  );
  await page.getByLabel("Source", { exact: true }).selectOption("water");
  await expect(page.locator(".filter-bar")).toContainText(
    "96 matching records",
  );
  await expect(page.getByRole("row").nth(1)).toContainText("SG-004");
  await expect(page.getByRole("row").nth(1)).toContainText("litres");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".pagination")).toContainText("21–40 of 96");
  await page.reload();
  await expect(page.getByLabel("Household", { exact: true })).toHaveValue(
    "SG-004",
  );
  await page.goto("/datasets/unknown");
  await expect(page.getByRole("alert")).toContainText("not in the workspace");
});

test("registered model to incident to restricted responder outcome uses persisted evidence", async ({
  page,
  request,
}) => {
  await reset(request);
  try {
    await page.goto("/demo");
    await page
      .getByRole("radio", { name: "Quiet household", exact: false })
      .check();
    await page.getByRole("button", { name: "Load scenario" }).click();
    await expect(page.getByRole("status")).toContainText("Replay updated");
    await page.getByRole("button", { name: "Run registered model" }).click();
    await expect(page.getByRole("status")).toContainText("Inference recorded");
    let data = await replay(request);
    expect(data.state.inference.score).toBeLessThan(0);
    expect(data.state.inference.version).toBeTruthy();
    expect(data.state.incident.notifications).toHaveLength(1);
    const incident = data.state.incident.id;
    await page.getByRole("button", { name: "Advance +5 min" }).click();
    await expect
      .poll(
        async () => (await replay(request)).state.incident.notifications.length,
      )
      .toBe(2);
    await page.getByRole("button", { name: "Advance +5 min" }).click();
    await expect
      .poll(
        async () => (await replay(request)).state.incident.notifications.length,
      )
      .toBe(3);
    await page.goto(`/incidents/${incident}`);
    await expect(
      page.getByRole("heading", { name: incident, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Incident timeline" }),
    ).toBeVisible();
    await expect(page.locator(".notification-list")).toContainText(
      "receipt unconfirmed",
    );
    await page.getByRole("button", { name: "Switch to responder" }).click();
    await expect(
      page.getByRole("heading", { name: "Your assigned check-ins" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Pipeline", exact: true }),
    ).toHaveCount(0);
    const headers = await session(request, "responder");
    expect((await request.get("/api/workspace", { headers })).status()).toBe(
      403,
    );
    const scoped = await (
      await request.get("/api/response", { headers })
    ).json();
    expect(JSON.stringify(scoped)).not.toContain("electricity_ratio");
    expect(scoped.tasks[0].id).toBe(incident);
    await page.getByRole("button", { name: "Accept responsibility" }).click();
    await expect(
      page.getByRole("button", { name: "Record completed check-in" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Record completed check-in" })
      .click();
    await page
      .getByLabel("Completed outcome", { exact: true })
      .fill("Demo contact completed; family following up.");
    await page
      .getByRole("button", { name: "Complete check-in", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator(".responder-copy")).toContainText(
      "Demo contact completed",
    );
    await page.getByRole("button", { name: "Return to operator" }).click();
    await page.goto(`/incidents/${incident}`);
    await expect(page.locator(".incident-summary")).toContainText("resolved");
    data = await replay(request);
    expect(data.state.incident.status).toBe("resolved");
  } finally {
    await reset(request);
  }
});

test("missing water is not scored or treated as zero", async ({
  page,
  request,
}) => {
  await reset(request);
  try {
    await page.goto("/demo");
    await page
      .getByRole("radio", { name: "Missing water feed", exact: false })
      .check();
    await page.getByRole("button", { name: "Load scenario" }).click();
    await expect(page.getByRole("status")).toContainText("Replay updated");
    await page.getByRole("button", { name: "Run registered model" }).click();
    await expect(page.getByRole("status")).toContainText("Inference recorded");
    await page.goto("/inference");
    await expect(page.locator(".score-result")).toContainText("Not scored");
    await expect(page.locator(".score-result")).toContainText(
      "coverage blocked",
    );
    await expect(page.getByText("Missing · never zero-filled")).toBeVisible();
    expect((await replay(request)).state.incident).toBeNull();
  } finally {
    await reset(request);
  }
});

test("workspace API failure can be retried without a broken shell", async ({
  page,
}) => {
  await page.route("**/api/workspace", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Workspace temporarily unavailable" }),
    }),
  );
  await page.goto("/pipeline");
  await expect(page.getByRole("alert")).toContainText(
    "Workspace temporarily unavailable",
  );
  await page.unroute("**/api/workspace");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Signal pipeline" }),
  ).toBeVisible();
});

test("run evidence and worker logs support direct links", async ({
  page,
  request,
}) => {
  const headers = await session(request);
  const models = await (await request.get("/api/mlops", { headers })).json();
  const champion = models.versions.find(
    (version: any) => version.version === models.aliases.champion,
  );
  await page.goto(`/training/${champion.run.id}`);
  await expect(page.getByRole("dialog")).toContainText(champion.run.id);
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText(champion.run.id);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/training$/);
  if (models.jobs.length) {
    await page.goto(`/training/jobs/${models.jobs[0].id}`);
    await expect(
      page.getByRole("dialog", { name: "Training job log" }),
    ).toContainText(models.jobs[0].id);
    await expect(page.locator(".job-log")).not.toBeEmpty();
  }
});

test("operations pages stay usable on compact screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/",
    "/pipeline",
    "/datasets/smoke-features-v1",
    "/inference",
    "/operations",
    "/demo",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.getByRole("button", { name: "Reset replay", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
