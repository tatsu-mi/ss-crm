"use client";
import { MoreHorizontal } from "lucide-react";
import { Base, Workspace, inactive, titleOf, today } from "@/lib/model";
import { SaveCell, standardColumn } from "@/lib/sheet-columns";
import { SheetColumn, Spreadsheet } from "./spreadsheet";
interface ContractView {
  id: string;
  engineer: Base;
  contract: Base;
  period: Base | null;
}
export function ContractEngineers({
  w,
  customerId,
  saveCell,
  onEdit,
  onRenew,
  onRelated,
}: {
  w: Workspace;
  customerId?: string;
  saveCell: SaveCell;
  onEdit: (table: "contracts" | "contract_periods", row: Base) => void;
  onRenew: (p: Base) => void;
  onRelated: (row: Base) => void;
}) {
  const rows: ContractView[] = w.contracts
    .filter((c) => !inactive(c))
    .flatMap<ContractView>((contract) => {
      const rel = w.customer_engineer_relations.find(
        (r) => r.id === contract.relation_id,
      );
      if (!rel || (customerId && rel.customer_id !== customerId)) return [];
      const engineer = w.engineers.find((e) => e.id === rel.engineer_id);
      if (!engineer) return [];
      const periods = w.contract_periods
        .filter((p) => p.contract_id === contract.id && !inactive(p))
        .sort((a, b) => b.starts_on.localeCompare(a.starts_on));
      return periods.length
        ? periods.map((period) => ({
            id: period.id,
            engineer,
            contract,
            period,
          }))
        : [{ id: contract.id, engineer, contract, period: null }];
    });
  function joined(
    key: string,
    label: string,
    source: "engineer" | "contract" | "period",
    field: string,
    width: number,
  ): SheetColumn<ContractView> {
    const table =
      source === "engineer"
        ? "engineers"
        : source === "contract"
          ? "contracts"
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
  const columns: SheetColumn<ContractView>[] = [
    joined("engineer", "エンジニア名", "engineer", "name", 130),
    joined("name", "契約名", "contract", "name", 190),
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
    joined("sales", "担当者", "contract", "sales_user_id", 100),
    {
      key: "actions",
      label: "操作",
      width: 130,
      render: (r) => (
        <span className="row-tools">
          <button
            className="text-button"
            onClick={() =>
              r.period ? onRenew(r.period) : onEdit("contracts", r.contract)
            }
          >
            {r.period ? "更新" : "期間を登録"}
          </button>
          <button className="text-button" onClick={() => onRelated(r.contract)}>
            活動履歴
          </button>
        </span>
      ),
    },
  ];
  return (
    <Spreadsheet
      label="契約エンジニア一覧"
      rows={rows}
      columns={columns}
      rowLabel={(r) => String(r.engineer.name)}
      actions={(r) => (
        <button
          className="cell-action"
          aria-label={`${r.engineer.name}の契約詳細・履歴`}
          onClick={() =>
            onEdit(
              r.period ? "contract_periods" : "contracts",
              r.period || r.contract,
            )
          }
        >
          <MoreHorizontal size={15} />
        </button>
      )}
    />
  );
}
