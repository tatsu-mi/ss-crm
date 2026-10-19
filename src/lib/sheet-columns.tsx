import type { Base, Table, Value, Workspace } from "./model";
import { customerOf, inactive, titleOf } from "./model";
import { forms, display, type Input } from "./forms";
import type { SheetColumn } from "@/components/spreadsheet";
export type SaveCell = (
  table: Table,
  row: Base,
  key: string,
  value: Value,
) => Promise<void>;
export function fieldOf(table: Table, key: string): Input {
  return forms[table].fields.find((f) => f.key === key)!;
}
export function referenceChoices(
  w: Workspace,
  field: Input,
  row: Base,
  table: Table,
): [string, string][] {
  if (!field.ref) return field.options || [];
  const source =
    field.ref === "users"
      ? w.users
      : field.ref === "activity_kinds"
        ? w.activity_kinds
        : w[field.ref];
  const customer = customerOf(w, table, row);
  return source
    .filter((target) => {
      if (target.id === row[field.key]) return true;
      if ("disabled_at" in target) return !target.disabled_at;
      if (
        ("archived_at" in target && target.archived_at) ||
        ("deleted_at" in target && target.deleted_at)
      )
        return false;
      if (!["users", "activity_kinds", "customers"].includes(field.ref!)) {
        const c = customerOf(w, field.ref as Table, target as Base);
        if (customer && c && customer !== c) return false;
      }
      return true;
    })
    .map((target) => [
      target.id,
      "display_name" in target
        ? String(target.display_name)
        : field.ref === "customer_engineer_relations"
          ? `${w.engineers.find((e) => e.id === (target as Base).engineer_id)?.name || "エンジニア"} / ${(target as Base).label}`
          : titleOf(target as Base),
    ]);
}
export function standardColumn(
  w: Workspace,
  table: Table,
  key: string,
  save: SaveCell,
  label?: string,
  width = 130,
): SheetColumn<Base> {
  const field = fieldOf(table, key);
  return {
    key,
    label: label || field.label,
    width,
    field,
    value: (row) => row[key],
    choices: (row) => referenceChoices(w, field, row, table),
    save: (row, value) => save(table, row, key, value),
    disabled: (row) => inactive(row),
    render: (row) => {
      if (field.type === "checkbox") return row[key] ? "★" : "☆";
      if (key === "trade_status")
        return (
          <span className={`status-chip status-${row[key]}`}>
            {display(w, field, row[key])}
          </span>
        );
      if (key === "website" || key === "email")
        return <span className="cell-link">{display(w, field, row[key])}</span>;
      if (field.type === "datetime-local")
        return row[key]
          ? String(row[key]).slice(0, 10).replaceAll("-", "/")
          : "—";
      return display(w, field, row[key]);
    },
  };
}
