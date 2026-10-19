"use client";
import { MoreHorizontal, Link2, FileText, Plus } from "lucide-react";
import {
  Base,
  Table,
  Workspace,
  inactive,
  titleOf,
  today,
  customerOf,
} from "@/lib/model";
import { newRow } from "@/lib/forms";
import { SaveCell, standardColumn } from "@/lib/sheet-columns";
import { Spreadsheet, SheetColumn } from "./spreadsheet";
const columns: Record<Table, [string, string?, number?][]> = {
  customers: [
    ["name", "取引先名", 190],
    ["website", "WEBサイト", 180],
    ["phone", "電話番号", 125],
    ["industry", "業種", 100],
    ["address", "所在地", 140],
    ["trade_status", "進捗状況", 100],
    ["sales_user_id", "担当者", 100],
  ],
  engineers: [
    ["name", "氏名", 140],
    ["preferences", "希望条件", 300],
  ],
  customer_contacts: [
    ["position", "役職", 70],
    ["name", "氏名", 100],
    ["department", "部署", 100],
    ["phone", "電話番号", 140],
    ["email", "メールアドレス", 180],
    ["is_primary", "主担当", 65],
  ],
  customer_engineer_relations: [
    ["engineer_id", "エンジニア", 130],
    ["label", "接点の名称", 240],
  ],
  projects: [
    ["name", "案件名", 190],
    ["description", "概要", 200],
    ["required_skills", "必要スキル", 150],
    ["headcount", "募集人数", 80],
    ["budget", "希望単価", 110],
    ["planned_start_on", "参画予定日", 120],
    ["recruitment_status", "募集状態", 100],
  ],
  deals: [
    ["title", "商談名", 190],
    ["project_id", "案件", 160],
    ["relation_id", "候補エンジニア", 170],
    ["sales_user_id", "担当者", 100],
    ["stage", "進捗段階", 100],
    ["probability", "受注確度", 90],
    ["expected_amount", "見込金額", 110],
    ["expected_order_on", "受注予定日", 120],
    ["planned_start_on", "参画予定開始日", 120],
    ["planned_end_on", "参画予定終了日", 120],
  ],
  contracts: [
    ["name", "契約名", 190],
    ["relation_id", "エンジニア", 170],
    ["sales_user_id", "担当者", 100],
    ["project_id", "案件", 160],
  ],
  contract_periods: [
    ["starts_on", "開始日", 115],
    ["ends_on", "終了日", 115],
    ["billing_rate", "請求単価", 110],
    ["cost", "原価", 110],
    ["renewal_status", "更新確認", 100],
  ],
  activities: [
    ["occurred_at", "日付", 85],
    ["activity_kind_id", "種別", 60],
    ["title", "タイトル", 155],
    ["recorded_by", "担当者", 85],
    ["body", "内容", 180],
  ],
  tasks: [
    ["title", "タイトル", 210],
    ["assignee_user_id", "担当者", 100],
    ["due_at", "期限", 150],
    ["status", "状態", 95],
    ["body", "内容", 200],
  ],
};
export function BusinessTable({
  w,
  table,
  data,
  onEdit,
  onRelated,
  onRenew,
  saveCell,
  onSelect,
  selectedId,
  label,
}: {
  w: Workspace;
  table: Table;
  data: Base[];
  onEdit: (value: { table: Table; row: Base }) => void;
  onRelated?: (value: { table: Table; id: string }) => void;
  onRenew?: (row: Base) => void;
  saveCell: SaveCell;
  onSelect?: (row: Base) => void;
  selectedId?: string;
  label?: string;
}) {
  const cols: SheetColumn<Base>[] = columns[table].map(([key, title, width]) =>
    standardColumn(w, table, key, saveCell, title, width),
  );
  if (table === "activities") {
    const activityKind = cols.find((c) => c.key === "activity_kind_id")!;
    activityKind.render = (row) => {
      const name =
        w.activity_kinds.find((k) => k.id === row.activity_kind_id)?.name ||
        "—";
      return name === "フィードバック" ? "FB" : name;
    };
    const relatedChoices = (row: Base): [string, string][] => [
      ...w.projects
        .filter((p) => p.customer_id === row.customer_id && !inactive(p))
        .map(
          (p) => [`project_id:${p.id}`, `案件：${p.name}`] as [string, string],
        ),
      ...w.deals
        .filter((d) => d.customer_id === row.customer_id && !inactive(d))
        .map(
          (d) => [`deal_id:${d.id}`, `商談：${d.title}`] as [string, string],
        ),
      ...w.contracts
        .filter(
          (c) =>
            customerOf(w, "contracts", c) === row.customer_id && !inactive(c),
        )
        .map(
          (c) => [`contract_id:${c.id}`, `契約：${c.name}`] as [string, string],
        ),
    ];
    const relatedValue = (row: Base) =>
      row.contract_id
        ? `contract_id:${row.contract_id}`
        : row.deal_id
          ? `deal_id:${row.deal_id}`
          : row.project_id
            ? `project_id:${row.project_id}`
            : null;
    cols.splice(4, 0, {
      key: "related",
      label: "関連",
      width: 125,
      field: { key: "related", label: "関連", type: "select", options: [] },
      value: relatedValue,
      choices: relatedChoices,
      disabled: inactive,
      save: (row, value) => {
        const [key, id] = String(value || "").split(":");
        return saveCell(
          "activities",
          { ...row, project_id: null, deal_id: null, contract_id: null },
          key || "project_id",
          id || null,
        );
      },
      render: (row) => {
        const value = relatedValue(row);
        if (!value) return "—";
        const [key, id] = value.split(":");
        return key === "contract_id"
          ? `契約：${w.contracts.find((c) => c.id === id)?.name || "—"}`
          : key === "deal_id"
            ? `商談：${w.deals.find((d) => d.id === id)?.title || "—"}`
            : `案件：${w.projects.find((p) => p.id === id)?.name || "—"}`;
      },
    });
  }
  if (table === "contract_periods")
    cols.push({
      key: "state",
      label: "状態",
      width: 85,
      render: (row) =>
        String(row.starts_on) > today()
          ? "開始前"
          : String(row.ends_on) < today()
            ? "終了済み"
            : "契約中",
    });
  if (table === "deals")
    cols.push({
      key: "convert",
      label: "契約",
      width: 110,
      render: (row) =>
        row.stage === "won" && !inactive(row) ? (
          w.contracts.some((c) => c.deal_id === row.id) ? (
            "契約作成済み"
          ) : (
            <button
              className="text-button"
              onClick={() =>
                onEdit({
                  table: "contracts",
                  row: newRow("contracts", {
                    name: titleOf(row),
                    relation_id: row.relation_id,
                    project_id: row.project_id,
                    deal_id: row.id,
                    sales_user_id: row.sales_user_id,
                  }),
                })
              }
            >
              契約を作成
            </button>
          )
        ) : (
          "—"
        ),
    });
  if (table === "contract_periods" && onRenew)
    cols.push({
      key: "renew",
      label: "更新",
      width: 70,
      render: (row) =>
        !inactive(row) && (
          <button className="text-button" onClick={() => onRenew(row)}>
            更新
          </button>
        ),
    });
  return (
    <Spreadsheet
      label={
        label ||
        `${{ customer_contacts: "担当者", activities: "活動", projects: "案件", deals: "商談", tasks: "タスク", contract_periods: "契約期間", engineers: "エンジニア", customers: "取引先", contracts: "契約", customer_engineer_relations: "参画関係" }[table]}一覧`
      }
      rows={data}
      columns={cols}
      rowLabel={titleOf}
      onSelect={onSelect}
      selectedId={selectedId}
      actions={(row) => (
        <span className="row-tools">
          <button
            aria-label={`${titleOf(row)}の詳細・履歴`}
            className="cell-action"
            onClick={(e) => {
              e.stopPropagation();
              onEdit({ table, row });
            }}
          >
            <MoreHorizontal size={15} />
          </button>
          {onRelated && (
            <button
              aria-label={`${titleOf(row)}の活動で絞り込み`}
              className="cell-action"
              onClick={(e) => {
                e.stopPropagation();
                onRelated({ table, id: row.id });
              }}
            >
              <Link2 size={13} />
            </button>
          )}
        </span>
      )}
    />
  );
}
