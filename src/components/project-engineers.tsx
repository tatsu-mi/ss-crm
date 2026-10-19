"use client";
import { PencilLine } from "lucide-react";
import { Base, Workspace, inactive, today } from "@/lib/model";
import { SaveCell, standardColumn } from "@/lib/sheet-columns";
import { SheetColumn, Spreadsheet } from "./spreadsheet";
interface ProjectEngineerView {
  id: string;
  engineer: Base;
  assignment: Base;
  project: Base;
  period: Base | null;
}
export function ProjectEngineers({
  w,
  customerId,
  saveCell,
  onEdit,
  onContract,
  onRenew,
  onRelated,
}: {
  w: Workspace;
  customerId?: string;
  saveCell: SaveCell;
  onContract: (row: Base) => void;
  onEdit: (table: "project_engineers" | "contract_periods", row: Base) => void;
  onRenew: (p: Base) => void;
  onRelated: (row: Base) => void;
}) {
  const rows: ProjectEngineerView[] = w.project_engineers
    .filter((c) => !inactive(c))
    .flatMap<ProjectEngineerView>((assignment) => {
      const project = w.projects.find(
        (p) => p.id === assignment.project_id && !inactive(p),
      );
      if (!project || (customerId && project.customer_id !== customerId))
        return [];
      const engineer = w.engineers.find((e) => e.id === assignment.engineer_id);
      if (!engineer) return [];
      const periods = w.contract_periods
        .filter((p) => p.project_engineer_id === assignment.id && !inactive(p))
        .sort((a, b) => b.starts_on.localeCompare(a.starts_on));
      return periods.length
        ? periods.map((period) => ({
            id: period.id,
            engineer,
            assignment,
            project,
            period,
          }))
        : [
            {
              id: assignment.id,
              engineer,
              assignment,
              project,
              period: null,
            },
          ];
    });
  function joined(
    key: string,
    label: string,
    source: "engineer" | "project" | "period",
    field: string,
    width: number,
  ): SheetColumn<ProjectEngineerView> {
    const table =
      source === "engineer"
        ? "engineers"
        : source === "project"
          ? "projects"
          : "contract_periods";
    const base = standardColumn(w, table, field, saveCell, label, width);
    return {
      key,
      label,
      width,
      field: base.field as import("@/lib/forms").Input,
      value: (r) => r[source]?.[field],
      render: (r) => (r[source] ? base.render?.(r[source]!) : "未登録"),
      disabled: (r) => !r[source] || inactive(r[source]!),
      choices: (r) => (r[source] ? base.choices!(r[source]!) : []),
      save: (r, value) => base.save!(r[source]!, value),
    };
  }
  const columns: SheetColumn<ProjectEngineerView>[] = [
    joined("engineer", "エンジニア名", "engineer", "name", 130),
    {
      key: "name",
      label: "契約名",
      width: 190,
      value: (row) => row.project.name,
      render: (row) => (
        <button
          type="button"
          className="text-button"
          aria-label={`${row.project.name}の契約を開く`}
          onClick={(e) => {
            e.stopPropagation();
            onContract(row.project);
          }}
        >
          {String(row.project.name)}
        </button>
      ),
    },
    joined("billing", "請求単価", "period", "billing_rate", 110),
    joined("cost", "原価", "period", "cost", 110),
    joined("start", "開始日", "period", "starts_on", 115),
    joined("end", "終了日", "period", "ends_on", 115),
    {
      key: "state",
      label: "状態",
      width: 80,
      render: (r) =>
        !r.period
          ? "期間未登録"
          : String(r.period.starts_on) > today()
            ? "開始前"
            : String(r.period.ends_on) < today()
              ? "終了済み"
              : "契約中",
    },
    joined("renewal", "更新確認", "period", "renewal_status", 100),
    joined("sales", "営業", "project", "sales_user_id", 100),
    {
      key: "actions",
      label: "操作",
      width: 130,
      render: (r) => (
        <span className="row-tools">
          <button
            className="text-button"
            onClick={() =>
              r.period
                ? onRenew(r.period)
                : onEdit("project_engineers", r.assignment)
            }
          >
            {r.period ? "更新" : "期間を登録"}
          </button>
          <button className="text-button" onClick={() => onRelated(r.project)}>
            活動履歴
          </button>
        </span>
      ),
    },
  ];
  return (
    <Spreadsheet
      label="参画エンジニア一覧"
      rows={rows}
      columns={columns}
      rowLabel={(r) => String(r.engineer.name)}
      actions={(r) => (
        <button
          className="cell-action"
          aria-label={`${r.engineer.name}の参画期間を編集`}
          onClick={() =>
            onEdit(
              r.period ? "contract_periods" : "project_engineers",
              r.period || r.assignment,
            )
          }
        >
          <PencilLine size={15} />
        </button>
      )}
    />
  );
}
