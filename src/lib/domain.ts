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
      if (table === "contract_periods") {
        if (String(row.starts_on) > String(row.ends_on))
          fail("開始日は終了日以前にしてください。");
        if (
          !inactive(row) &&
          w.contract_periods.some(
            (p) =>
              p.id !== row.id &&
              !inactive(p) &&
              p.project_engineer_id === row.project_engineer_id &&
              p.starts_on <= String(row.ends_on) &&
              p.ends_on >= String(row.starts_on),
          )
        )
          fail("同じ参画エンジニアの期間が重複しています。");
      }
      if (table === "tasks") {
        const p = w.contract_periods.find(
          (p) => p.id === row.contract_period_id,
        );
        const assignment = w.project_engineers.find(
          (x) => x.id === p?.project_engineer_id,
        );
        if (
          assignment &&
          row.project_id &&
          assignment.project_id !== row.project_id
        )
          fail("契約と契約期間が一致しません。");
        const a = w.activities.find((a) => a.id === row.activity_id);
        const projectIds = [
          row.project_id,
          assignment?.project_id,
          a?.project_id,
        ].filter(Boolean);
        if (new Set(projectIds).size > 1)
          fail("タスクの契約・契約期間・活動が一致しません。");
        if (
          a &&
          row.project_id &&
          a.project_id &&
          row.project_id !== a.project_id
        )
          fail("タスクと関連活動の関連先が一致しません。");
      }
    }
  const assignments = new Set<string>();
  for (const assignment of w.project_engineers.filter((x) => !inactive(x))) {
    const key = assignment.project_id;
    if (assignments.has(key)) fail("1契約に紐づけられるエンジニアは1人です。");
    assignments.add(key);
  }
  const relatedPairs = new Set<string>();
  for (const link of w.activity_relations) {
    const source = w.activities.find((a) => a.id === link.activity_id);
    const target = w.activities.find((a) => a.id === link.related_activity_id);
    if (
      !source ||
      !target ||
      source.id === target.id ||
      source.customer_id !== target.customer_id
    )
      fail("関連活動は同じ顧客の別の活動を選択してください。");
    const pair = `${link.activity_id}:${link.related_activity_id}`;
    if (relatedPairs.has(pair)) fail("関連活動が重複しています。");
    relatedPairs.add(pair);
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
    if (
      table === "project_engineers" &&
      existing &&
      (existing.project_id !== command.row.project_id ||
        existing.engineer_id !== command.row.engineer_id)
    )
      fail(
        "参画先・エンジニアは変更できません。紐づけを解除して追加してください。",
      );
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
      const previous = w.activity_relations
        .filter((x) => x.activity_id === id)
        .map((x) => x.related_activity_id);
      const related = command.related_activity_ids ?? previous;
      if (!Array.isArray(related) || new Set(related).size !== related.length)
        fail("関連活動が重複または不正です。");
      for (const target of related)
        if (
          !previous.includes(target) &&
          !w.activities.some((a) => a.id === target && !inactive(a))
        )
          fail("利用可能な関連活動を選択してください。");
      w.activity_relations = w.activity_relations
        .filter((x) => x.activity_id !== id)
        .concat(
          related.map((related_activity_id) => ({
            activity_id: id,
            related_activity_id,
          })),
        );
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
  if (
    table === "projects" &&
    command.kind === "save" &&
    command.engineer_ids !== undefined
  ) {
    const ids = command.engineer_ids;
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length)
      fail("契約のエンジニアが重複または不正です。");
    if (ids.length > 1) fail("1契約に紐づけられるエンジニアは1人です。");
    const assignments = w.project_engineers.filter((x) => x.project_id === id);
    for (const assignment of assignments.filter(
      (x) => !inactive(x) && !ids.includes(x.engineer_id),
    ))
      Object.assign(
        w,
        applyCommand(
          w,
          {
            kind: "lifecycle",
            table: "project_engineers",
            id: assignment.id,
            expected_version: assignment.version,
            restore: false,
          },
          actor,
        ),
      );
    for (const engineer of ids) {
      const current = assignments.find(
        (x) => x.engineer_id === engineer && !inactive(x),
      );
      if (
        !current &&
        !w.engineers.some((e) => e.id === engineer && !inactive(e))
      )
        fail("利用可能なエンジニアを選択してください。");
      if (current) continue;
      const previous = assignments.find((x) => x.engineer_id === engineer);
      Object.assign(
        w,
        applyCommand(
          w,
          previous
            ? {
                kind: "lifecycle",
                table: "project_engineers",
                id: previous.id,
                expected_version: previous.version,
                restore: true,
              }
            : {
                kind: "save",
                table: "project_engineers",
                row: newRow("project_engineers", {
                  project_id: id,
                  engineer_id: engineer,
                }),
                expected_version: 0,
              },
          actor,
        ),
      );
    }
  }
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
      ...(table === "projects"
        ? {
            engineer_ids: w.project_engineers
              .filter((x) => x.project_id === id && !inactive(x))
              .map((x) => x.engineer_id),
            participant_labels: Object.fromEntries(
              w.project_engineers
                .filter((x) => x.project_id === id && !inactive(x))
                .map((x) => [
                  x.engineer_id,
                  w.engineers.find((e) => e.id === x.engineer_id)?.name ||
                    x.engineer_id,
                ]),
            ),
          }
        : {}),
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
            related_activity_ids: w.activity_relations
              .filter((x) => x.activity_id === id)
              .map((x) => x.related_activity_id),
            related_activity_labels: Object.fromEntries(
              w.activity_relations
                .filter((x) => x.activity_id === id)
                .map((x) => [
                  x.related_activity_id,
                  w.activities.find((a) => a.id === x.related_activity_id)!
                    .title,
                ]),
            ),
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
    const assignment = w.project_engineers.find(
        (c) => c.id === p.project_engineer_id,
      ),
      project = w.projects.find((x) => x.id === assignment?.project_id),
      customer = project?.customer_id || null;
    const valid =
      !inactive(p) &&
      assignment &&
      !inactive(assignment) &&
      project &&
      !inactive(project) &&
      w.engineers.some(
        (e) => e.id === assignment.engineer_id && !inactive(e),
      ) &&
      usableCustomer(w, customer) &&
      p.renewal_status === "pending" &&
      p.ends_on >= day &&
      enabledUser(project.sales_user_id);
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
        project_id: project.id,
        contract_period_id: p.id,
        assignee_user_id: project.sales_user_id,
        title: `${project.name}の更新確認`,
        due_at: `${p.ends_on}T17:00:00+09:00`,
        status: "open",
      });
      persistTask(row, key);
    } else if (
      !inactive(task) &&
      ["open", "in_progress"].includes(task.status) &&
      (task.assignee_user_id !== project.sales_user_id ||
        Date.parse(task.due_at || "") !==
          Date.parse(`${p.ends_on}T17:00:00+09:00`))
    )
      persistTask({
        ...task,
        assignee_user_id: project.sales_user_id,
        due_at: `${p.ends_on}T17:00:00+09:00`,
      });
    if (addDays(p.ends_on, -30) <= day)
      notice(null, p.id, project.sales_user_id!, "contract_renewal", p.ends_on);
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
