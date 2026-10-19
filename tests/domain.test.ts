import {
  projectCopyDefaults,
  projectCopyCommand,
} from "../src/lib/project-copy";
import assert from "node:assert/strict";
import { test } from "node:test";
import { demoWorkspace } from "../src/lib/demo";
import {
  applyCommand,
  runReminders,
  validateWorkspace,
} from "../src/lib/domain";
import {
  Base,
  Command,
  Table,
  Workspace,
  addDays,
  newId,
  today,
} from "../src/lib/model";
import { forms, newRow, display } from "../src/lib/forms";
const save = (w: Workspace, table: Table, row: Base) =>
  applyCommand(
    w,
    { kind: "save", table, row, expected_version: row.version },
    w.users[0].id,
  );
test("standard rows and participants use direct foreign keys", () => {
  const w = demoWorkspace();
  validateWorkspace(w);
  assert.equal(w.project_engineers[0].project_id, w.projects[0].id);
  assert.equal(w.project_engineers[0].engineer_id, w.engineers[0].id);
  assert.equal(
    w.contract_periods[0].project_engineer_id,
    w.project_engineers[0].id,
  );
  assert.equal(w.activity_contacts[0].contact_id, w.customer_contacts[0].id);
  assert.equal(w.activity_engineers[0].engineer_id, w.engineers[0].id);
  assert.ok(!("records" in w));
  assert.ok(!("skills" in w.engineers[0]));
});
test("tasks link negotiation activities and reject removed deal fields and mismatched contracts", () => {
  let w = demoWorkspace();
  const activity = w.activities.find(
    (a) =>
      a.activity_kind_id ===
      w.activity_kinds.find((k) => k.name === "商談")!.id,
  )!;
  w = save(w, "activities", { ...activity, project_id: w.projects[0].id });
  const task = newRow("tasks", {
    customer_id: activity.customer_id,
    title: "商談の次回対応",
    activity_id: activity.id,
    contract_period_id: w.contract_periods[0].id,
  });
  assert.ok(!("deal_id" in task));
  assert.throws(
    () => save(w, "tasks", { ...task, deal_id: newId() }),
    /未定義/,
  );
  w = save(w, "tasks", task);
  assert.equal(w.tasks.find((t) => t.id === task.id)?.activity_id, activity.id);
  const project = newRow("projects", {
    customer_id: activity.customer_id,
    name: "別の契約",
  });
  w = save(w, "projects", project);
  assert.throws(
    () =>
      save(w, "activities", {
        ...w.activities.find((a) => a.id === activity.id)!,
        project_id: project.id,
      }),
    /タスクの契約・契約期間・活動/,
  );
});
test("customer edits, versions, history and lifecycle", () => {
  let w = demoWorkspace();
  const c = w.customers[0];
  w = save(w, "customers", { ...c, phone: "03-0000-0000" });
  assert.equal(w.customers[0].phone, "03-0000-0000");
  assert.throws(() => save(w, "customers", c), /他の利用者/);
  assert.equal(w.revisions.at(-1)?.snapshot.row.phone, "03-0000-0000");
  const current = w.customers[0];
  w = applyCommand(
    w,
    {
      kind: "lifecycle",
      table: "customers",
      id: c.id,
      expected_version: current.version,
      restore: false,
    },
    w.users[0].id,
  );
  assert.ok(w.customers[0].archived_at);
  w = applyCommand(
    w,
    {
      kind: "lifecycle",
      table: "customers",
      id: c.id,
      expected_version: w.customers[0].version,
      restore: true,
    },
    w.users[0].id,
  );
  assert.equal(w.customers[0].archived_at, null);
});
test("contract renewal preserves conditions and rejects overlap including restoration", () => {
  let w = demoWorkspace();
  const p = w.contract_periods[0];
  assert.throws(
    () => save(w, "contract_periods", { ...p, id: newId(), version: 0 }),
    /重複/,
  );
  const row = newRow("contract_periods", {
    project_engineer_id: p.project_engineer_id,
    starts_on: addDays(p.ends_on, 1),
    ends_on: addDays(p.ends_on, 90),
    billing_rate: "820000",
    cost: "610000",
    renewal_status: "pending",
  });
  w = save(w, "contract_periods", row);
  assert.equal(w.contract_periods[0].billing_rate, "800000");
  assert.equal(w.contract_periods[1].billing_rate, "820000");
  w = applyCommand(
    w,
    {
      kind: "lifecycle",
      table: "contract_periods",
      id: p.id,
      expected_version: p.version,
      restore: false,
    },
    w.users[0].id,
  );
  w = save(w, "contract_periods", { ...p, id: newId(), version: 0 });
  assert.throws(
    () =>
      applyCommand(
        w,
        {
          kind: "lifecycle",
          table: "contract_periods",
          id: p.id,
          expected_version: p.version + 1,
          restore: true,
        },
        w.users[0].id,
      ),
    /重複/,
  );
});
test("cross-customer links and parent edits cannot invalidate existing relations", () => {
  const w = demoWorkspace();
  assert.throws(
    () =>
      save(w, "projects", { ...w.projects[0], customer_id: w.customers[1].id }),
    /別の顧客/,
  );
  assert.throws(
    () =>
      save(w, "customer_contacts", {
        ...w.customer_contacts[0],
        customer_id: w.customers[1].id,
      }),
    /参加者/,
  );
});
test("activity supports several participants with atomic history", () => {
  let w = demoWorkspace();
  const a = w.activities[0];
  w = applyCommand(
    w,
    {
      kind: "save",
      table: "activities",
      row: a,
      expected_version: a.version,
      contact_ids: [],
      engineer_ids: w.engineers.map((e) => e.id),
    },
    w.users[0].id,
  );
  assert.equal(
    w.activity_contacts.filter((x) => x.activity_id === a.id).length,
    0,
  );
  assert.equal(
    w.activity_engineers.filter((x) => x.activity_id === a.id).length,
    2,
  );
  assert.equal(w.revisions.at(-1)?.snapshot.engineer_ids?.length, 2);
  assert.throws(
    () =>
      applyCommand(
        w,
        {
          kind: "save",
          table: "activities",
          row: w.activities[0],
          expected_version: w.activities[0].version,
          engineer_ids: [w.engineers[0].id, w.engineers[0].id],
        },
        w.users[0].id,
      ),
    /重複/,
  );
});
test("unknown input, invalid dates, numeric limits and missing members rejected", () => {
  const w = demoWorkspace();
  assert.throws(
    () => save(w, "engineers", { ...w.engineers[0], skills: "Java" }),
    /未定義/,
  );
  assert.throws(
    () =>
      save(w, "contract_periods", {
        ...w.contract_periods[0],
        starts_on: "2026-02-30",
      }),
    /日付/,
  );
  assert.throws(
    () => save(w, "contract_periods", { ...w.contract_periods[0], cost: "-1" }),
    /数値/,
  );
  assert.throws(
    () =>
      applyCommand(
        w,
        {
          kind: "save",
          table: "customers",
          row: w.customers[0],
          expected_version: 1,
        },
        newId(),
      ),
    /利用登録/,
  );
});
test("reminders are stable, follow assignment and stop on completion", () => {
  let w = demoWorkspace();
  const ids = w.notifications.map((n) => n.id);
  w = runReminders(w);
  assert.deepEqual(
    w.notifications.map((n) => n.id),
    ids,
  );
  assert.equal(w.tasks.filter((t) => t.automation_key).length, 1);
  const c = w.projects[0];
  w = save(w, "projects", { ...c, sales_user_id: w.users[1].id });
  w = runReminders(w);
  assert.equal(
    w.tasks.find((t) => t.automation_key)?.assignee_user_id,
    w.users[1].id,
  );
  assert.ok(
    w.notifications.some(
      (n) => n.contract_period_id && n.recipient_user_id === w.users[1].id,
    ),
  );
  const t = w.tasks.find((t) => !t.automation_key)!;
  w = save(w, "tasks", { ...t, status: "completed" });
  const count = w.notifications.filter((n) => n.task_id === t.id).length;
  w = runReminders(w);
  assert.equal(w.notifications.filter((n) => n.task_id === t.id).length, count);
  const p = w.contract_periods[0];
  w = save(w, "contract_periods", { ...p, renewal_status: "renew" });
  w = runReminders(w);
  assert.equal(w.tasks.find((t) => t.automation_key)?.status, "cancelled");
});
test("private notifications can only be marked by their recipient", () => {
  const w = demoWorkspace();
  const n = w.notifications.find((n) => n.recipient_user_id === w.users[0].id)!;
  assert.throws(
    () =>
      applyCommand(w, { kind: "read_notification", id: n.id }, w.users[1].id),
    /見つかりません/,
  );
  assert.ok(
    applyCommand(
      w,
      { kind: "read_notification", id: n.id },
      w.users[0].id,
    ).notifications.find((x) => x.id === n.id)?.read_at,
  );
  assert.ok(today());
});

test("reference labels in history survive later renaming", () => {
  let w = demoWorkspace();
  const c = w.project_engineers[0],
    oldName = w.projects[0].name;
  w = save(w, "projects", { ...w.projects[0], name: "変更後の契約名" });
  assert.equal(
    w.revisions.find(
      (r) => r.entity_table === "project_engineers" && r.entity_id === c.id,
    )?.snapshot.reference_labels?.project_id,
    oldName,
  );
});
test("money rejects silent rounding and unrelated same-customer links are rejected", () => {
  let w = demoWorkspace();
  assert.throws(
    () =>
      save(w, "contract_periods", {
        ...w.contract_periods[0],
        billing_rate: "800000.001",
      }),
    /数値/,
  );
  w = save(
    w,
    "projects",
    newRow("projects", { customer_id: w.customers[0].id, name: "別契約" }),
  );
  assert.throws(
    () =>
      save(w, "activities", {
        ...w.activities[0],
        project_id: w.projects[1].id,
      }),
    /一致/,
  );
});
test("moving a renewal outside the current window updates the existing automatic task", () => {
  let w = demoWorkspace();
  const p = w.contract_periods[0];
  w = save(w, "contract_periods", { ...p, ends_on: addDays(today(), 60) });
  w = runReminders(w);
  assert.ok(
    w.tasks
      .find((t) => t.automation_key)
      ?.due_at?.startsWith(addDays(today(), 60)),
  );
  assert.equal(w.tasks.filter((t) => t.automation_key).length, 1);
});

test("large decimal amounts display without binary rounding", () => {
  assert.equal(
    display(
      demoWorkspace(),
      { key: "budget", label: "単価", type: "money" },
      "9999999999999999.99",
    ),
    "¥9,999,999,999,999,999.99",
  );
});

test("project assignment and period batch is atomic and customer fields persist", () => {
  const w = demoWorkspace(),
    actor = w.users[0].id;
  const customer = {
    ...w.customers[0],
    name_kana: "ぶるーぷりんと",
    employee_size: "500〜1,000名",
    established_on: "2010-04-01",
    revenue_scale: "100億〜500億円",
    trade_status: "proposing",
  };
  const next = save(w, "customers", customer);
  assert.equal(next.customers[0].revenue_scale, "100億〜500億円");
  const relation = newRow("customer_engineer_relations", {
    customer_id: w.customers[0].id,
    engineer_id: w.engineers[0].id,
    label: "新規参画",
  });
  const batchProject = newRow("projects", {
    customer_id: w.customers[0].id,
    name: "一人一契約の一括登録",
  });
  const contract = newRow("project_engineers", {
    project_id: batchProject.id,
    engineer_id: w.engineers[1].id,
  });
  const period = newRow("contract_periods", {
    project_engineer_id: contract.id,
    starts_on: "2027-04-01",
    ends_on: "2027-03-31",
    billing_rate: "800000",
    cost: "600000",
    renewal_status: "pending",
  });
  const commands: Command[] = [
    { kind: "save", table: "projects", row: batchProject, expected_version: 0 },
    {
      kind: "save",
      table: "customer_engineer_relations",
      row: relation,
      expected_version: 0,
    },
    {
      kind: "save",
      table: "project_engineers",
      row: contract,
      expected_version: 0,
    },
    {
      kind: "save",
      table: "contract_periods",
      row: period,
      expected_version: 0,
    },
  ];
  assert.throws(
    () => applyCommand(w, { kind: "batch", commands }, actor),
    /開始日/,
  );
  assert.equal(
    w.project_engineers.some((c) => c.id === contract.id),
    false,
  );
  period.ends_on = "2027-06-30";
  const saved = applyCommand(w, { kind: "batch", commands }, actor);
  assert.ok(saved.project_engineers.some((c) => c.id === contract.id));
  assert.ok(
    saved.contract_periods.some((p) => p.project_engineer_id === contract.id),
  );
});

test("one project has one engineer, supports switching and preserves prior periods", () => {
  let w = demoWorkspace();
  const ids = w.engineers.map((e) => e.id);
  const original = w.projects[0];
  const update = (workspace: Workspace, engineer_ids: string[]) =>
    applyCommand(
      workspace,
      {
        kind: "save",
        table: "projects",
        row: workspace.projects[0],
        expected_version: workspace.projects[0].version,
        engineer_ids,
      },
      workspace.users[0].id,
    );
  assert.throws(() => update(w, ids), /1人/);
  assert.throws(() => update(w, [newId()]), /利用可能/);
  assert.equal(w.projects[0].version, original.version);
  w = update(w, [ids[1]]);
  assert.equal(w.project_engineers.filter((a) => !a.deleted_at).length, 1);
  assert.equal(
    w.project_engineers.find((a) => !a.deleted_at)?.engineer_id,
    ids[1],
  );
  assert.equal(w.contract_periods.length, 1);
  w = update(w, [ids[0]]);
  assert.equal(
    w.project_engineers.find((a) => !a.deleted_at)?.id,
    w.contract_periods[0].project_engineer_id,
  );
  assert.deepEqual(w.revisions.at(-1)?.snapshot.engineer_ids, [ids[0]]);
  assert.throws(
    () =>
      save(
        w,
        "project_engineers",
        newRow("project_engineers", {
          project_id: original.id,
          engineer_id: ids[1],
        }),
      ),
    /1人/,
  );
  assert.throws(
    () =>
      applyCommand(
        w,
        {
          kind: "save",
          table: "projects",
          row: original,
          expected_version: original.version,
          engineer_ids: [],
        },
        w.users[0].id,
      ),
    /他の利用者/,
  );
});

test("project copies keep latest conditions and save independently and atomically", () => {
  const w = demoWorkspace();
  const source = w.projects[0];
  const defaults = projectCopyDefaults(w, source.id);
  assert.equal(
    defaults.period?.billing_rate,
    w.contract_periods[0].billing_rate,
  );
  const row = newRow(
    "projects",
    Object.fromEntries(
      forms.projects.fields.map((f) => [f.key, source[f.key]]),
    ),
  );
  const command = projectCopyCommand(row, w.engineers[1].id, defaults.period);
  const saved = applyCommand(w, command, w.users[0].id);
  const assignment = saved.project_engineers.find(
    (a) => a.project_id === row.id,
  )!;
  assert.equal(assignment.engineer_id, w.engineers[1].id);
  assert.equal(
    saved.contract_periods.find((p) => p.project_engineer_id === assignment.id)
      ?.billing_rate,
    defaults.period?.billing_rate,
  );
  assert.deepEqual(saved.projects[0], source);
  assert.equal(saved.activities.length, w.activities.length);
  assert.throws(
    () =>
      applyCommand(
        w,
        projectCopyCommand(row, w.engineers[1].id, {
          ...defaults.period!,
          starts_on: "2099-01-01",
        }),
        w.users[0].id,
      ),
    /開始日/,
  );
  assert.equal(w.projects.length, 1);
});

test("activities link several activities atomically and preserve labels and Markdown", () => {
  let w = demoWorkspace();
  const a = w.activities[0];
  assert.ok(!("deal_id" in a));
  assert.throws(
    () => save(w, "activities", { ...a, deal_id: newId() }),
    /未定義/,
  );
  const targets = w.activities
    .filter((x) => x.customer_id === a.customer_id && x.id !== a.id)
    .slice(0, 2);
  assert.equal(targets.length, 2);
  const ids = targets.map((x) => x.id);
  const body =
    "## 決定事項\n\n- **提案する**\n\n| 項目 | 内容 |\n| --- | --- |\n| 期限 | 明日 |";
  w = applyCommand(
    w,
    {
      kind: "save",
      table: "activities",
      row: { ...a, body },
      expected_version: a.version,
      related_activity_ids: ids,
    },
    w.users[0].id,
  );
  assert.deepEqual(w.revisions.at(-1)!.snapshot.related_activity_ids, ids);
  assert.equal(w.revisions.at(-1)!.snapshot.row.body, body);
  const current = w.activities.find((x) => x.id === a.id)!;
  w = save(w, "activities", { ...current, title: "別項目の更新" });
  assert.equal(
    w.activity_relations.filter((x) => x.activity_id === a.id).length,
    2,
  );
  assert.equal(w.activities.find((x) => x.id === a.id)!.body, body);
  const cmd = (related_activity_ids: string[]): Command => ({
    kind: "save",
    table: "activities",
    row: w.activities.find((x) => x.id === a.id)!,
    expected_version: current.version + 1,
    related_activity_ids,
  });
  assert.throws(
    () => applyCommand(w, cmd([a.id]), w.users[0].id),
    /同じ顧客の別/,
  );
  assert.throws(
    () => applyCommand(w, cmd([ids[0], ids[0]]), w.users[0].id),
    /重複/,
  );
  const foreign = newRow("activities", {
    ...a,
    version: 0,
    id: newId(),
    customer_id: w.customers.find((c) => c.id !== a.customer_id)!.id,
    project_id: null,
  });
  w = save(w, "activities", foreign);
  assert.throws(
    () => applyCommand(w, cmd([foreign.id]), w.users[0].id),
    /同じ顧客の別/,
  );
  const oldTitle = targets[0].title;
  w = save(w, "activities", { ...targets[0], title: "関連先の名前変更" });
  assert.equal(
    w.revisions.find(
      (r) => r.entity_id === a.id && r.version === current.version,
    )!.snapshot.related_activity_labels![ids[0]],
    oldTitle,
  );
  w = applyCommand(w, cmd([]), w.users[0].id);
  assert.equal(
    w.activity_relations.filter((x) => x.activity_id === a.id).length,
    0,
  );
});

test("managed templates retain Markdown snapshots, reject stale edits and leave inserted activities unchanged", () => {
  let w = demoWorkspace();
  const actor = w.users[0].id;
  const template = newRow("activity_templates", {
    name: "議事録",
    body: "## 議題\n\n- 確認する",
  });
  w = save(w, "activity_templates", template);
  const saved = w.activity_templates.find((t) => t.id === template.id)!;
  const activity = w.activities[0];
  w = save(w, "activities", { ...activity, body: saved.body });
  w = save(w, "activity_templates", {
    ...saved,
    name: "定例会",
    body: "## 決定事項\n\n- [ ] 連絡する",
  });
  assert.equal(w.activities[0].body, saved.body);
  assert.equal(
    w.revisions.find(
      (r) =>
        r.entity_table === "activity_templates" &&
        r.entity_id === saved.id &&
        r.version === 1,
    )!.snapshot.row.body,
    saved.body,
  );
  assert.throws(() => save(w, "activity_templates", saved), /他の利用者/);
  for (const body of [null, " ", "x".repeat(20001)])
    assert.throws(
      () =>
        save(w, "activity_templates", {
          ...w.activity_templates.find((t) => t.id === saved.id)!,
          body,
        }),
      /内容/,
    );
  const changeLifecycle = (restore: boolean) => {
    const current = w.activity_templates.find((t) => t.id === saved.id)!;
    return applyCommand(
      w,
      {
        kind: "lifecycle",
        table: "activity_templates",
        id: saved.id,
        expected_version: current.version,
        restore,
      },
      actor,
    );
  };
  w = changeLifecycle(false);
  assert.ok(w.activity_templates.find((t) => t.id === saved.id)!.deleted_at);
  assert.throws(
    () =>
      save(
        w,
        "activity_templates",
        w.activity_templates.find((t) => t.id === saved.id)!,
      ),
    /復元/,
  );
  w = changeLifecycle(true);
  assert.equal(
    w.activity_templates.find((t) => t.id === saved.id)!.deleted_at,
    null,
  );
  assert.equal(w.activities[0].body, saved.body);
});
