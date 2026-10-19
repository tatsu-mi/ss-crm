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
import { newRow, display } from "../src/lib/forms";
const save = (w: Workspace, table: Table, row: Base) =>
  applyCommand(
    w,
    { kind: "save", table, row, expected_version: row.version },
    w.users[0].id,
  );
test("standard rows and participants use direct foreign keys", () => {
  const w = demoWorkspace();
  validateWorkspace(w);
  assert.equal(w.contracts[0].deal_id, w.deals[0].id);
  assert.equal(w.contract_periods[0].contract_id, w.contracts[0].id);
  assert.equal(w.activity_contacts[0].contact_id, w.customer_contacts[0].id);
  assert.equal(w.activity_engineers[0].engineer_id, w.engineers[0].id);
  assert.ok(!("records" in w));
  assert.ok(!("skills" in w.engineers[0]));
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
    contract_id: p.contract_id,
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
    () => save(w, "deals", { ...w.deals[0], customer_id: w.customers[1].id }),
    /別の顧客/,
  );
  assert.throws(
    () =>
      save(w, "projects", { ...w.projects[0], customer_id: w.customers[1].id }),
    /別の顧客/,
  );
  assert.throws(
    () =>
      save(w, "customer_engineer_relations", {
        ...w.customer_engineer_relations[0],
        customer_id: w.customers[1].id,
      }),
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
  assert.throws(
    () => save(w, "deals", { ...w.deals[0], stage: "lost" }),
    /受注商談/,
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
    () => save(w, "deals", { ...w.deals[0], probability: "101" }),
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
  const c = w.contracts[0];
  w = save(w, "contracts", { ...c, sales_user_id: w.users[1].id });
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
  const c = w.contracts[0],
    oldName = w.projects[0].name;
  w = save(w, "projects", { ...w.projects[0], name: "変更後の案件名" });
  assert.equal(
    w.revisions.find(
      (r) => r.entity_table === "contracts" && r.entity_id === c.id,
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
    newRow("projects", { customer_id: w.customers[0].id, name: "別案件" }),
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
      { key: "budget", label: "希望単価", type: "money" },
      "9999999999999999.99",
    ),
    "¥9,999,999,999,999,999.99",
  );
});

test("joined contract form is atomic and mock customer fields persist", () => {
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
  const contract = newRow("contracts", {
    relation_id: relation.id,
    name: "新規契約",
  });
  const period = newRow("contract_periods", {
    contract_id: contract.id,
    starts_on: "2027-04-01",
    ends_on: "2027-03-31",
    billing_rate: "800000",
    cost: "600000",
    renewal_status: "pending",
  });
  const commands: Command[] = [
    {
      kind: "save",
      table: "customer_engineer_relations",
      row: relation,
      expected_version: 0,
    },
    { kind: "save", table: "contracts", row: contract, expected_version: 0 },
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
    w.contracts.some((c) => c.id === contract.id),
    false,
  );
  period.ends_on = "2027-06-30";
  const saved = applyCommand(w, { kind: "batch", commands }, actor);
  assert.ok(saved.contracts.some((c) => c.id === contract.id));
  assert.ok(saved.contract_periods.some((p) => p.contract_id === contract.id));
});
