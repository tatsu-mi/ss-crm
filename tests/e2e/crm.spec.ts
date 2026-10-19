import { test, expect, type Page } from "@playwright/test";
const customer = "株式会社BLUEPRINT";
const grid = (page: Page, name: string) =>
  page.getByRole("grid", { name, exact: true });
async function editCell(
  page: Page,
  table: string,
  cell: string,
  value: string,
  kind: "textbox" | "spinbutton" | "combobox" = "textbox",
  key = "Enter",
) {
  const target = grid(page, table).getByRole("gridcell", {
    name: cell,
    exact: true,
  });
  await target.dblclick();
  const editor = target.getByRole(kind);
  if (kind === "combobox") await editor.selectOption(value);
  else await editor.fill(value);
  await editor.press(key);
  if (key === "Escape" || key === "Enter" || key === "Tab")
    await expect(editor).toHaveCount(0);
}
test("mock layout, original columns and profile fields are present", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  expect((await request.get("/api/workspace")).status()).toBe(401);
  expect((await request.post("/api/workspace", { data: {} })).status()).toBe(
    401,
  );
  expect((await request.get("/api/cron/reminders")).status()).toBe(401);
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto("/");
  await expect(grid(page, "取引先一覧")).toBeVisible();
  for (const name of [
    "取引先名",
    "WEBサイト",
    "電話番号",
    "業種",
    "所在地",
    "担当者数",
    "契約エンジニア数",
    "進捗状況",
    "最終活動日",
    "更新日",
    "担当者",
  ])
    await expect(
      grid(page, "取引先一覧").getByRole("columnheader", { name, exact: true }),
    ).toBeVisible();
  await expect(grid(page, "取引先の基本情報")).toBeVisible();
  for (const name of ["ふりがな", "従業員数", "設立年月", "売上規模"])
    await expect(
      grid(page, "取引先の基本情報").getByText(name, { exact: true }),
    ).toBeVisible();
  await expect(grid(page, "担当者一覧")).toBeVisible();
  await expect(
    page.locator(".activity-panel").getByRole("grid", { name: "活動一覧" }),
  ).toBeVisible();
  await expect(page.locator(".timeline")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "参画関係", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "test-results/mock-restored-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("directory and profile cells save with Enter, Tab and blur; Escape discards", async ({
  page,
}) => {
  await page.goto("/");
  await editCell(page, "取引先一覧", `電話番号 ${customer}`, "03-0000-0000");
  await expect(
    grid(page, "取引先の基本情報").getByRole("gridcell", {
      name: `電話番号 ${customer}`,
      exact: true,
    }),
  ).toHaveText("03-0000-0000");
  await editCell(
    page,
    "取引先の基本情報",
    `ふりがな ${customer}`,
    "ぶるーぷりんと編集",
    "textbox",
    "Tab",
  );
  await expect(
    grid(page, "取引先の基本情報").getByRole("gridcell", {
      name: `ふりがな ${customer}`,
      exact: true,
    }),
  ).toHaveText("ぶるーぷりんと編集");
  await editCell(
    page,
    "取引先一覧",
    `業種 ${customer}`,
    "保存しない業種",
    "textbox",
    "Escape",
  );
  await expect(
    grid(page, "取引先一覧").getByRole("gridcell", {
      name: `業種 ${customer}`,
      exact: true,
    }),
  ).toHaveText("SIer");
  const address = grid(page, "取引先の基本情報").getByRole("gridcell", {
    name: `所在地 ${customer}`,
    exact: true,
  });
  await address.dblclick();
  await address.getByRole("textbox").fill("東京都港区 更新後の住所");
  await grid(page, "取引先の基本情報")
    .getByRole("gridcell", { name: `業種 ${customer}`, exact: true })
    .click();
  await expect(address.getByRole("textbox")).toHaveCount(0);
  await expect(
    grid(page, "取引先一覧").getByRole("gridcell", {
      name: `所在地 ${customer}`,
      exact: true,
    }),
  ).toHaveText("東京都港区 更新後の住所");
  const established = grid(page, "取引先の基本情報").getByRole("gridcell", {
    name: `設立年月 ${customer}`,
    exact: true,
  });
  await established.dblclick();
  await established.locator('input[type="month"]').fill("2016-07");
  await established.locator('input[type="month"]').press("Enter");
  await expect(established).toHaveText("2016年7月");
  await page.reload();
  await expect(
    grid(page, "取引先一覧").getByRole("gridcell", {
      name: `電話番号 ${customer}`,
      exact: true,
    }),
  ).toHaveText("03-0000-0000");
  await expect(
    grid(page, "取引先の基本情報").getByRole("gridcell", {
      name: `ふりがな ${customer}`,
      exact: true,
    }),
  ).toHaveText("ぶるーぷりんと編集");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("contact and activity cells edit directly with history and refresh persistence", async ({
  page,
}) => {
  await page.goto("/");
  await editCell(page, "担当者一覧", "電話番号 鈴木 一郎", "080-9999-1111");
  await editCell(
    page,
    "活動一覧",
    "タイトル 次期開発体制についての面談",
    "面談の直接編集",
  );
  await editCell(
    page,
    "活動一覧",
    "活動種別 面談の直接編集",
    "00000000-0000-4000-8000-000000000016",
    "combobox",
  );
  await page.reload();
  await expect(
    grid(page, "担当者一覧").getByRole("gridcell", {
      name: "電話番号 鈴木 一郎",
      exact: true,
    }),
  ).toHaveText("080-9999-1111");
  await expect(
    grid(page, "活動一覧").getByRole("gridcell", {
      name: "活動種別 面談の直接編集",
      exact: true,
    }),
  ).toHaveText("提案");
  await grid(page, "活動一覧")
    .getByRole("button", { name: "面談の直接編集の詳細・履歴", exact: true })
    .click();
  await page
    .getByRole("button", { name: "変更履歴を表示", exact: true })
    .click();
  await expect(page.getByText(/版 3 · update/)).toBeVisible();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
});
test("contract engineers display joined tables and directly edit period amounts", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator(".detail-tabs")
    .getByRole("button", { name: /^契約エンジニア/ })
    .click();
  await expect(grid(page, "契約エンジニア一覧")).toBeVisible();
  await editCell(
    page,
    "契約エンジニア一覧",
    "請求単価 山田 太郎",
    "810000",
    "spinbutton",
  );
  await expect(
    grid(page, "契約エンジニア一覧").getByRole("gridcell", {
      name: "請求単価 山田 太郎",
      exact: true,
    }),
  ).toHaveText("¥810,000");
  await grid(page, "契約エンジニア一覧")
    .getByRole("button", { name: "更新", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel(/^請求単価/)
    .fill("820000");
  await page.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    grid(page, "契約エンジニア一覧").getByRole("gridcell", {
      name: "請求単価 山田 太郎",
      exact: true,
    }),
  ).toHaveText(["¥820,000", "¥810,000"]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mock-restored-mobile.png",
    fullPage: true,
  });
});
test("invalid inline changes remain editable and never overwrite saved dates", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator(".detail-tabs")
    .getByRole("button", { name: /^契約エンジニア/ })
    .click();
  const target = grid(page, "契約エンジニア一覧").getByRole("gridcell", {
    name: "終了日 山田 太郎",
    exact: true,
  });
  const original = await target.textContent();
  await target.dblclick();
  await target.getByRole("textbox").fill("2000-01-01");
  await target.getByRole("textbox").press("Enter");
  await expect(page.locator(".sheet-error[role=alert]")).toContainText(
    "開始日は終了日以前",
  );
  await expect(target.getByRole("textbox")).toHaveValue("2000-01-01");
  await target.getByRole("textbox").press("Escape");
  await expect(target).toHaveText(original!);
});
test("contract registration saves engineer, relationship, contract and period together", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator(".detail-tabs")
    .getByRole("button", { name: /^契約エンジニア/ })
    .click();
  await page
    .getByRole("button", { name: "契約エンジニアを追加", exact: true })
    .click();
  await page
    .getByLabel("新規エンジニア名", { exact: true })
    .fill("新規エンジニア");
  await page
    .getByRole("dialog")
    .getByLabel(/^契約名/)
    .fill("新しい参画契約");
  await page
    .getByRole("dialog")
    .getByLabel(/^開始日/)
    .fill("2027-01-01");
  await page
    .getByRole("dialog")
    .getByLabel(/^終了日/)
    .fill("2027-03-31");
  await page
    .getByRole("dialog")
    .getByLabel(/^請求単価/)
    .fill("850000");
  await page.getByRole("dialog").getByLabel(/^原価/).fill("630000");
  await page.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    grid(page, "契約エンジニア一覧").getByRole("gridcell", {
      name: "氏名 新規エンジニア",
      exact: true,
    }),
  ).toHaveText("新規エンジニア");
  await page.reload();
  await page
    .locator(".detail-tabs")
    .getByRole("button", { name: /^契約エンジニア/ })
    .click();
  await expect(
    grid(page, "契約エンジニア一覧").getByRole("gridcell", {
      name: "請求単価 新規エンジニア",
      exact: true,
    }),
  ).toHaveText("¥850,000");
});
test("inline task state uses the same standard records and retains lifecycle actions", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator(".detail-tabs")
    .getByRole("button", { name: "タスク", exact: true })
    .click();
  await editCell(
    page,
    "タスク一覧",
    "状態 次期開発体制の提案書を送付",
    "completed",
    "combobox",
  );
  await expect(
    grid(page, "タスク一覧").getByRole("gridcell", {
      name: "状態 次期開発体制の提案書を送付",
      exact: true,
    }),
  ).toHaveText("完了");
  await grid(page, "タスク一覧")
    .getByRole("button", {
      name: "次期開発体制の提案書を送付の詳細・履歴",
      exact: true,
    })
    .click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    grid(page, "タスク一覧").getByRole("gridcell", {
      name: "状態 次期開発体制の提案書を送付",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("keyboard editing and concurrent conflicts preserve entered values", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const phone = grid(page, "取引先一覧").getByRole("gridcell", {
    name: `電話番号 ${customer}`,
    exact: true,
  });
  await phone.focus();
  await phone.press("Enter");
  await phone.getByRole("textbox").fill("03-7777-1111");
  await phone.getByRole("textbox").press("Tab");
  const industry = grid(page, "取引先一覧").getByRole("gridcell", {
    name: `業種 ${customer}`,
    exact: true,
  });
  await expect(industry).toBeFocused();
  await industry.press("F2");
  await industry.getByRole("textbox").fill("ソフトウェア");
  await industry.getByRole("textbox").press("Enter");
  await expect(industry).toHaveText("ソフトウェア");
  const second = await context.newPage();
  await second.goto("/");
  await editCell(second, "取引先一覧", `電話番号 ${customer}`, "03-2222-3333");
  await phone.dblclick();
  await phone.getByRole("textbox").fill("03-9999-0000");
  await phone.getByRole("textbox").press("Enter");
  await expect(page.locator(".sheet-error")).toContainText(
    "他の利用者が変更しました",
  );
  await expect(phone.getByRole("textbox")).toHaveValue("03-9999-0000");
  await expect(
    grid(second, "取引先一覧").getByRole("gridcell", {
      name: `電話番号 ${customer}`,
      exact: true,
    }),
  ).toHaveText("03-2222-3333");
  await second.close();
});
