"use client";
import { useState } from "react";
import { ActivityContentDialog } from "./activity-content";
import { Copy, PencilLine, Link2 } from "lucide-react";
import { Base, Table, Workspace, inactive, titleOf, today } from "@/lib/model";
import { SaveCell, standardColumn } from "@/lib/sheet-columns";
import { Spreadsheet, SheetColumn } from "./spreadsheet";
const columns: Record<Table, [string, string?, number?][]> = {
  activity_templates: [
    ["name", "テンプレート名", 180],
    ["body", "内容", 300],
  ],
  customers: [
    ["name", "取引先名", 190],
    ["website", "WEBサイト", 180],
    ["phone", "電話番号", 125],
    ["industry", "業種", 100],
    ["address", "所在地", 140],
    ["trade_status", "進捗状況", 100],
    ["sales_user_id", "営業", 100],
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
    ["name", "契約名", 190],
    ["description", "概要", 200],
    ["required_skills", "必要スキル", 150],
    ["budget", "希望単価", 110],
    ["planned_start_on", "参画予定日", 120],
  ],
  deals: [
    ["title", "商談名", 190],
    ["project_id", "契約", 160],
    ["relation_id", "候補エンジニア", 170],
    ["sales_user_id", "営業", 100],
    ["stage", "進捗段階", 100],
    ["probability", "受注確度", 90],
    ["expected_amount", "見込金額", 110],
    ["expected_order_on", "受注予定日", 120],
    ["planned_start_on", "参画予定開始日", 120],
    ["planned_end_on", "参画予定終了日", 120],
  ],
  project_engineers: [
    ["project_id", "契約", 190],
    ["engineer_id", "エンジニア", 140],
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
    ["recorded_by", "営業", 85],
    ["body", "内容", 180],
  ],
  tasks: [
    ["title", "タイトル", 210],
    ["assignee_user_id", "営業", 100],
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
  onDuplicate,
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
  onDuplicate?: (row: Base) => void;
  onRelated?: (value: { table: Table; id: string }) => void;
  onRenew?: (row: Base) => void;
  saveCell: SaveCell;
  onSelect?: (row: Base) => void;
  selectedId?: string;
  label?: string;
}) {
  const [contentRow, setContentRow] = useState<Base | null>(null);
  const cols: SheetColumn<Base>[] = columns[table].map(([key, title, width]) =>
    standardColumn(w, table, key, saveCell, title, width),
  );
  if (table === "activities" || table === "projects") {
    cols.splice(4, 0, {
      key: "engineers",
      label: table === "projects" ? "参画エンジニア" : "関連エンジニア",
      width: 170,
      render: (row) => {
        const names = (
          table === "activities"
            ? w.activity_engineers.filter((link) => link.activity_id === row.id)
            : w.project_engineers.filter(
                (link) => link.project_id === row.id && !inactive(link),
              )
        )
          .map((link) => {
            const engineer = w.engineers.find((e) => e.id === link.engineer_id);
            return engineer
              ? `${engineer.name}${inactive(engineer) ? "（保管済み）" : ""}`
              : "不明";
          })
          .join("、");
        return (
          <button
            className="text-button"
            aria-label={`${titleOf(row)}のエンジニアを選択`}
            onClick={(e) => {
              e.stopPropagation();
              onEdit({ table, row });
            }}
          >
            {names || "未設定"}
          </button>
        );
      },
    });
  }
  if (table === "activities") {
    const contentIndex = cols.findIndex((c) => c.key === "body");
    cols[contentIndex] = {
      key: "body",
      label: "内容",
      width: 180,
      value: (row) => row.body,
      render: (row) => (
        <button
          className="text-button"
          aria-label={`${titleOf(row)}の内容を表示`}
          onClick={(e) => {
            e.stopPropagation();
            setContentRow(row);
          }}
        >
          {String(row.body || "未入力")
            .replace(/\s+/g, " ")
            .slice(0, 80)}
        </button>
      ),
    };
    cols.splice(
      4,
      0,
      {
        key: "related_activities",
        label: "関連活動",
        width: 180,
        render: (row) => {
          const names = w.activity_relations
            .filter((x) => x.activity_id === row.id)
            .map((x) => {
              const a = w.activities.find(
                (a) => a.id === x.related_activity_id,
              );
              return a
                ? `${a.title}${inactive(a) ? "（削除済み）" : ""}`
                : "不明";
            })
            .join("、");
          return (
            <button
              className="text-button"
              aria-label={`${titleOf(row)}の関連活動を選択`}
              onClick={(e) => {
                e.stopPropagation();
                onEdit({ table, row });
              }}
            >
              {names || "未設定"}
            </button>
          );
        },
      },
      standardColumn(w, table, "project_id", saveCell, "関連契約", 150),
    );
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
  if (onRelated)
    cols.unshift({
      key: "related_activities",
      label: "",
      width: 32,
      render: (row) => (
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
      ),
    });
  const editButton = (row: Base) => (
    <button
      aria-label={`${titleOf(row)}を編集`}
      className="cell-action"
      onClick={(e) => {
        e.stopPropagation();
        onEdit({ table, row });
      }}
    >
      <PencilLine size={15} />
    </button>
  );
  if (table === "projects") {
    const actionColumns: SheetColumn<Base>[] = [
      { key: "edit", label: "編集", width: 44, render: editButton },
    ];
    if (onDuplicate)
      actionColumns.push({
        key: "duplicate",
        label: "複製",
        width: 70,
        render: (row) =>
          !inactive(row) && (
            <button
              type="button"
              className="text-button"
              aria-label={`${titleOf(row)}を複製`}
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(row);
              }}
            >
              <Copy size={14} /> 複製
            </button>
          ),
      });
    cols.unshift(...actionColumns);
  }
  return (
    <>
      {contentRow && (
        <ActivityContentDialog
          row={contentRow}
          templates={w.activity_templates}
          saveCell={saveCell}
          onClose={() => setContentRow(null)}
        />
      )}
      <Spreadsheet
        label={
          label ||
          `${{ activity_templates: "活動テンプレート", customer_contacts: "担当者", activities: "活動", projects: "契約", deals: "商談", tasks: "タスク", contract_periods: "契約期間", engineers: "エンジニア", customers: "取引先", project_engineers: "参画エンジニア", customer_engineer_relations: "参画関係" }[table]}一覧`
        }
        rows={data}
        columns={cols}
        rowLabel={titleOf}
        onSelect={onSelect}
        selectedId={selectedId}
        actions={table === "projects" ? undefined : editButton}
      />
    </>
  );
}
