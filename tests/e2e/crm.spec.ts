import { test, expect, type Page } from "@playwright/test";
const customer = "株式会社BLUEPRINT";
const grid = (page: Page, name: string) =>
  page.getByRole("grid", { name, exact: true });
test("table columns resize without sorting and contracts use the requested order", async ({
  page,
}) => {
  await page.goto("/");
  const customers = grid(page, "取引先一覧");
  const name = customers.getByRole("columnheader", {
    name: "取引先名",
    exact: true,
  });
  const phone = customers.getByRole("columnheader", {
    name: "電話番号",
    exact: true,
  });
  const before = (await name.boundingBox())!;
  const phoneWidth = (await phone.boundingBox())!.width;
  const handle = customers.getByRole("separator", { name: "取引先名列の幅" });
  const bounds = (await handle.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 80,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await name.boundingBox())!.width)
    .toBeCloseTo(before.width + 80, 0);
  expect((await phone.boundingBox())!.width).toBeCloseTo(phoneWidth, 0);
  await expect(name).not.toHaveAttribute("aria-sort");
  await handle.focus();
  await handle.press("ArrowLeft");
  await expect
    .poll(async () => (await name.boundingBox())!.width)
    .toBeCloseTo(before.width + 70, 0);

  const profile = grid(page, "取引先の基本情報");
  const profileHandle = profile.getByRole("separator").first();
  await profileHandle.focus();
  await profileHandle.press("ArrowRight");
  await expect(profileHandle).toHaveAttribute("aria-valuenow", "88");

  await page
    .locator(".detail-tabs")
    .getByRole("button", { name: /^契約（/ })
    .click();
  const projects = grid(page, "契約一覧");
  const headers = await projects.getByRole("columnheader").allTextContents();
  const start = headers.indexOf("契約名");
  expect(headers.slice(start)).toEqual([
    "契約名",
    "参画エンジニア",
    "単価",
    "開始日",
    "概要",
  ]);
  const date = projects.getByRole("columnheader", {
    name: "開始日",
    exact: true,
  });
  await expect(date).toHaveAttribute("aria-sort", "descending");
  const projectHandle = projects.getByRole("separator", {
    name: "契約名列の幅",
  });
  await projectHandle.focus();
  await projectHandle.press("ArrowRight");
  await expect(projectHandle).toHaveAttribute("aria-valuenow", "200");
  await expect(date).toHaveAttribute("aria-sort", "descending");
});
test("activities link multiple engineers and persist additions and removals", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "活動を追加", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(page.locator(".mock-activity-tabs button")).toHaveText([
    "すべて",
    "商談",
    "面談",
    "その他",
  ]);
  await expect(
    dialog
      .getByRole("combobox", { name: "活動種別 *", exact: true })
      .getByRole("option"),
  ).toHaveText(["選択してください", "商談", "面談", "その他"]);

  await expect(
    page
      .locator(".mock-activity-tabs")
      .getByRole("button", { name: "契約", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("option", { name: "契約", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByLabel("タイトル", { exact: false })
    .fill("エンジニアの状況確認");
  await dialog
    .getByRole("combobox", { name: "関連エンジニアを検索" })
    .fill("山田");
  await dialog
    .getByRole("listbox", { name: "関連エンジニアの検索結果", exact: true })
    .getByRole("option", { name: "山田 太郎", exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "関連エンジニアを検索" })
    .fill("高橋");
  await dialog
    .getByRole("listbox", { name: "関連エンジニアの検索結果", exact: true })
    .getByRole("option", { name: "高橋 美咲", exact: true })
    .click();
  await dialog.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const linked = () =>
    grid(page, "活動一覧").getByRole("button", {
      name: "エンジニアの状況確認のエンジニアを選択",
      exact: true,
    });
  await expect(linked()).toHaveText("山田 太郎、高橋 美咲");
  await page.reload();
  await expect(linked()).toHaveText("山田 太郎、高橋 美咲");
  await linked().click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("list", { name: "選択中の関連エンジニア" }),
  ).toContainText("山田 太郎");
  await dialog
    .getByRole("button", { name: "山田 太郎を解除", exact: true })
    .click();
  await dialog.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(linked()).toHaveText("高橋 美咲");
  // Saving another activity field must retain its engineer associations.
  await editCell(
    page,
    "活動一覧",
    "タイトル エンジニアの状況確認",
    "エンジニアの状況確認（更新）",
  );
  const updated = () =>
    grid(page, "活動一覧").getByRole("button", {
      name: "エンジニアの状況確認（更新）のエンジニアを選択",
      exact: true,
    });
  await expect(updated()).toHaveText("高橋 美咲");
  await updated().click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "高橋 美咲を解除", exact: true })
    .click();
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(updated()).toHaveText("高橋 美咲");
  await updated().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "高橋 美咲を解除", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "保存する", exact: true })
    .click();
  await expect(updated()).toHaveText("未設定");
  await page.reload();
  await expect(updated()).toHaveText("未設定");
  await updated().click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "変更履歴を表示", exact: true })
    .click();
  await dialog.locator("details").last().locator("summary").click();
  await expect(dialog.locator("details").last()).toContainText(
    "関連エンジニア: 山田 太郎、高橋 美咲",
  );
});
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
    "稼働エンジニア数",
    "進捗状況",
    "最終活動日",
    "更新日",
    "営業",
  ])
    await expect(
      grid(page, "取引先一覧").getByRole("columnheader", { name, exact: true }),
    ).toBeVisible();
  await expect(grid(page, "取引先の基本情報")).toBeVisible();
  for (const name of ["ふりがな", "従業員数", "設立年月", "売上規模"])
    await expect(
      grid(page, "取引先の基本情報").getByText(name, { exact: true }),
    ).toBeVisible();
  await expect(grid(page, "担当者一覧")).toHaveCount(0);
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
  await page
    .locator(".detail-tabs")
    .getByRole("button", { name: "担当者", exact: true })
    .click();
  await editCell(page, "担当者一覧", "電話番号 鈴木 一郎", "080-9999-1111");
  await editCell(
    page,
    "活動一覧",
    "タイトル 山田さんの参画面談",
    "面談の直接編集",
  );
  await editCell(
    page,
    "活動一覧",
    "活動種別 面談の直接編集",
    "00000000-0000-4000-8000-000000000014",
    "combobox",
  );
  await page.reload();
  await page
    .locator(".detail-tabs")
    .getByRole("button", { name: "担当者", exact: true })
    .click();
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
  ).toHaveText("商談");
  await grid(page, "活動一覧")
    .getByRole("button", { name: "面談の直接編集を編集", exact: true })
    .click();
  await page
    .getByRole("button", { name: "変更履歴を表示", exact: true })
    .click();
  await expect(page.getByText(/版 3 · update/)).toBeVisible();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
});
test("project engineers display joined tables and directly edit period amounts", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator(".detail-tabs")
    .getByRole("button", { name: "参画エンジニア", exact: true })
    .click();
  await expect(grid(page, "参画エンジニア一覧")).toBeVisible();
  await editCell(
    page,
    "参画エンジニア一覧",
    "請求単価 山田 太郎",
    "810000",
    "spinbutton",
  );
  await expect(
    grid(page, "参画エンジニア一覧").getByRole("gridcell", {
      name: "請求単価 山田 太郎",
      exact: true,
    }),
  ).toHaveText("¥810,000");
  await grid(page, "参画エンジニア一覧")
    .getByRole("button", { name: "更新", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel(/^請求単価/)
    .fill("820000");
  await page.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    grid(page, "参画エンジニア一覧").getByRole("gridcell", {
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
    .getByRole("button", { name: "参画エンジニア", exact: true })
    .click();
  const target = grid(page, "参画エンジニア一覧").getByRole("gridcell", {
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
test("engineer master is visible in top navigation and supplies activity choices", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "メインメニュー" });
  await expect(
    nav.getByRole("button", { name: /参画エンジニア|契約エンジニア/ }),
  ).toHaveCount(0);
  await nav.getByRole("button", { name: "エンジニア", exact: true }).click();
  await expect(
    grid(page, "エンジニア一覧").getByRole("gridcell", {
      name: "氏名 高橋 美咲",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "新規登録", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^氏名/).fill("追加したエンジニア");
  await dialog.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(
    grid(page, "エンジニア一覧").getByRole("gridcell", {
      name: "氏名 追加したエンジニア",
      exact: true,
    }),
  ).toHaveText("追加したエンジニア");
  await nav.getByRole("button", { name: "活動", exact: true }).click();
  await page.getByRole("button", { name: "新規登録", exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "関連エンジニアを検索" })
    .fill("追加した");
  await expect(
    dialog.getByRole("option", { name: "追加したエンジニア", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
});

test("projects copy one engineer and latest conditions into an editable independent contract", async ({
  page,
}) => {
  await page.goto("/");
  const openProjects = () =>
    page
      .locator(".detail-tabs")
      .getByRole("button", { name: /^契約（/ })
      .click();
  const openMembers = () =>
    page
      .locator(".detail-tabs")
      .getByRole("button", { name: "参画エンジニア", exact: true })
      .click();
  await openProjects();
  await expect(grid(page, "参画エンジニア一覧")).toHaveCount(0);
  await expect(grid(page, "商談一覧")).toHaveCount(0);
  await grid(page, "契約一覧")
    .getByRole("button", { name: "基幹システム刷新を複製", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "契約を複製", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByLabel(/^契約名/)).toHaveValue(
    "基幹システム刷新（コピー）",
  );
  await expect(dialog.getByLabel(/^請求単価/)).toHaveValue("800000");
  await expect(
    dialog.getByRole("checkbox", { name: "高橋 美咲", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByLabel("参画エンジニア", { exact: true })
    .selectOption({ label: "高橋 美咲" });
  await dialog.getByLabel(/^契約名/).fill("高橋さんの契約");
  await dialog.getByLabel(/^請求単価/).fill("900000");
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(
    grid(page, "契約一覧").getByRole("button", {
      name: "高橋さんの契約のエンジニアを選択",
      exact: true,
    }),
  ).toHaveCount(0);
  await grid(page, "契約一覧")
    .getByRole("button", { name: "基幹システム刷新を複製", exact: true })
    .click();
  await dialog
    .getByLabel("参画エンジニア", { exact: true })
    .selectOption({ label: "高橋 美咲" });
  await dialog.getByLabel(/^契約名/).fill("高橋さんの契約");
  await dialog.getByLabel(/^請求単価/).fill("900000");
  await dialog.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    grid(page, "契約一覧").getByRole("button", {
      name: "高橋さんの契約のエンジニアを選択",
      exact: true,
    }),
  ).toHaveText("高橋 美咲");
  await expect(
    grid(page, "契約一覧").getByRole("button", {
      name: "基幹システム刷新のエンジニアを選択",
      exact: true,
    }),
  ).toHaveText("山田 太郎");
  await openMembers();
  await expect(grid(page, "契約一覧")).toHaveCount(0);
  await expect(
    grid(page, "参画エンジニア一覧").getByRole("gridcell", {
      name: "請求単価 高橋 美咲",
      exact: true,
    }),
  ).toHaveText("¥900,000");
  await expect(
    grid(page, "参画エンジニア一覧").getByRole("gridcell", {
      name: "請求単価 山田 太郎",
      exact: true,
    }),
  ).toHaveText("¥800,000");
  await page.reload();
  await openMembers();
  await expect(
    grid(page, "参画エンジニア一覧").getByRole("gridcell", {
      name: "請求単価 高橋 美咲",
      exact: true,
    }),
  ).toHaveText("¥900,000");
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
      name: "次期開発体制の提案書を送付を編集",
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

test("lower panels resize with the divider and activity rows open editing", async ({
  page,
}) => {
  await page.goto("/");
  const divider = page.getByRole("separator", { name: "取引先詳細と活動の幅" });
  await expect(divider).toBeVisible();
  await expect(grid(page, "取引先一覧").locator(".sheet-actions")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "一覧のメニュー" }),
  ).toHaveCount(0);
  const left = page.locator(".customer-detail");
  const right = page.locator(".activity-panel");
  const initialLeft = (await left.boundingBox())!;
  const initialRight = (await right.boundingBox())!;
  const box = (await divider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 130, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  expect((await left.boundingBox())!.width).toBeGreaterThan(
    initialLeft.width + 100,
  );
  expect((await right.boundingBox())!.width).toBeLessThan(
    initialRight.width - 100,
  );
  await divider.focus();
  await divider.press("Home");
  await expect(divider).toHaveAttribute("aria-valuenow", "25");
  await divider.press("ArrowLeft");
  await expect(divider).toHaveAttribute("aria-valuenow", "25");
  await divider.press("End");
  await expect(divider).toHaveAttribute("aria-valuenow", "75");
  await divider.press("ArrowRight");
  await expect(divider).toHaveAttribute("aria-valuenow", "75");
  await divider.press("ArrowLeft");
  await expect(divider).toHaveAttribute("aria-valuenow", "70");
  await expect(
    right.getByRole("button", { name: "活動を編集", exact: true }),
  ).toHaveCount(0);
  await grid(page, "活動一覧")
    .getByRole("button", { name: /を編集$/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(divider).toBeHidden();
  const mobileLeft = (await left.boundingBox())!;
  const mobileRight = (await right.boundingBox())!;
  expect(mobileRight.y).toBeGreaterThanOrEqual(
    mobileLeft.y + mobileLeft.height,
  );
});

test("participation links the contract and navigation distinguishes contacts from sales", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "メインメニュー" });
  for (const name of ["担当者", "商談"])
    await expect(nav.getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(
    grid(page, "取引先一覧").getByRole("columnheader", {
      name: "営業",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .locator(".detail-tabs")
    .getByRole("button", { name: "担当者", exact: true })
    .click();
  await expect(
    grid(page, "担当者一覧").getByRole("gridcell", {
      name: "氏名 鈴木 一郎",
      exact: true,
    }),
  ).toHaveText("鈴木 一郎");
  await page
    .locator(".detail-tabs")
    .getByRole("button", { name: "参画エンジニア", exact: true })
    .click();
  const cell = grid(page, "参画エンジニア一覧").getByRole("gridcell", {
    name: "契約名 山田 太郎",
    exact: true,
  });
  await expect(cell).toHaveAttribute("aria-readonly", "true");
  await cell.dblclick({ position: { x: 2, y: 2 } });
  await expect(cell.getByRole("textbox")).toHaveCount(0);
  await cell
    .getByRole("button", { name: "基幹システム刷新の契約を開く", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(
      "1契約につき1人を選択します。全員の登録・編集は上部の「エンジニア」から行えます。",
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("combobox", { name: "営業", exact: true }),
  ).toBeVisible();
  await dialog.getByLabel(/^契約名/).fill("参照先で変更した契約");
  await dialog.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(cell).toHaveText("参照先で変更した契約");
  await page
    .locator(".detail-tabs")
    .getByRole("button", { name: /^契約（/ })
    .click();
  await expect(
    grid(page, "契約一覧").getByRole("gridcell", {
      name: "契約名 参照先で変更した契約",
      exact: true,
    }),
  ).toHaveText("参照先で変更した契約");
});

test("related engineers search a large directory with bounded results and keyboard selection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(grid(page, "取引先一覧")).toBeVisible();
  await page.evaluate(() => {
    const key = "nexus-crm-demo-v6";
    const w = JSON.parse(localStorage.getItem(key)!);
    for (let i = 0; i < 1000; i++)
      w.engineers.push({
        ...w.engineers[0],
        id: crypto.randomUUID(),
        name: `検索対象 ${String(i).padStart(4, "0")}`,
      });
    w.engineers.push({
      ...w.engineers[0],
      id: crypto.randomUUID(),
      name: "保管したエンジニア",
      archived_at: new Date().toISOString(),
    });
    localStorage.setItem(key, JSON.stringify(w));
  });
  await page.reload();
  await page.getByRole("button", { name: "活動を追加", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^タイトル/).fill("検索で選択した活動");
  const search = dialog.getByRole("combobox", {
    name: "関連エンジニアを検索",
    exact: true,
  });
  await search.focus();
  const results = dialog.getByRole("listbox", {
    name: "関連エンジニアの検索結果",
    exact: true,
  });
  await expect(results.getByRole("option")).toHaveCount(0);
  await search.fill("検索対象");
  await expect(results.getByRole("option")).toHaveCount(20);
  await expect(dialog.getByRole("status")).toContainText("1000件該当");
  await search.fill("検索対象0999");
  await expect(results.getByRole("option")).toHaveText(["検索対象 0999追加"]);
  await search.press("Enter");
  await expect(
    dialog.getByRole("list", { name: "選択中の関連エンジニア" }),
  ).toContainText("検索対象 0999");
  await expect(search).toHaveValue("");
  await search.fill("検索対象0999");
  await expect(results.getByRole("option")).toHaveCount(0);
  await search.fill("保管した");
  await expect(results.getByRole("option")).toHaveCount(0);
  await search.fill("見つからない名前");
  await search.press("Enter");
  await expect(dialog).toBeVisible();
  await search.press("Escape");
  await expect(results).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await search.fill("検索対象");
  for (let i = 0; i < 19; i++) await search.press("ArrowDown");
  await expect(results.getByRole("option").last()).toBeInViewport();
  await search.press("Enter");
  await expect(
    dialog.getByRole("list", { name: "選択中の関連エンジニア" }),
  ).toContainText("検索対象 0019");
  await dialog.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    grid(page, "活動一覧").getByRole("button", {
      name: "検索で選択した活動のエンジニアを選択",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await grid(page, "活動一覧")
    .getByRole("button", {
      name: "検索で選択した活動のエンジニアを選択",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole("list", { name: "選択中の関連エンジニア" }),
  ).toContainText("検索対象 0999");
  await expect(
    dialog.getByRole("list", { name: "選択中の関連エンジニア" }),
  ).toContainText("検索対象 0019");
});

test("activity Markdown templates, dialog preview and related activities persist independently", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "活動を追加", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^タイトル/).fill("Markdown活動");
  await expect(
    dialog.getByRole("combobox", { name: "関連商談", exact: true }),
  ).toHaveCount(0);
  const related = dialog.getByRole("listbox", {
    name: "関連活動",
    exact: true,
  });
  const choices = await related.locator("option").evaluateAll((options) =>
    options.slice(0, 2).map((o) => ({
      value: (o as HTMLOptionElement).value,
      name: o.textContent!,
    })),
  );
  expect(choices).toHaveLength(2);
  expect(choices.map((x) => x.name)).toContain("追加要員のご相談");
  await related.selectOption(choices.map((x) => x.value));
  await dialog
    .getByLabel("テンプレート", { exact: true })
    .selectOption({ label: "面談" });
  await dialog.getByRole("button", { name: "挿入する", exact: true }).click();
  const source = dialog.getByLabel("内容（Markdown）", { exact: true });
  await expect(source).toHaveValue(/## 面談内容/);
  const body =
    "## 面談結果\n\n**合意**しました。\n\n- [ ] 条件を送付\n\n| 項目 | 結果 |\n| --- | --- |\n| 評価 | 良好 |\n\n[危険なリンク](javascript:alert(1))\n\n<script>alert(1)</script>";
  await source.fill(body);
  await dialog.getByRole("button", { name: "プレビュー", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "面談結果", exact: true }),
  ).toBeVisible();
  await expect(dialog.locator(".markdown-content table")).toContainText("良好");
  await expect(
    dialog.locator('.markdown-content a[href^="javascript:"]'),
  ).toHaveCount(0);
  await expect(dialog.locator(".markdown-content script")).toHaveCount(0);
  await dialog.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const activities = grid(page, "活動一覧");
  await expect(
    activities.getByRole("columnheader", { name: "関連活動", exact: true }),
  ).toBeVisible();
  await expect(
    activities.getByRole("columnheader", { name: "関連契約", exact: true }),
  ).toHaveCount(1);
  await expect(
    activities.getByRole("columnheader", { name: "関連商談", exact: true }),
  ).toHaveCount(0);
  const relationButton = () =>
    activities.getByRole("button", {
      name: "Markdown活動の関連活動を選択",
      exact: true,
    });
  await expect(relationButton()).toHaveText(
    choices.map((x) => x.name).join("、"),
  );
  await activities
    .getByRole("button", { name: "Markdown活動の内容を表示", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "面談結果", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "編集", exact: true }).click();
  await dialog
    .getByLabel("テンプレート", { exact: true })
    .selectOption({ label: "商談" });
  await dialog.getByRole("button", { name: "末尾に追加", exact: true }).click();
  await expect(
    dialog.getByLabel("内容（Markdown）", { exact: true }),
  ).toHaveValue(
    `${body}\n\n## 相談・提案内容\n\n\n## 確認事項\n\n- \n\n## 決定事項\n\n\n## 次のアクション\n\n- [ ] `,
  );
  await dialog.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(relationButton()).toHaveText(
    choices.map((x) => x.name).join("、"),
  );
  await relationButton().click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("listbox", { name: "関連活動", exact: true }),
  ).toHaveValues(choices.map((x) => x.value));
  await dialog
    .getByRole("listbox", { name: "関連活動", exact: true })
    .selectOption([]);
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(relationButton()).toHaveText(
    choices.map((x) => x.name).join("、"),
  );
  await relationButton().click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("listbox", { name: "関連活動", exact: true })
    .selectOption([]);
  await dialog.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(relationButton()).toHaveText("未設定");
});

test("settings manage reusable activity templates and preserve previously inserted content", async ({
  page,
}) => {
  await page.goto("/");
  const openSettings = async () => {
    await page.getByRole("button", { name: "設定", exact: true }).click();
    const menu = page.getByRole("menu", { name: "設定メニュー", exact: true });
    await expect(menu).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await menu
      .getByRole("menuitem", { name: "活動テンプレート", exact: true })
      .click();
    await expect(menu).toHaveCount(0);
    return page.getByRole("dialog", {
      name: "設定：活動テンプレート",
      exact: true,
    });
  };
  const trigger = page.getByRole("button", { name: "設定", exact: true });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await page.getByRole("heading", { name: "取引先", exact: true }).click();
  await expect(page.getByRole("menu", { name: "設定メニュー" })).toHaveCount(0);
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "活動テンプレート", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  let settings = await openSettings();
  await settings
    .getByRole("button", { name: "テンプレートを追加", exact: true })
    .click();
  await settings.getByLabel(/^テンプレート名/).fill("定例会議事録");
  await settings
    .getByLabel("内容（Markdown）", { exact: true })
    .fill("## 定例会\n\n- [ ] 議題を確認");
  await settings
    .getByRole("button", { name: "プレビュー", exact: true })
    .click();
  await expect(
    settings.getByRole("heading", { name: "定例会", exact: true }),
  ).toBeVisible();
  await settings.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(
    settings.getByRole("button", { name: "定例会議事録", exact: true }),
  ).toBeVisible();
  await settings
    .getByRole("button", { name: "閉じる", exact: true })
    .last()
    .click();
  await page.reload();
  await page.getByRole("button", { name: "活動を追加", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^タイトル/).fill("テンプレートで入力した活動");
  await dialog
    .getByLabel("テンプレート", { exact: true })
    .selectOption({ label: "定例会議事録" });
  await dialog.getByRole("button", { name: "挿入する", exact: true }).click();
  await expect(
    dialog.getByLabel("内容（Markdown）", { exact: true }),
  ).toHaveValue("## 定例会\n\n- [ ] 議題を確認");
  await dialog.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  settings = await openSettings();
  await settings
    .getByRole("button", { name: "定例会議事録", exact: true })
    .click();
  await settings.getByLabel(/^テンプレート名/).fill("定例会（改訂版）");
  await settings
    .getByLabel("内容（Markdown）", { exact: true })
    .fill("## 次回の議題");
  await settings.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(
    settings.getByRole("button", { name: "定例会（改訂版）", exact: true }),
  ).toBeVisible();
  await settings
    .getByRole("button", { name: "閉じる", exact: true })
    .last()
    .click();
  await grid(page, "活動一覧")
    .getByRole("button", {
      name: "テンプレートで入力した活動の内容を表示",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "定例会", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "次回の議題", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "閉じる", exact: true })
    .last()
    .click();
  settings = await openSettings();
  await settings
    .getByRole("button", { name: "定例会（改訂版）を削除", exact: true })
    .click();
  await expect(
    settings.getByRole("button", { name: "定例会（改訂版）", exact: true }),
  ).toHaveCount(0);
  await settings
    .getByRole("button", { name: "閉じる", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "活動を追加", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog
      .getByLabel("テンプレート", { exact: true })
      .getByRole("option", { name: "定例会（改訂版）", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  settings = await openSettings();
  await settings.getByLabel("削除済みを表示", { exact: true }).check();
  await settings
    .getByRole("button", { name: "定例会（改訂版）を復元", exact: true })
    .click();
  await expect(
    settings.getByRole("button", { name: "定例会（改訂版）", exact: true }),
  ).toBeVisible();
  await settings
    .getByRole("button", { name: "閉じる", exact: true })
    .last()
    .click();
  await page.reload();
  await page.getByRole("button", { name: "活動を追加", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("テンプレート", { exact: true })
    .selectOption({ label: "定例会（改訂版）" });
  await dialog.getByRole("button", { name: "挿入する", exact: true }).click();
  await expect(
    dialog.getByLabel("内容（Markdown）", { exact: true }),
  ).toHaveValue("## 次回の議題");
});
