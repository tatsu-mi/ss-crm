import {
  Base,
  Command,
  Table,
  Workspace,
  tableNames,
  newId,
  inactive,
  customerOf,
  addDays,
  today,
} from "./model";
import { forms, newRow, display } from "./forms";
const fail = (message: string): never => {
  throw new Error(message);
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validDate(s: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}
export function validateWorkspace(w: Workspace) {
  for (const table of tableNames)
    for (const row of w[table]) {
      for (const f of forms[table].fields) {
        const v = row[f.key];
        if (v === null || v === undefined || v === "") {
          if (f.required) fail(`${f.label}を入力してください。`);
          continue;
        }
        if (f.ref) {
          const target = (
            f.ref === "users"
              ? w.users
              : f.ref === "activity_kinds"
                ? w.activity_kinds
                : w[f.ref]
          ).find((x) => x.id === v);
          if (!target) fail(`${f.label}の参照先が見つかりません。`);
        } else if (f.options) {
          if (!f.options.some((o) => o[0] === v))
            fail(`${f.label}の値が不正です。`);
        } else if (f.type === "checkbox") {
          if (typeof v !== "boolean") fail(`${f.label}の値が不正です。`);
        } else if (f.type === "money" || f.type === "number") {
          if (
            !/^-?\d+(\.\d+)?$/.test(String(v)) ||
            !Number.isFinite(Number(v)) ||
            (f.type === "money" &&
              !/^-?\d{1,16}(\.\d{1,2})?$/.test(String(v))) ||
            (f.type === "number" && !Number.isSafeInteger(Number(v))) ||
            (f.min !== undefined && Number(v) < f.min) ||
            (f.max !== undefined && Number(v) > f.max)
          )
            fail(`${f.label}の数値が不正です。`);
        } else if (f.type === "date") {
          if (!validDate(String(v))) fail(`${f.label}の日付が不正です。`);
        } else if (f.type === "datetime-local") {
          if (
            !/^\d{4}-\d\d-\d\dT/.test(String(v)) ||
            !Number.isFinite(Date.parse(String(v)))
          )
            fail(`${f.label}の日時が不正です。`);
        } else if (typeof v !== "string" || !v.trim() || v.length > 20000)
          fail(`${f.label}の値が不正です。`);
      }
      const own = customerOf(w, table, row);
      for (const f of forms[table].fields.filter(
        (f) =>
          f.ref &&
          tableNames.includes(f.ref as Table) &&
          f.key !== "customer_id" &&
          f.key !== "engineer_id",
      )) {
        const target = w[f.ref as Table].find((x) => x.id === row[f.key]);
        if (target) {
          const c = customerOf(w, f.ref as Table, target);
          if (own && c && own !== c)
            fail("別の顧客のデータは関連付けできません。");
        }
      }
      if (
        table === "deals" &&
        row.planned_start_on &&
        row.planned_end_on &&
        row.planned_start_on > row.planned_end_on
      )
        fail("予定期間の開始日が終了日を超えています。");
      if (table === "contracts" && row.deal_id) {
        const d = w.deals.find((d) => d.id === row.deal_id)!;
        if (d.stage !== "won") fail("受注商談を選択してください。");
        if (d.relation_id && d.relation_id !== row.relation_id)
          fail("商談と契約の参画関係が異なります。");
        if (d.project_id && row.project_id && d.project_id !== row.project_id)
          fail("商談と契約の案件が異なります。");
      }
      if (table === "contract_periods") {
        if (String(row.starts_on) > String(row.ends_on))
          fail("開始日は終了日以前にしてください。");
        if (
          !inactive(row) &&
          w.contract_periods.some(
            (p) =>
              p.id !== row.id &&
              !inactive(p) &&
              p.contract_id === row.contract_id &&
              p.starts_on <= String(row.ends_on) &&
              p.ends_on >= String(row.starts_on),
          )
        )
          fail("同じ契約の期間が重複しています。");
      }
      if (table === "activities" || table === "tasks") {
        const deal = w.deals.find((d) => d.id === row.deal_id);
        const period = w.contract_periods.find(
          (p) => p.id === row.contract_period_id,
        );
        const contract = w.contracts.find(
          (c) => c.id === (row.contract_id || period?.contract_id),
        );
        if (
          deal?.project_id &&
          row.project_id &&
          deal.project_id !== row.project_id
        )
          fail("関連案件と商談が一致しません。");
        if (contract) {
          if (
            contract.project_id &&
            row.project_id &&
            contract.project_id !== row.project_id
          )
            fail("関連案件と契約が一致しません。");
          if (
            contract.deal_id &&
            row.deal_id &&
            contract.deal_id !== row.deal_id
          )
            fail("関連商談と契約が一致しません。");
        }
      }
      if (table === "tasks") {
        const p = w.contract_periods.find(
          (p) => p.id === row.contract_period_id,
        );
        if (p && row.contract_id && p.contract_id !== row.contract_id)
          fail("契約と契約期間が一致しません。");
        const a = w.activities.find((a) => a.id === row.activity_id);
        if (a)
          for (const k of ["project_id", "deal_id", "contract_id"])
            if (row[k] && a[k] && row[k] !== a[k])
              fail("タスクと関連活動の関連先が一致しません。");
      }
    }
  const seen = new Set<string>();
  for (const link of w.activity_contacts) {
    const a = w.activities.find((a) => a.id === link.activity_id),
      c = w.customer_contacts.find((c) => c.id === link.contact_id);
    if (!a || !c || a.customer_id !== c.customer_id)
      fail("参加者の顧客が異なります。");
    const key = `${link.activity_id}:${link.contact_id}`;
    if (seen.has(key)) fail("参加者が重複しています。");
    seen.add(key);
  }
  for (const link of w.activity_engineers) {
    if (
      !w.activities.some((a) => a.id === link.activity_id) ||
      !w.engineers.some((e) => e.id === link.engineer_id)
    )
      fail("参加エンジニアが不正です。");
    const key = `${link.activity_id}:${link.engineer_id}`;
    if (seen.has(key)) fail("参加者が重複しています。");
    seen.add(key);
  }
}
export function applyCommand(
  workspace: Workspace,
  command: Command,
  actor: string,
): Workspace {
  if (command.kind === "batch") {
    if (
      !Array.isArray(command.commands) ||
      command.commands.length < 1 ||
      command.commands.length > 10 ||
      command.commands.some(
        (c) => !c || !["save", "lifecycle"].includes(c.kind),
      )
    )
      fail("一括保存の操作が不正です。");
    return command.commands.reduce(
      (next, c) => applyCommand(next, c, actor),
      structuredClone(workspace),
    );
  }
  const w = structuredClone(workspace),
    now = new Date().toISOString();
  if (!w.users.some((u) => u.id === actor && !u.disabled_at))
    fail("CRMへの利用登録がありません。");
  if (command.kind === "read_notification") {
    const n = w.notifications.find(
      (n) => n.id === command.id && n.recipient_user_id === actor,
    );
    if (!n) fail("通知が見つかりません。");
    n!.read_at = now;
    return w;
  }
  if (
    !["save", "lifecycle"].includes(command.kind) ||
    !tableNames.includes(command.table)
  )
    fail("操作が不正です。");
  const table = command.table,
    list = w[table] as Base[],
    id = command.kind === "save" ? command.row?.id : command.id;
  if (!uuid.test(id || "")) fail("IDが不正です。");
  const existing = list.find((x) => x.id === id);
  if (
    command.expected_version !== (existing?.version || 0) ||
    (!existing && command.kind !== "save")
  )
    fail("他の利用者が変更しました。再読み込みしてください。");
  let row: Base;
  if (command.kind === "save") {
    const allowed = new Set([
      "id",
      "version",
      "created_at",
      "updated_at",
      forms[table].lifecycle,
      ...forms[table].fields.map((f) => f.key),
      ...(table === "tasks" ? ["automation_key"] : []),
    ]);
    if (Object.keys(command.row).some((k) => !allowed.has(k)))
      fail("未定義の項目です。");
    row = newRow(table);
    row.id = id;
    for (const f of forms[table].fields) {
      row[f.key] = command.row[f.key] ?? null;
      const oldValue = existing?.[f.key];
      if (f.ref && row[f.key] && row[f.key] !== oldValue) {
        const target = (
          f.ref === "users"
            ? w.users
            : f.ref === "activity_kinds"
              ? w.activity_kinds
              : w[f.ref]
        ).find((x) => x.id === row[f.key]);
        if (
          !target ||
          ("disabled_at" in target
            ? target.disabled_at
            : ("archived_at" in target && target.archived_at) ||
              ("deleted_at" in target && target.deleted_at))
        )
          fail(`${f.label}は利用できません。`);
      }
    }
    row[forms[table].lifecycle] = existing?.[forms[table].lifecycle] || null;
    if (existing && inactive(existing)) fail("復元してから編集してください。");
    if (table === "tasks")
      row.automation_key = existing?.automation_key || null;
    if (table === "activities") {
      const contacts =
        command.contact_ids ??
        w.activity_contacts
          .filter((x) => x.activity_id === id)
          .map((x) => x.contact_id);
      const engineers =
        command.engineer_ids ??
        w.activity_engineers
          .filter((x) => x.activity_id === id)
          .map((x) => x.engineer_id);
      if (!Array.isArray(contacts) || !Array.isArray(engineers))
        fail("参加者が不正です。");
      for (const [ids, target, old] of [
        [
          contacts,
          w.customer_contacts,
          w.activity_contacts
            .filter((x) => x.activity_id === id)
            .map((x) => x.contact_id),
        ],
        [
          engineers,
          w.engineers,
          w.activity_engineers
            .filter((x) => x.activity_id === id)
            .map((x) => x.engineer_id),
        ],
      ] as const)
        for (const person of ids)
          if (
            !old.includes(person) &&
            !target.some((x) => x.id === person && !inactive(x))
          )
            fail("利用可能な参加者を選択してください。");
      w.activity_contacts = w.activity_contacts
        .filter((x) => x.activity_id !== id)
        .concat(
          contacts.map((contact_id) => ({ activity_id: id, contact_id })),
        );
      w.activity_engineers = w.activity_engineers
        .filter((x) => x.activity_id !== id)
        .concat(
          engineers.map((engineer_id) => ({ activity_id: id, engineer_id })),
        );
    }
  } else
    row = {
      ...existing!,
      [forms[table].lifecycle]: command.restore ? null : now,
    };
  row.version = (existing?.version || 0) + 1;
  row.created_at = existing?.created_at || now;
  row.updated_at = now;
  if (existing) list.splice(list.indexOf(existing), 1, row);
  else list.push(row);
  validateWorkspace(w);
  w.revisions.push({
    id: newId(),
    entity_table: table,
    entity_id: id,
    version: row.version,
    operation:
      command.kind === "lifecycle"
        ? command.restore
          ? "restore"
          : "delete"
        : existing
          ? "update"
          : "create",
    snapshot: {
      row: structuredClone(row),
      reference_labels: Object.fromEntries(
        forms[table].fields
          .filter((f) => f.ref)
          .map((f) => [f.key, display(w, f, row[f.key])]),
      ),
      ...(table === "activities"
        ? {
            participant_labels: Object.fromEntries([
              ...w.activity_contacts
                .filter((x) => x.activity_id === id)
                .map((x) => [
                  x.contact_id,
                  w.customer_contacts.find((c) => c.id === x.contact_id)
                    ?.name || x.contact_id,
                ]),
              ...w.activity_engineers
                .filter((x) => x.activity_id === id)
                .map((x) => [
                  x.engineer_id,
                  w.engineers.find((e) => e.id === x.engineer_id)?.name ||
                    x.engineer_id,
                ]),
            ]),
            contact_ids: w.activity_contacts
              .filter((x) => x.activity_id === id)
              .map((x) => x.contact_id),
            engineer_ids: w.activity_engineers
              .filter((x) => x.activity_id === id)
              .map((x) => x.engineer_id),
          }
        : {}),
    },
    changed_by: actor,
    changed_at: now,
  });
  return w;
}
function usableCustomer(w: Workspace, id: string | null) {
  return !!id && w.customers.some((c) => c.id === id && !inactive(c));
}
export function runReminders(
  workspace: Workspace,
  now = new Date(),
): Workspace {
  const w = structuredClone(workspace),
    day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
      now,
    ),
    stamp = now.toISOString();
  const enabledUser = (id: string | null) =>
    w.users.some((u) => u.id === id && !u.disabled_at);
  const actor = w.users.find((u) => !u.disabled_at)?.id;
  if (!actor) return w;
  const desired = new Map<
    string,
    {
      task_id: string | null;
      contract_period_id: string | null;
      recipient_user_id: string;
      rule_key: string;
      scheduled_at: string;
    }
  >();
  const notice = (
    task_id: string | null,
    period_id: string | null,
    user: string,
    rule: string,
    due: string,
  ) => {
    const key = `${task_id || period_id}:${rule}:${user}:${due}`;
    desired.set(key, {
      task_id,
      contract_period_id: period_id,
      recipient_user_id: user,
      rule_key: rule,
      scheduled_at: stamp,
    });
  };
  const persistTask = (task: Base, automationKey?: string) => {
    const next = applyCommand(
      w,
      {
        kind: "save",
        table: "tasks",
        row: task,
        expected_version: task.version,
      },
      actor,
    );
    if (automationKey) {
      next.tasks.find((t) => t.id === task.id)!.automation_key = automationKey;
      next.revisions.at(-1)!.snapshot.row.automation_key = automationKey;
    }
    next.revisions.at(-1)!.changed_by = null;
    Object.assign(w, next);
  };
  for (const p of w.contract_periods) {
    const contract = w.contracts.find((c) => c.id === p.contract_id),
      rel = w.customer_engineer_relations.find(
        (r) => r.id === contract?.relation_id,
      ),
      customer = rel?.customer_id || null;
    const valid =
      !inactive(p) &&
      contract &&
      !inactive(contract) &&
      rel &&
      !inactive(rel) &&
      w.engineers.some((e) => e.id === rel.engineer_id && !inactive(e)) &&
      usableCustomer(w, customer) &&
      p.renewal_status === "pending" &&
      p.ends_on >= day &&
      enabledUser(contract.sales_user_id);
    const key = `renewal:${p.id}`,
      task = w.tasks.find((t) => t.automation_key === key);
    if (!valid) {
      if (
        task &&
        !inactive(task) &&
        ["open", "in_progress"].includes(task.status)
      )
        persistTask({ ...task, status: "cancelled" });
      continue;
    }
    if (addDays(p.ends_on, -30) > day && !task) continue;
    if (!task) {
      const row = newRow("tasks", {
        customer_id: customer!,
        contract_id: contract.id,
        contract_period_id: p.id,
        assignee_user_id: contract.sales_user_id,
        title: `${contract.name}の更新確認`,
        due_at: `${p.ends_on}T17:00:00+09:00`,
        status: "open",
      });
      persistTask(row, key);
    } else if (
      !inactive(task) &&
      ["open", "in_progress"].includes(task.status) &&
      (task.assignee_user_id !== contract.sales_user_id ||
        Date.parse(task.due_at || "") !==
          Date.parse(`${p.ends_on}T17:00:00+09:00`))
    )
      persistTask({
        ...task,
        assignee_user_id: contract.sales_user_id,
        due_at: `${p.ends_on}T17:00:00+09:00`,
      });
    if (addDays(p.ends_on, -30) <= day)
      notice(
        null,
        p.id,
        contract.sales_user_id!,
        "contract_renewal",
        p.ends_on,
      );
  }
  for (const task of w.tasks) {
    if (
      inactive(task) ||
      !["open", "in_progress"].includes(task.status) ||
      !task.due_at ||
      !enabledUser(task.assignee_user_id) ||
      !usableCustomer(w, task.customer_id)
    )
      continue;
    const due = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
    }).format(new Date(task.due_at));
    if (day >= addDays(due, -7) && day < due)
      notice(task.id, null, task.assignee_user_id!, "task_before", task.due_at);
    if (day === due)
      notice(task.id, null, task.assignee_user_id!, "task_due", task.due_at);
  }
  for (const n of w.notifications)
    if (n.status === "pending" && !desired.has(n.idempotency_key))
      n.status = "cancelled";
  for (const [key, value] of desired) {
    let n = w.notifications.find((n) => n.idempotency_key === key);
    if (!n) {
      n = {
        id: newId(),
        ...value,
        idempotency_key: key,
        status: "pending",
        delivered_at: null,
        read_at: null,
      };
      w.notifications.push(n);
    }
    if (!n.delivered_at) {
      n.status = "delivered";
      n.delivered_at = stamp;
    }
  }
  return w;
}
