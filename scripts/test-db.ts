import {
  projectCopyCommand,
  projectCopyDefaults,
} from "../src/lib/project-copy";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { demoWorkspace } from "../src/lib/demo";
import {
  Base,
  Command,
  Table,
  newId,
  addDays,
  tableNames,
} from "../src/lib/model";
import { newRow } from "../src/lib/forms";
async function main() {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;`,
  );
  await db.exec(
    readFileSync("supabase/migrations/202610190001_crm.sql", "utf8"),
  );
  await db.exec(readFileSync("supabase/seed.sql", "utf8"));
  assert.deepEqual(
    (
      await db.query<{ name: string }>(
        "select name from activity_kinds order by display_order",
      )
    ).rows.map((k) => k.name),
    ["商談", "面談", "その他"],
  );
  await assert.rejects(
    db.query("insert into activity_kinds(name,display_order) values('提案',4)"),
    /check constraint/,
  );
  const w = demoWorkspace();
  for (const user of w.users) {
    await db.query("insert into auth.users values($1)", [user.id]);
    await db.query(
      "insert into app_users(id,display_name,role) values($1,$2,$3)",
      [user.id, user.display_name, user.role],
    );
  }
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    w.users[0].id,
  ]);
  await db.exec("set role authenticated");
  const mutate = (command: Command) =>
    db.query("select public.crm_mutate($1::jsonb)", [JSON.stringify(command)]);
  const save = (table: Table, row: Base, version = 0) =>
    mutate({
      kind: "save",
      table,
      row,
      expected_version: version,
      ...(table === "activities"
        ? {
            contact_ids: w.activity_contacts
              .filter((x) => x.activity_id === row.id)
              .map((x) => x.contact_id),
            engineer_ids: w.activity_engineers
              .filter((x) => x.activity_id === row.id)
              .map((x) => x.engineer_id),
          }
        : {}),
    });
  for (const table of tableNames)
    for (const row of w[table])
      if (table !== "activity_templates" && !row.automation_key)
        await save(table, row);
  const seededTemplates = (
    await db.query<{ id: string; name: string; body: string }>(
      "select id,name,body from activity_templates order by id",
    )
  ).rows;
  assert.deepEqual(
    seededTemplates,
    w.activity_templates
      .map(({ id, name, body }) => ({ id, name, body }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  const template = newRow("activity_templates", {
    name: "定例会",
    body: "## 議題\n\n- 確認",
  });
  await save("activity_templates", template);
  await save("activity_templates", { ...template, body: "## 更新済み" }, 1);
  await assert.rejects(
    save("activity_templates", { ...template, body: "古い編集" }, 1),
    /他の利用者/,
  );
  for (const body of [null, " ", "x".repeat(20001)])
    await assert.rejects(save("activity_templates", { ...template, body }, 2));
  assert.equal(
    (
      await db.query<{ body: string }>(
        "select body from activity_templates where id=$1",
        [template.id],
      )
    ).rows[0].body,
    "## 更新済み",
  );
  assert.equal(
    (
      await db.query<{ snapshot: { row: { body: string } } }>(
        "select snapshot from activity_templates_revisions where entity_id=$1 and version=1",
        [template.id],
      )
    ).rows[0].snapshot.row.body,
    template.body,
  );
  await mutate({
    kind: "lifecycle",
    table: "activity_templates",
    id: template.id,
    expected_version: 2,
    restore: false,
  });
  await assert.rejects(save("activity_templates", template, 3), /復元/);
  await mutate({
    kind: "lifecycle",
    table: "activity_templates",
    id: template.id,
    expected_version: 3,
    restore: true,
  });
  assert.equal(
    (
      await db.query<{ deleted_at: string | null }>(
        "select deleted_at from activity_templates where id=$1",
        [template.id],
      )
    ).rows[0].deleted_at,
    null,
  );
  await assert.rejects(
    db.query("update activity_templates set body='直接変更' where id=$1", [
      template.id,
    ]),
    /permission denied/,
  );
  assert.equal((await db.query("select * from projects")).rows.length, 1);
  assert.equal(
    (
      await db.query("select * from activity_contacts where activity_id=$1", [
        w.activities[0].id,
      ])
    ).rows.length,
    1,
  );
  await assert.rejects(
    db.query("insert into engineers(name) values('不正')"),
    /permission denied/,
  );
  await assert.rejects(db.query("delete from customers"), /permission denied/);
  await assert.rejects(
    db.query("select public.crm_run_reminders()"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select public.crm_revision('customers',$1,'update')", [
      w.customers[0].id,
    ]),
    /permission denied/,
  );
  const relation = newRow("customer_engineer_relations", {
    customer_id: w.customers[0].id,
    engineer_id: w.engineers[0].id,
    label: "一括保存の検証",
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
  await assert.rejects(mutate({ kind: "batch", commands }), /check constraint/);
  assert.equal(
    (
      await db.query("select * from project_engineers where id=$1", [
        contract.id,
      ])
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query("select * from customer_engineer_relations where id=$1", [
        relation.id,
      ])
    ).rows.length,
    0,
  );
  period.ends_on = "2027-06-30";
  await mutate({ kind: "batch", commands });
  assert.equal(
    (
      await db.query(
        "select * from contract_periods where project_engineer_id=$1",
        [contract.id],
      )
    ).rows.length,
    1,
  );
  const p = w.contract_periods[0];
  await assert.rejects(save("contract_periods", { ...p, id: newId() }), /重複/);
  await assert.rejects(
    save("contract_periods", { ...p, id: newId(), cost: "-1" }),
    /check constraint/,
  );
  const next = newRow("contract_periods", {
    project_engineer_id: p.project_engineer_id,
    starts_on: addDays(p.ends_on, 1),
    ends_on: addDays(p.ends_on, 90),
    billing_rate: "820000.25",
    cost: "610000",
    renewal_status: "pending",
  });
  await save("contract_periods", next);
  assert.equal(
    (
      await db.query<{ n: string }>(
        "select billing_rate::text as n from contract_periods where id=$1",
        [next.id],
      )
    ).rows[0].n,
    "820000.25",
  );
  await assert.rejects(
    save("deals", { ...w.deals[0], customer_id: w.customers[1].id }, 1),
    /別の顧客/,
  );
  await assert.rejects(
    save("projects", { ...w.projects[0], customer_id: w.customers[1].id }, 1),
    /別の顧客/,
  );
  await assert.rejects(
    save(
      "customer_contacts",
      { ...w.customer_contacts[0], customer_id: w.customers[1].id },
      1,
    ),
    /参加者/,
  );
  await assert.rejects(
    save(
      "customer_engineer_relations",
      { ...w.customer_engineer_relations[0], customer_id: w.customers[1].id },
      1,
    ),
    /別の顧客/,
  );

  await assert.rejects(
    save("engineers", { ...w.engineers[0], skills: "Java" }, 1),
    /未定義/,
  );
  const c = w.customers[0];
  await save("customers", { ...c, phone: "03-0000-0000" }, 1);
  await assert.rejects(save("customers", c, 1), /他の利用者/);
  await assert.rejects(
    save("contract_periods", { ...p, billing_rate: "800000.001" }, 1),
    /小数部2桁/,
  );
  const contractSnapshot = (
    await db.query<{ snapshot: { reference_labels: { project_id: string } } }>(
      "select snapshot from project_engineers_revisions where entity_id=$1",
      [w.project_engineers[0].id],
    )
  ).rows[0].snapshot;
  assert.equal(
    contractSnapshot.reference_labels.project_id,
    w.projects[0].name,
  );
  const decimalSnapshot = (
    await db.query<{ snapshot: { row: { billing_rate: string } } }>(
      "select snapshot from contract_periods_revisions where entity_id=$1",
      [next.id],
    )
  ).rows[0].snapshot;
  assert.equal(decimalSnapshot.row.billing_rate, "820000.25");
  const actor = w.users[0].id;
  const customerHistory = (
    await db.query<{ snapshot: { row: { phone: string } } }>(
      "select snapshot from customers_revisions where entity_id=$1 order by version desc",
      [c.id],
    )
  ).rows[0];
  assert.equal(customerHistory.snapshot.row.phone, "03-0000-0000");
  await mutate({
    kind: "lifecycle",
    table: "contract_periods",
    id: next.id,
    expected_version: 1,
    restore: false,
  });
  await save("contract_periods", { ...next, id: newId() });
  await assert.rejects(
    mutate({
      kind: "lifecycle",
      table: "contract_periods",
      id: next.id,
      expected_version: 2,
      restore: true,
    }),
    /重複/,
  );
  const a = w.activities[0];
  assert.equal(
    (
      await db.query(
        "select attname from pg_attribute where attrelid='public.activities'::regclass and attname='deal_id' and not attisdropped",
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    save("activities", { ...a, deal_id: w.deals[0].id }, 1),
    /未定義/,
  );
  await mutate({
    kind: "save",
    table: "activities",
    row: a,
    expected_version: 1,
    contact_ids: [],
    engineer_ids: w.engineers.map((e) => e.id),
  });
  assert.equal(
    (
      await db.query("select * from activity_engineers where activity_id=$1", [
        w.activities[0].id,
      ])
    ).rows.length,
    2,
  );
  assert.equal(
    (
      await db.query("select * from activity_contacts where activity_id=$1", [
        w.activities[0].id,
      ])
    ).rows.length,
    0,
  );
  await assert.rejects(
    mutate({
      kind: "save",
      table: "activities",
      row: a,
      expected_version: 2,
      contact_ids: [w.customer_contacts[0].id],
      engineer_ids: [w.engineers[0].id, w.engineers[0].id],
    }),
    /duplicate key/,
  );
  assert.equal(
    (
      await db.query("select * from activity_contacts where activity_id=$1", [
        w.activities[0].id,
      ])
    ).rows.length,
    0,
  );
  const foreignActivity = newRow("activities", {
    ...a,
    id: newId(),
    customer_id: w.customers.find((c) => c.id !== a.customer_id)!.id,
    project_id: null,
  });
  await mutate({
    kind: "save",
    table: "activities",
    row: foreignActivity,
    expected_version: 0,
  });
  const relatedTargets = w.activities
    .filter((x) => x.customer_id === a.customer_id && x.id !== a.id)
    .slice(0, 2);
  const relatedIds = relatedTargets.map((x) => x.id);
  const markdownBody = "## 決定事項\n\n- **継続**";
  await mutate({
    kind: "save",
    table: "activities",
    row: { ...a, body: markdownBody },
    expected_version: 2,
    related_activity_ids: relatedIds,
  });
  assert.equal(
    (
      await db.query("select * from activity_relations where activity_id=$1", [
        a.id,
      ])
    ).rows.length,
    2,
  );
  await mutate({
    kind: "save",
    table: "activities",
    row: { ...a, body: markdownBody, title: "別項目を更新" },
    expected_version: 3,
  });
  assert.equal(
    (
      await db.query("select * from activity_relations where activity_id=$1", [
        a.id,
      ])
    ).rows.length,
    2,
  );
  for (const ids of [
    [a.id],
    [relatedIds[0], relatedIds[0]],
    [foreignActivity.id],
  ]) {
    await assert.rejects(
      mutate({
        kind: "save",
        table: "activities",
        row: { ...a, body: "保存されない内容" },
        expected_version: 4,
        related_activity_ids: ids,
      }),
    );
  }
  assert.equal(
    (
      await db.query<{ body: string }>(
        "select body from activities where id=$1",
        [a.id],
      )
    ).rows[0].body,
    markdownBody,
  );
  const relatedHistory = (
    await db.query<{
      snapshot: {
        related_activity_ids: string[];
        related_activity_labels: Record<string, string>;
      };
    }>(
      "select snapshot from activities_revisions where entity_id=$1 and version=3",
      [a.id],
    )
  ).rows[0].snapshot;
  assert.deepEqual(
    relatedHistory.related_activity_ids.sort(),
    [...relatedIds].sort(),
  );
  assert.equal(
    relatedHistory.related_activity_labels[relatedIds[0]],
    relatedTargets[0].title,
  );
  await mutate({
    kind: "save",
    table: "activities",
    row: { ...a, body: markdownBody },
    expected_version: 4,
    related_activity_ids: [],
  });
  assert.equal(
    (
      await db.query("select * from activity_relations where activity_id=$1", [
        a.id,
      ])
    ).rows.length,
    0,
  );
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec("set role service_role");
  await db.query("select public.crm_run_reminders()");
  const count = (
    await db.query<{ n: number }>(
      "select count(*)::integer as n from notifications",
    )
  ).rows[0].n;
  await db.query("select public.crm_run_reminders()");
  assert.equal(
    (
      await db.query<{ n: number }>(
        "select count(*)::integer as n from notifications",
      )
    ).rows[0].n,
    count,
  );
  assert.ok(count > 0);
  assert.equal(
    (await db.query("select * from tasks where automation_key is not null"))
      .rows.length,
    1,
  );
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    actor,
  ]);
  await db.exec("set role authenticated");
  const notification = (
    await db.query<{ id: string }>("select id from notifications limit 1")
  ).rows[0];
  assert.ok(notification);
  await mutate({ kind: "read_notification", id: notification.id });
  await save("projects", { ...w.projects[0], sales_user_id: w.users[1].id }, 1);
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec("set role service_role");
  await db.query("select public.crm_run_reminders()");
  assert.equal(
    (
      await db.query<{ id: string }>(
        "select assignee_user_id as id from tasks where automation_key is not null",
      )
    ).rows[0].id,
    w.users[1].id,
  );
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    w.users[1].id,
  ]);
  await db.exec("set role authenticated");
  await assert.rejects(
    mutate({ kind: "read_notification", id: notification.id }),
    /見つかりません/,
  );
  assert.ok(
    (
      await db.query<{ recipient_user_id: string }>(
        "select * from notifications",
      )
    ).rows.every((n) => n.recipient_user_id === w.users[1].id),
  );
  // A normal member can perform standard business edits; there is no definition administration.
  await save(
    "engineers",
    { ...w.engineers[0], preferences: "リモート希望" },
    1,
  );
  await mutate({
    kind: "lifecycle",
    table: "contract_periods",
    id: p.id,
    expected_version: 1,
    restore: false,
  });
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec("set role service_role");
  await db.query("select public.crm_run_reminders()");
  assert.equal(
    (
      await db.query<{ status: string }>(
        "select status from tasks where automation_key is not null",
      )
    ).rows[0].status,
    "cancelled",
  );
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    actor,
  ]);
  await db.exec("set role authenticated");
  const project = newRow("projects", {
    customer_id: w.customers[0].id,
    name: "複数参画のDB検証",
  });
  const ids = [w.engineers[0].id];
  await mutate({
    kind: "save",
    table: "projects",
    row: project,
    expected_version: 0,
    engineer_ids: ids,
  });
  await assert.rejects(
    mutate({
      kind: "save",
      table: "projects",
      row: project,
      expected_version: 1,
      engineer_ids: w.engineers.map((e) => e.id),
    }),
    /1人/,
  );
  const memberships = (
    await db.query<{ id: string }>(
      "select id from project_engineers where project_id=$1 order by id",
      [project.id],
    )
  ).rows;
  assert.equal(memberships.length, 1);
  await assert.rejects(
    mutate({
      kind: "save",
      table: "projects",
      row: project,
      expected_version: 1,
      engineer_ids: [newId()],
    }),
    /利用可能/,
  );
  assert.equal(
    (
      await db.query<{ version: number }>(
        "select version from projects where id=$1",
        [project.id],
      )
    ).rows[0].version,
    1,
  );
  await assert.rejects(
    mutate({
      kind: "save",
      table: "projects",
      row: project,
      expected_version: 1,
      engineer_ids: [ids[0], ids[0]],
    }),
    /重複/,
  );
  await mutate({
    kind: "save",
    table: "projects",
    row: project,
    expected_version: 1,
    engineer_ids: [],
  });
  assert.equal(
    (
      await db.query(
        "select * from project_engineers where project_id=$1 and deleted_at is null",
        [project.id],
      )
    ).rows.length,
    0,
  );
  await mutate({
    kind: "save",
    table: "projects",
    row: project,
    expected_version: 2,
    engineer_ids: ids,
  });
  assert.deepEqual(
    (
      await db.query(
        "select id from project_engineers where project_id=$1 and deleted_at is null order by id",
        [project.id],
      )
    ).rows,
    memberships,
  );
  const membershipHistory = (
    await db.query<{ snapshot: { engineer_ids: string[] } }>(
      "select snapshot from projects_revisions where entity_id=$1 and version=3",
      [project.id],
    )
  ).rows[0].snapshot;
  assert.deepEqual(membershipHistory.engineer_ids, [...ids].sort());
  await mutate({
    kind: "save",
    table: "projects",
    row: project,
    expected_version: 3,
    engineer_ids: [w.engineers[1].id],
  });
  assert.equal(
    (
      await db.query<{ engineer_id: string }>(
        "select engineer_id from project_engineers where project_id=$1 and deleted_at is null",
        [project.id],
      )
    ).rows[0].engineer_id,
    w.engineers[1].id,
  );
  const defaults = projectCopyDefaults(w, w.projects[0].id);
  const copy = newRow("projects", {
    customer_id: w.customers[0].id,
    name: "複製した契約",
  });
  await mutate(projectCopyCommand(copy, w.engineers[1].id, defaults.period));
  assert.equal(
    (
      await db.query<{ rate: string }>(
        "select cp.billing_rate::text as rate from contract_periods cp join project_engineers pe on pe.id=cp.project_engineer_id where pe.project_id=$1",
        [copy.id],
      )
    ).rows[0].rate,
    "800000.00",
  );
  const invalidCopy = newRow("projects", {
    customer_id: w.customers[0].id,
    name: "失敗する複製",
  });
  await assert.rejects(
    mutate(
      projectCopyCommand(invalidCopy, w.engineers[1].id, {
        ...defaults.period!,
        starts_on: "2099-01-01",
      }),
    ),
    /check constraint/,
  );
  assert.equal(
    (await db.query("select * from projects where id=$1", [invalidCopy.id]))
      .rows.length,
    0,
  );
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    newId(),
  ]);
  await db.exec("set role authenticated");
  assert.equal((await db.query("select * from customers")).rows.length, 0);
  assert.equal(
    (await db.query("select * from activity_templates")).rows.length,
    0,
  );
  await assert.rejects(save("activity_templates", template, 4), /利用登録/);
  await assert.rejects(save("customers", c, 2), /利用登録/);
  await db.exec("reset role; set role anon");
  await assert.rejects(
    db.query("select public.crm_run_reminders()"),
    /permission denied/,
  );
  await db.close();
  console.log(
    "DB verification passed: dedicated tables, references, history, versions, restore, participant atomicity, decimal amounts, RLS, RPC-only writes and reminder idempotence.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
