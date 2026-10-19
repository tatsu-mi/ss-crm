import {
  emptyWorkspace,
  Table,
  Base,
  Workspace,
  addDays,
  today,
  Tables,
} from "./model";
import { newRow } from "./forms";
import { applyCommand, runReminders } from "./domain";
export const stableId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function demoWorkspace(): Workspace {
  let w = emptyWorkspace();
  w.users = [
    {
      id: stableId(1),
      display_name: "佐藤 花子",
      role: "admin",
      disabled_at: null,
    },
    {
      id: stableId(2),
      display_name: "田中 健",
      role: "member",
      disabled_at: null,
    },
  ];
  w.activity_kinds = [
    "電話",
    "訪問",
    "面談",
    "フィードバック",
    "商談",
    "その他",
    "提案",
    "契約",
  ].map((name, i) => ({
    id: stableId(10 + i),
    name,
    display_order: i + 1,
    archived_at: null,
  }));
  let serial = 100;
  const add = <K extends Table>(
    table: K,
    values: Record<string, string | number | boolean | null>,
    contacts?: string[],
    engineers?: string[],
  ): Tables[K] => {
    const row: Base = { ...newRow(table, values), id: stableId(serial++) };
    w = applyCommand(
      w,
      {
        kind: "save",
        table,
        row,
        expected_version: 0,
        contact_ids: contacts,
        engineer_ids: engineers,
      },
      w.users[0].id,
    );
    return w[table].find((x) => x.id === row.id)! as Tables[K];
  };
  const day = today();
  const c = add("customers", {
    name: "株式会社BLUEPRINT",
    website: "https://example.com",
    phone: "03-1234-5678",
    address: "〒105-0001 東京都港区芝公園1-2-3 BLUEPRINTビル",
    industry: "SIer",
    name_kana: "ぶるーぷりんと",
    employee_size: "500〜1,000名",
    established_on: "2010-04-01",
    revenue_scale: "100億〜500億円",
    trade_status: "active",
    sales_user_id: w.users[0].id,
    notes: "基幹システムの開発をご支援。",
  });
  add("customers", {
    name: "青空システム株式会社",
    trade_status: "prospect",
    sales_user_id: w.users[1].id,
    address: "東京都千代田区",
  });
  add("customers", {
    name: "株式会社グリーンワークス",
    trade_status: "active",
    sales_user_id: w.users[0].id,
  });
  const e = add("engineers", {
    name: "山田 太郎",
    preferences: "週3日のリモート勤務を希望",
  });
  add("engineers", { name: "高橋 美咲" });
  const contact = add("customer_contacts", {
    customer_id: c.id,
    name: "鈴木 一郎",
    department: "情報システム部",
    position: "課長",
    email: "suzuki@example.com",
    phone: "03-1234-5679",
    is_primary: true,
  });
  const relation = add("customer_engineer_relations", {
    customer_id: c.id,
    engineer_id: e.id,
    label: "基幹システム刷新への提案・参画",
  });
  const project = add("projects", {
    customer_id: c.id,
    name: "基幹システム刷新",
    description: "販売管理システムの刷新",
    required_skills: "Java、PostgreSQL",
    headcount: 2,
    budget: "800000",
    recruitment_status: "open",
    planned_start_on: addDays(day, -30),
  });
  const deal = add("deals", {
    customer_id: c.id,
    project_id: project.id,
    relation_id: relation.id,
    sales_user_id: w.users[0].id,
    title: "山田さん 基幹システム刷新提案",
    stage: "won",
    probability: "100",
    expected_amount: "2400000",
    planned_start_on: addDays(day, -30),
    planned_end_on: addDays(day, 20),
  });
  const contract = add("contracts", {
    name: "山田さん 基幹システム刷新契約",
    relation_id: relation.id,
    project_id: project.id,
    deal_id: deal.id,
    sales_user_id: w.users[0].id,
  });
  add("contract_periods", {
    contract_id: contract.id,
    starts_on: addDays(day, -30),
    ends_on: addDays(day, 20),
    billing_rate: "800000",
    cost: "600000",
    renewal_status: "pending",
    notes: "初回契約",
  });
  const activity = add(
    "activities",
    {
      customer_id: c.id,
      title: "次期開発体制についての面談",
      activity_kind_id: w.activity_kinds[2].id,
      recorded_by: w.users[0].id,
      occurred_at: `${addDays(day, -1)}T14:00:00+09:00`,
      body: "山田さんの担当範囲と次期開発の体制を確認しました。",
      project_id: project.id,
      deal_id: deal.id,
      contract_id: contract.id,
    },
    [contact.id],
    [e.id],
  );
  add("tasks", {
    customer_id: c.id,
    title: "次期開発体制の提案書を送付",
    assignee_user_id: w.users[0].id,
    due_at: `${addDays(day, 3)}T17:00:00+09:00`,
    status: "open",
    activity_id: activity.id,
    project_id: project.id,
  });
  const others = [
    ["株式会社テクノフロント", "ソフトウェア", "東京都千代田区"],
    ["グローバルシステムズ株式会社", "製造", "神奈川県横浜市"],
    ["株式会社ネクストソリューション", "情報通信", "大阪府大阪市"],
    ["アドバンスソフト株式会社", "SIer", "愛知県名古屋市"],
    ["株式会社ハーモニー", "サービス", "福岡県福岡市"],
    ["株式会社イノベーションIT", "情報通信", "東京都新宿区"],
    ["クラウドテクノロジー株式会社", "SIer", "東京都中央区"],
    ["株式会社データワークス", "情報通信", "大阪府吹田市"],
    ["スマートソリューション株式会社", "ソフトウェア", "東京都新宿区"],
  ];
  for (const [name, industry, address] of others)
    add("customers", {
      name,
      industry,
      address,
      trade_status: "proposing",
      phone: "03-2345-6789",
      sales_user_id: w.users[1].id,
    });
  for (const [name, position, department, email] of [
    ["田中 一郎", "部長", "IT事業部", "tanaka@example.com"],
    ["佐藤 花子", "課長", "開発部", "sato@example.com"],
    ["高橋 美咲", "担当", "人事部", "takahashi@example.com"],
    ["伊藤 大輔", "担当", "営業部", "ito@example.com"],
  ])
    add("customer_contacts", {
      customer_id: c.id,
      name,
      position,
      department,
      email,
      phone: "080-1234-5678",
      is_primary: false,
    });
  const kinds = ["商談", "提案", "面談", "フィードバック", "契約", "その他"];
  for (let i = 0; i < 10; i++)
    add(
      "activities",
      {
        customer_id: c.id,
        title: [
          "追加要員のご相談",
          "見積書の提出",
          "田中様との定例面談",
          "山田さん 3か月FB",
          "契約更新",
          "新規プロジェクトの打診",
          "人材提案（Javaエンジニア）",
          "現場面談",
          "問い合わせ対応",
          "次年度計画について",
        ][i],
        activity_kind_id: w.activity_kinds.find(
          (k) => k.name === kinds[i % kinds.length],
        )!.id,
        recorded_by: w.users[i % 2].id,
        occurred_at: `${addDays(day, -i - 2)}T14:00:00+09:00`,
        body: [
          "来期に向けた追加要員についてご相談。",
          "開発体制の見積書を提出しました。",
          "現在の状況と今後の担当範囲を確認。",
          "技術面・勤怠ともに良好とのこと。",
        ][i % 4],
        project_id: project.id,
      },
      [contact.id],
      [e.id],
    );
  return runReminders(w);
}
