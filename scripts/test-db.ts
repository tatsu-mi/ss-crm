import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
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
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(readFileSync("supabase/seed.sql", "utf8"));
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
    for (const row of w[table]) if (!row.automation_key) await save(table, row);
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
  const contract = newRow("contracts", {
    relation_id: relation.id,
    name: "一括保存の契約",
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
  await assert.rejects(mutate({ kind: "batch", commands }), /check constraint/);
  assert.equal(
    (await db.query("select * from contracts where id=$1", [contract.id])).rows
      .length,
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
      await db.query("select * from contract_periods where contract_id=$1", [
        contract.id,
      ])
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
    contract_id: p.contract_id,
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
    save("deals", { ...w.deals[0], stage: "lost" }, 1),
    /受注商談/,
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
      "select snapshot from contracts_revisions where entity_id=$1",
      [w.contracts[0].id],
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
  await save(
    "contracts",
    { ...w.contracts[0], sales_user_id: w.users[1].id },
    1,
  );
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
    newId(),
  ]);
  await db.exec("set role authenticated");
  assert.equal((await db.query("select * from customers")).rows.length, 0);
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
