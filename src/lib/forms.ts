import { Base, Table, Value, Workspace, newId, today } from "./model";
export interface Input {
  key: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "date"
    | "month"
    | "datetime-local"
    | "number"
    | "money"
    | "checkbox"
    | "select";
  required?: boolean;
  options?: [string, string][];
  ref?: Table | "users" | "activity_kinds";
  min?: number;
  max?: number;
}
const text = (key: string, label: string, required = false): Input => ({
  key,
  label,
  required,
});
const ref = (
  key: string,
  label: string,
  target: NonNullable<Input["ref"]>,
  required = false,
): Input => ({ key, label, ref: target, required });
const select = (
  key: string,
  label: string,
  options: [string, string][],
): Input => ({ key, label, type: "select", required: true, options });
const money = (key: string, label: string, required = false): Input => ({
  key,
  label,
  type: "money",
  min: 0,
  required,
});
const date = (key: string, label: string, required = false): Input => ({
  key,
  label,
  type: "date",
  required,
});
const customer = () => ref("customer_id", "顧客", "customers", true);
const sales = () => ref("sales_user_id", "営業", "users");
const links = (): Input[] => [
  ref("project_id", "関連契約", "projects"),
  ref("deal_id", "関連商談", "deals"),
];
export const forms: Record<
  Table,
  { label: string; lifecycle: "archived_at" | "deleted_at"; fields: Input[] }
> = {
  activity_templates: {
    label: "活動テンプレート",
    lifecycle: "deleted_at",
    fields: [
      text("name", "テンプレート名", true),
      { key: "body", label: "内容", type: "textarea", required: true },
    ],
  },
  customers: {
    label: "顧客",
    lifecycle: "archived_at",
    fields: [
      text("name", "会社名", true),
      text("name_kana", "ふりがな"),
      text("website", "Webサイト"),
      text("phone", "電話番号"),
      text("address", "所在地"),
      text("industry", "業種"),
      text("employee_size", "従業員数"),
      date("established_on", "設立年月"),
      text("revenue_scale", "売上規模"),
      select("trade_status", "取引状況", [
        ["prospect", "見込み"],
        ["proposing", "提案中"],
        ["active", "取引中"],
        ["inactive", "取引停止"],
      ]),
      sales(),
      { key: "notes", label: "備考", type: "textarea" },
    ],
  },
  engineers: {
    label: "エンジニア",
    lifecycle: "archived_at",
    fields: [
      text("name", "氏名", true),
      { key: "preferences", label: "希望条件", type: "textarea" },
    ],
  },
  customer_contacts: {
    label: "担当者",
    lifecycle: "archived_at",
    fields: [
      customer(),
      text("name", "氏名", true),
      text("department", "部署"),
      text("position", "役職"),
      text("email", "メールアドレス"),
      text("phone", "電話番号"),
      { key: "is_primary", label: "主な窓口", type: "checkbox" },
    ],
  },
  customer_engineer_relations: {
    label: "参画関係",
    lifecycle: "archived_at",
    fields: [
      customer(),
      ref("engineer_id", "エンジニア", "engineers", true),
      text("label", "接点の名称", true),
    ],
  },
  projects: {
    label: "契約",
    lifecycle: "deleted_at",
    fields: [
      customer(),
      text("name", "契約名", true),
      { key: "description", label: "概要", type: "textarea" },
      text("required_skills", "必要スキル"),
      money("budget", "希望単価"),
      date("planned_start_on", "参画予定日"),
      sales(),
    ],
  },
  deals: {
    label: "商談",
    lifecycle: "deleted_at",
    fields: [
      customer(),
      text("title", "商談名", true),
      ref("project_id", "契約", "projects"),
      ref("relation_id", "候補の参画関係", "customer_engineer_relations"),
      sales(),
      select("stage", "進捗段階", [
        ["proposing", "提案中"],
        ["interview", "面談中"],
        ["negotiating", "条件調整"],
        ["won", "受注"],
        ["lost", "失注"],
      ]),
      {
        key: "probability",
        label: "受注確度",
        type: "money",
        min: 0,
        max: 100,
      },
      money("expected_amount", "見込金額"),
      date("expected_order_on", "受注予定日"),
      date("planned_start_on", "参画予定開始日"),
      date("planned_end_on", "参画予定終了日"),
    ],
  },
  project_engineers: {
    label: "参画エンジニア",
    lifecycle: "deleted_at",
    fields: [
      ref("project_id", "契約", "projects", true),
      ref("engineer_id", "エンジニア", "engineers", true),
    ],
  },
  contract_periods: {
    label: "契約期間",
    lifecycle: "deleted_at",
    fields: [
      ref("project_engineer_id", "参画エンジニア", "project_engineers", true),
      date("starts_on", "開始日", true),
      date("ends_on", "終了日", true),
      money("billing_rate", "請求単価", true),
      money("cost", "原価", true),
      select("renewal_status", "更新確認状態", [
        ["pending", "未確認"],
        ["renew", "更新予定"],
        ["end", "終了予定"],
      ]),
      { key: "notes", label: "備考", type: "textarea" },
    ],
  },
  activities: {
    label: "活動",
    lifecycle: "deleted_at",
    fields: [
      customer(),
      text("title", "タイトル", true),
      ref("activity_kind_id", "活動種別", "activity_kinds", true),
      ref("recorded_by", "営業", "users", true),
      {
        key: "occurred_at",
        label: "活動日時",
        type: "datetime-local",
        required: true,
      },
      { key: "body", label: "内容", type: "textarea" },
      ref("project_id", "関連契約", "projects"),
    ],
  },
  tasks: {
    label: "タスク",
    lifecycle: "deleted_at",
    fields: [
      customer(),
      text("title", "タイトル", true),
      { key: "body", label: "内容", type: "textarea" },
      ref("assignee_user_id", "営業", "users"),
      { key: "due_at", label: "期限", type: "datetime-local" },
      select("status", "状態", [
        ["open", "未着手"],
        ["in_progress", "対応中"],
        ["completed", "完了"],
        ["cancelled", "取消"],
      ]),
      ...links(),
      ref("contract_period_id", "関連契約期間", "contract_periods"),
      ref("activity_id", "関連活動", "activities"),
    ],
  },
};
export function newRow(
  table: Table,
  defaults: Record<string, Value> = {},
): Base {
  const now = new Date().toISOString();
  const row: Base = {
    id: newId(),
    version: 0,
    created_at: now,
    updated_at: now,
    [forms[table].lifecycle]: null,
  };
  for (const f of forms[table].fields)
    row[f.key] =
      f.type === "checkbox" ? false : f.options ? f.options[0][0] : null;
  if (table === "tasks") row.automation_key = null;
  if (table === "activities") row.occurred_at = `${today()}T09:00:00+09:00`;
  return { ...row, ...defaults };
}
export function display(
  w: Workspace,
  field: Input,
  value: Value | undefined,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field.ref) {
    const list =
      field.ref === "users"
        ? w.users
        : field.ref === "activity_kinds"
          ? w.activity_kinds
          : w[field.ref];
    const target = list.find((x) => x.id === value);
    if (field.ref === "project_engineers" && target) {
      const assignment = w.project_engineers.find((x) => x.id === value)!;
      return `${w.projects.find((p) => p.id === assignment.project_id)?.name || "契約"} / ${w.engineers.find((e) => e.id === assignment.engineer_id)?.name || "エンジニア"}`;
    }
    return target
      ? String(
          "display_name" in target
            ? target.display_name
            : ("name" in target && target.name) ||
                ("title" in target && target.title) ||
                ("label" in target && target.label) ||
                ("starts_on" in target
                  ? `${target.starts_on} 〜 ${target.ends_on}`
                  : value),
        )
      : "不明";
  }
  if (field.options)
    return field.options.find((x) => x[0] === value)?.[1] || String(value);
  if (field.type === "checkbox") return value ? "はい" : "いいえ";
  if (field.type === "money" && field.key !== "probability") {
    const [whole, fraction] = String(value).split(".");
    const decimals = fraction?.replace(/0+$/, "");
    return `¥${BigInt(whole).toLocaleString("ja-JP")}${decimals ? `.${decimals}` : ""}`;
  }
  if (field.type === "datetime-local")
    return new Date(String(value)).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
    });
  return String(value);
}
