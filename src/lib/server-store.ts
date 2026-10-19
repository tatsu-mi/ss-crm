import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  type Workspace,
  type Table,
  tableNames,
  emptyWorkspace,
} from "./model";

import { forms } from "./forms";

export class AccessError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function authenticatedClient(request: Request) {
  const token = request.headers.get("authorization");
  if (
    !token?.startsWith("Bearer ") ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    throw new AccessError("ログインが必要です。", 401);
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: token } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await db.auth.getUser(token.slice(7));
  if (error || !data.user) throw new AccessError("ログインが必要です。", 401);
  const { data: member } = await db
    .from("app_users")
    .select("id")
    .eq("id", data.user.id)
    .is("disabled_at", null)
    .single();
  if (!member)
    throw new AccessError(
      "CRMへの利用登録がありません。管理者に連絡してください。",
      403,
    );
  return { db, user: data.user };
}
export async function loadWorkspace(db: SupabaseClient): Promise<Workspace> {
  const tables: [keyof Workspace, string][] = [
    ["activity_templates", "activity_templates"],
    ["customers", "customers"],
    ["engineers", "engineers"],
    ["customer_contacts", "customer_contacts"],
    ["customer_engineer_relations", "customer_engineer_relations"],
    ["projects", "projects"],
    ["project_engineers", "project_engineers"],
    ["contract_periods", "contract_periods"],
    ["activities", "activities"],
    ["tasks", "tasks"],
    ["activity_relations", "activity_relations"],
    ["activity_contacts", "activity_contacts"],
    ["activity_engineers", "activity_engineers"],
    ["activity_kinds", "activity_kinds"],
    ["users", "app_users"],
    ["notifications", "notifications"],
  ];
  const w = emptyWorkspace();
  await Promise.all(
    tables.map(async ([key, table]) => {
      const rows: unknown[] = [];
      for (let offset = 0; ; offset += 1000) {
        const spec = tableNames.includes(table as Table)
          ? forms[table as Table]
          : null;
        const selection = spec
          ? [
              "id",
              "version",
              "created_at",
              "updated_at",
              spec.lifecycle,
              ...spec.fields.map((f) =>
                f.type === "money" ? `${f.key}::text` : f.key,
              ),
              ...(table === "tasks" ? ["automation_key"] : []),
            ].join(",")
          : "*";
        let query = db.from(table).select(selection);
        if (
          table === "activity_contacts" ||
          table === "activity_engineers" ||
          table === "activity_relations"
        ) {
          query = query
            .order("activity_id")
            .order(
              table === "activity_contacts"
                ? "contact_id"
                : table === "activity_relations"
                  ? "related_activity_id"
                  : "engineer_id",
            );
        } else if (table === "activity_kinds") {
          query = query.order("display_order").order("id");
        } else query = query.order("id");
        const { data, error } = await query.range(offset, offset + 999);
        if (error)
          throw new Error(
            `データを読み込めませんでした（${table}）。${error.message}`,
          );
        rows.push(...data);
        if (data.length < 1000) break;
      }
      (w[key] as unknown[]) = rows;
    }),
  );
  for (const table of [
    "activity_templates",
    "customers",
    "engineers",
    "customer_contacts",
    "customer_engineer_relations",
    "projects",
    "project_engineers",
    "contract_periods",
    "activities",
    "tasks",
  ] as const) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db
        .from(`${table}_revisions`)
        .select("*")
        .order("id")
        .range(offset, offset + 999);
      if (error)
        throw new Error(`履歴を読み込めませんでした。${error.message}`);
      w.revisions.push(...data.map((row) => ({ ...row, entity_table: table })));
      if (data.length < 1000) break;
    }
  }
  return w;
}
