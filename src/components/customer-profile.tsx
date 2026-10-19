"use client";
import { FileText } from "lucide-react";
import { Base, Workspace } from "@/lib/model";
import { display, Input } from "@/lib/forms";
import { fieldOf, referenceChoices, SaveCell } from "@/lib/sheet-columns";
import { Spreadsheet, SheetColumn } from "./spreadsheet";
interface ProfileLine {
  id: string;
  left: Input;
  right: Input;
}
export function CustomerProfile({
  w,
  customer,
  save,
}: {
  w: Workspace;
  customer: Base;
  save: SaveCell;
}) {
  const pairs = [
    ["name", "name_kana"],
    ["website", "phone"],
    ["address", "industry"],
    ["employee_size", "established_on"],
    ["revenue_scale", "notes"],
  ];
  const rows: ProfileLine[] = pairs.map(([left, right], i) => ({
    id: `${customer.id}-${i}`,
    left: fieldOf("customers", left),
    right: fieldOf("customers", right),
  }));
  const columns: SheetColumn<ProfileLine>[] = (
    ["left", "right"] as const
  ).flatMap((side) => [
    {
      key: `${side}-label`,
      label: "項目",
      width: 78,
      render: (line) =>
        side === "left" && line[side].key === "name"
          ? "取引先名"
          : line[side].key === "address"
            ? "住所"
            : line[side].label,
    },
    {
      key: side,
      label: "値",
      width: 240,
      field: (line) =>
        line[side].key === "established_on"
          ? { ...line[side], type: "month" }
          : line[side],
      value: (line) => customer[line[side].key],
      choices: (line) => referenceChoices(w, line[side], customer, "customers"),
      disabled: () => !!customer.archived_at,
      save: (line, value) => save("customers", customer, line[side].key, value),
      render: (line) => {
        const f = line[side];
        if (f.key === "website")
          return (
            <span className="cell-link">{display(w, f, customer[f.key])}</span>
          );
        if (f.key === "established_on")
          return customer[f.key]
            ? `${String(customer[f.key]).slice(0, 4)}年${Number(String(customer[f.key]).slice(5, 7))}月`
            : "—";
        return display(w, f, customer[f.key]);
      },
    },
  ]);
  return (
    <>
      <div className="mock-section-heading">
        <FileText size={16} />
        <h3>基本情報</h3>
      </div>
      <Spreadsheet
        label="取引先の基本情報"
        rows={rows}
        columns={columns}
        rowLabel={() => String(customer.name)}
        hideHeader
      />
    </>
  );
}
