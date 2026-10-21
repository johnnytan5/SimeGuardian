import { test, expect, type APIRequestContext } from "@playwright/test";

async function snapshot(request: APIRequestContext) {
  const { token } = await (await request.get("/api/session")).json();
  const response = await request.get("/api/mlops", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test("main dashboard shows recorded metrics and evidence without an external dashboard", async ({
  page,
  request,
}) => {
  const source = await snapshot(request);
  const champion = source.versions.find(
    (v: any) => v.version === source.aliases.champion,
  );
  await page.goto("/training");
  await expect(
    page.getByRole("heading", { name: "Model training", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".kpi").filter({ hasText: "Validation F1" }),
  ).toContainText(champion.run.metrics.validation_window_f1.toFixed(3));
  expect(await page.locator("iframe").count()).toBe(0);
  expect(await page.locator('a[href*="5050"]').count()).toBe(0);
  await page.getByRole("button", { name: "Inspect model evidence" }).click();
  await expect(page.getByRole("dialog")).toContainText(champion.run.id);
  await page.getByText("dataset manifest.json", { exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    champion.run.tags.validation_digest,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByText("Advanced model controls", { exact: true }).click();
  await page.getByRole("link", { name: "Model registry", exact: true }).click();
  await page.getByRole("button", { name: "Roll back champion" }).click();
  await expect(page.getByRole("dialog")).toContainText("rollback audit record");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await snapshot(request)).aliases.champion).toBe(
    source.aliases.champion,
  );
});

test("train from the main frontend and retain the champion until an explicit promotion", async ({
  page,
  request,
}) => {
  const before = await snapshot(request);
  await page.goto("/training");
  await page.getByRole("button", { name: "Train new model" }).click();
  await page.getByLabel("Number of trees").fill("20");
  await page.getByLabel("Random seed").fill("7");
  await page
    .getByRole("button", { name: "Start training", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect
    .poll(async () => (await snapshot(request)).jobs[0]?.status, {
      timeout: 45000,
    })
    .toBe("completed");
  const after = await snapshot(request);
  expect(after.versions.length).toBe(before.versions.length + 1);
  expect(after.aliases.champion).toBe(before.aliases.champion);
  const trained = after.versions.at(-1);
  expect(trained.run.parameters.n_estimators).toBe("20");
  expect(trained.run.parameters.random_state).toBe("7");
  await page.getByRole("button", { name: "Refresh workspace" }).click();
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByText(`v${trained.version}`, { exact: true }) }),
  ).toContainText("Candidate");
  await expect(
    page.getByRole("heading", { name: "Training activity" }),
  ).toBeVisible();
});

test("workspace stays within the viewport on an iPhone-sized screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/training");
  await expect(
    page.getByRole("heading", { name: "Model training", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Train new model" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Train new model" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("registry actions run inside the dashboard and leave an audit trail", async ({
  page,
  request,
}) => {
  const before = await snapshot(request);
  await page.goto("/training");
  await page.getByText("Advanced model controls", { exact: true }).click();
  await page.getByRole("link", { name: "Model registry", exact: true }).click();
  await page.getByRole("button", { name: "Roll back champion" }).click();
  await page
    .getByRole("button", { name: "Confirm rollback", exact: true })
    .click();
  try {
    await expect
      .poll(async () => (await snapshot(request)).aliases.champion)
      .toBe(before.aliases.previous_champion);
    const original = page
      .getByRole("row")
      .filter({
        has: page.getByText(`v${before.aliases.champion}`, { exact: true }),
      });
    await expect(
      original.getByRole("button", { name: "Promote", exact: true }),
    ).toBeEnabled();
    await original
      .getByRole("button", { name: "Promote", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm promotion", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(request)).aliases.champion)
      .toBe(before.aliases.champion);
    await expect(
      page.getByRole("heading", { name: "Registry activity" }),
    ).toBeVisible();
  } finally {
    const current = await snapshot(request);
    if (current.aliases.champion !== before.aliases.champion) {
      const { token } = await (await request.get("/api/session")).json();
      await request.post(`/api/models/${before.aliases.champion}/promote`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { expected_champion: current.aliases.champion },
      });
    }
  }
});
