import { test, expect } from "@playwright/test";
import { groupCards, type SansanCard } from "../../src/lib/sansan";

test("Sansan demo endpoint rejects requests without its password", async ({
  request,
}) => {
  const response = await request.get("/api/sansan?metadata=1");
  expect([401, 503]).toContain(response.status());
});

test("Sansan demo filters by department and persists a new import", async ({
  page,
}) => {
  const card: SansanCard = {
    id: "card",
    companyId: "company",
    personId: "person",
    companyName: "株式会社サンプル商事",
    firstName: "太郎",
    lastName: "山田",
    departmentName: null,
    title: null,
    email: null,
    mobile: null,
    tel: null,
    address: null,
    url: null,
    exchangeDate: "2026-01-01",
    updatedTime: "2026-01-01T00:00:00Z",
    owner: { id: "demo-sato", name: "佐藤" },
  };
  const departments = [{ id: "demo-sales", name: "営業事業部", parentId: "" }];
  const seen: string[] = [];
  await page.route("**/api/sansan*", async (route) => {
    seen.push(route.request().url());
    expect(route.request().headers()["x-sansan-demo-password"]).toBe(
      "test-password",
    );
    if (route.request().url().includes("metadata=1"))
      await route.fulfill({
        json: { departments, users: [{ id: "demo-sato", name: "佐藤" }] },
      });
    else
      await route.fulfill({
        json: {
          departments,
          organizationError: "",
          companies: groupCards([card]),
        },
      });
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Sansan連携" }).click();
  await expect(
    page.getByText("デモモード：Sansanの名刺を登録日時の新しい順に最大10件", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByLabel("デモ用パスワード").fill("test-password");
  await page.getByRole("button", { name: "事業部・社員を取得" }).click();
  await page.getByLabel("取込元の事業部").selectOption("demo-sales");
  await page.getByLabel("社員（名刺所有者）").selectOption("demo-sato");
  await page.getByRole("button", { name: "Sansanから取得" }).click();
  await expect(
    page.getByText("株式会社サンプル商事", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".sansan-row").filter({ hasText: "株式会社サンプル商事" }),
  ).toContainText("1人");
  await expect(
    page.getByText("デモソリューション株式会社", { exact: true }),
  ).toHaveCount(0);
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("checkbox", { name: "株式会社サンプル商事を一括取込に選択" })
    .check();
  await page
    .getByRole("button", { name: /選択した会社を一括新規取込/ })
    .click();
  await expect(page.getByRole("status")).toContainText("1社を取り込みました");
  await page.reload();
  await page.getByRole("button", { name: "Sansan連携" }).click();
  await page.getByLabel("デモ用パスワード").fill("test-password");
  await page.getByRole("button", { name: "Sansanから取得" }).click();
  await expect(
    page.getByText("株式会社サンプル商事", { exact: true }),
  ).toHaveCount(0);
  expect(seen.some((x) => x.includes("metadata=1"))).toBe(true);
  expect(
    seen.filter((x) => !x.includes("metadata=1")).length,
  ).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "取引先", exact: true }).click();
  await expect(
    page
      .getByRole("grid", { name: "取引先一覧" })
      .getByText("株式会社サンプル商事", { exact: true }),
  ).toBeVisible();
});
