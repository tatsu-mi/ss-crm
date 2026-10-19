"use client";
import {
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { ArrowUpDown, ArrowDown, ArrowUp } from "lucide-react";
import { Input } from "@/lib/forms";
import { Value } from "@/lib/model";
export interface SheetColumn<R> {
  key: string;
  label: string;
  width?: number;
  field?: Input | ((row: R) => Input | undefined);
  value?: (row: R) => Value | undefined;
  render?: (row: R) => ReactNode;
  choices?: (row: R) => [string, string][];
  save?: (row: R, value: Value) => Promise<void>;
  disabled?: (row: R) => boolean;
}
function inputValue(value: Value | undefined, field: Input) {
  if (field.type === "month") return value ? String(value).slice(0, 7) : "";
  if (field.type === "datetime-local" && value)
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(new Date(String(value)))
      .replace(" ", "T");
  return value == null ? "" : String(value);
}
export function Spreadsheet<R extends { id: string }>({
  label,
  rows: dataRows,
  columns,
  rowLabel,
  onSelect,
  selectedId,
  actions,
  hideHeader = false,
  defaultSort,
  empty = "データはありません",
}: {
  label: string;
  rows: R[];
  columns: SheetColumn<R>[];
  rowLabel: (row: R) => string;
  onSelect?: (row: R) => void;
  selectedId?: string;
  actions?: (row: R) => ReactNode;
  hideHeader?: boolean;
  defaultSort?: { key: string; direction: 1 | -1 };
  empty?: string;
}) {
  const root = useRef<HTMLDivElement>(null),
    pending = useRef<Promise<boolean> | null>(null),
    editorRef = useRef<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
    >(null);
  const [edit, setEdit] = useState<{
      row: R;
      column: SheetColumn<R>;
      field: Input;
      value: string;
      initial: Value | undefined;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<{ key: string; direction: 1 | -1 } | null>(
    defaultSort ?? null,
  );
  const [widthsByLabel, setWidthsByLabel] = useState<
    Record<string, Record<string, number>>
  >({});
  const widths = widthsByLabel[label] || {};
  const resizing = useRef<{
    key: string;
    x: number;
    width: number;
  } | null>(null);
  function columnWidth(column: SheetColumn<R>) {
    return widths[column.key] ?? column.width ?? 100;
  }
  function setWidth(key: string, width: number) {
    setWidthsByLabel((old) => ({
      ...old,
      [label]: { ...old[label], [key]: Math.max(32, Math.round(width)) },
    }));
  }
  function resizeHandle(key: string, name: string, width: number) {
    return (
      <span
        className="sheet-column-resizer"
        role="separator"
        aria-label={`${name || "操作"}列の幅`}
        aria-orientation="vertical"
        aria-valuemin={32}
        aria-valuenow={width}
        tabIndex={0}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            e.stopPropagation();
            setWidth(key, width + (e.key === "ArrowRight" ? 10 : -10));
          }
        }}
        onPointerDown={(e: PointerEvent<HTMLSpanElement>) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          resizing.current = { key, x: e.clientX, width };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const drag = resizing.current;
          if (drag?.key === key) setWidth(key, drag.width + e.clientX - drag.x);
        }}
        onPointerUp={(e) => {
          resizing.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => (resizing.current = null)}
        onLostPointerCapture={() => (resizing.current = null)}
      />
    );
  }
  const sortColumn = columns.find((c) => c.key === sort?.key);
  const rows =
    sort && sortColumn?.value
      ? [...dataRows].sort(
          (a, b) =>
            String(sortColumn.value!(a) ?? "").localeCompare(
              String(sortColumn.value!(b) ?? ""),
              "ja",
              { numeric: true },
            ) * sort.direction,
        )
      : dataRows;
  function cell(id: string | undefined, key: string) {
    return Array.from(
      root.current?.querySelectorAll<HTMLElement>("[data-sheet-cell]") || [],
    ).find((x) => x.dataset.row === id && x.dataset.column === key);
  }
  function focus(id: string, key: string) {
    requestAnimationFrame(() => cell(id, key)?.focus());
  }
  async function finish(
    direction?: "next" | "previous" | "down",
  ): Promise<boolean> {
    if (pending.current) return pending.current;
    if (!edit) return true;
    const current = edit;
    const input = editorRef.current;
    if (input && !input.checkValidity()) {
      setError(input.validationMessage);
      input.reportValidity();
      return false;
    }
    let value: Value =
      current.field.type === "checkbox"
        ? current.value === "true"
        : current.value === ""
          ? null
          : current.field.type === "month"
            ? `${current.value}-01`
            : current.field.type === "number"
              ? Number(current.value)
              : current.field.type === "datetime-local"
                ? new Date(
                    `${current.value}${current.value.length === 16 ? ":00" : ""}+09:00`,
                  ).toISOString()
                : current.value;
    const changed =
      inputValue(current.initial, current.field) !== current.value;
    const work = (async () => {
      setBusy(true);
      setError("");
      try {
        if (changed) await current.column.save!(current.row, value);
        setEdit(null);
        if (direction) {
          const cells = Array.from(
            root.current?.querySelectorAll<HTMLElement>("[data-sheet-cell]") ||
              [],
          );
          const at = cells.findIndex(
            (x) =>
              x.dataset.row === current.row.id &&
              x.dataset.column === current.column.key,
          );
          const next =
            direction === "down"
              ? cell(
                  rows[rows.findIndex((x) => x.id === current.row.id) + 1]?.id,
                  current.column.key,
                )
              : cells[at + (direction === "previous" ? -1 : 1)];
          requestAnimationFrame(() => next?.focus());
        }
        return true;
      } catch (e) {
        setError((e as Error).message);
        requestAnimationFrame(() => editorRef.current?.focus());
        return false;
      } finally {
        setBusy(false);
        pending.current = null;
      }
    })();
    pending.current = work;
    const result = await work;
    pending.current = null;
    return result;
  }
  async function begin(row: R, column: SheetColumn<R>, typed?: string) {
    if (!column.save || column.disabled?.(row)) return;
    if (edit?.row.id === row.id && edit.column.key === column.key) return;
    if (edit && !(await finish())) return;
    const field =
      typeof column.field === "function" ? column.field(row) : column.field;
    if (!field) return;
    setError("");
    setEdit({
      row,
      column,
      field,
      value: typed ?? inputValue(column.value?.(row), field),
      initial: column.value?.(row),
    });
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      if (
        editorRef.current instanceof HTMLInputElement &&
        !["date", "month", "datetime-local", "number", "checkbox"].includes(
          editorRef.current.type,
        )
      )
        if (typed === undefined) editorRef.current.select();
        else
          editorRef.current.setSelectionRange(
            editorRef.current.value.length,
            editorRef.current.value.length,
          );
    });
  }
  function key(
    e: KeyboardEvent<HTMLTableCellElement>,
    row: R,
    column: SheetColumn<R>,
  ) {
    if (edit) return;
    if (["Enter", "F2"].includes(e.key)) {
      e.preventDefault();
      void begin(row, column);
      return;
    }
    if (["Delete", "Backspace"].includes(e.key) && column.save) {
      e.preventDefault();
      void begin(row, column, "");
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      void begin(row, column, e.key);
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const ri = rows.findIndex((x) => x.id === row.id),
        ci = columns.findIndex((x) => x.key === column.key);
      const targetRow =
          rows[ri + (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0)],
        targetCol =
          columns[
            ci + (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0)
          ];
      if (targetRow && targetCol) cell(targetRow.id, targetCol.key)?.focus();
    }
  }
  return (
    <div className="sheet-wrap" ref={root}>
      {error && (
        <div role="alert" className="sheet-error">
          {error}
        </div>
      )}
      <div className="sheet-scroll">
        <table
          role="grid"
          aria-label={label}
          className={`sheet ${hideHeader ? "sheet-no-header" : ""}`}
          style={{
            width: columns.reduce(
              (n, c) => n + columnWidth(c),
              actions ? (widths["__actions"] ?? 32) : 0,
            ),
            minWidth: columns.reduce(
              (n, c) => n + columnWidth(c),
              actions ? (widths["__actions"] ?? 32) : 0,
            ),
          }}
          aria-busy={busy}
        >
          <colgroup>
            {actions && <col style={{ width: widths["__actions"] ?? 32 }} />}
            {columns.map((c) => (
              <col key={c.key} style={{ width: columnWidth(c) }} />
            ))}
          </colgroup>
          {!hideHeader && (
            <thead>
              <tr>
                {actions && (
                  <th aria-label="行の操作">
                    {resizeHandle(
                      "__actions",
                      "行の操作",
                      widths["__actions"] ?? 32,
                    )}
                  </th>
                )}
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    aria-label={c.label || "操作"}
                    aria-sort={
                      sort?.key === c.key
                        ? sort.direction === 1
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {c.value && c.label ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSort((old) => ({
                            key: c.key,
                            direction:
                              old?.key === c.key && old.direction === 1
                                ? -1
                                : 1,
                          }))
                        }
                      >
                        {c.label}
                        {sort?.key === c.key ? (
                          sort.direction === 1 ? (
                            <ArrowUp size={12} />
                          ) : (
                            <ArrowDown size={12} />
                          )
                        ) : (
                          <ArrowUpDown size={12} />
                        )}
                      </button>
                    ) : (
                      c.label
                    )}
                    {resizeHandle(c.key, c.label, columnWidth(c))}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={row.id}
                data-row-id={row.id}
                className={selectedId === row.id ? "selected" : ""}
                onClick={() => onSelect?.(row)}
              >
                {actions && (
                  <td className="sheet-actions">
                    {actions(row)}
                    {hideHeader &&
                      rowIndex === 0 &&
                      resizeHandle(
                        "__actions",
                        "行の操作",
                        widths["__actions"] ?? 32,
                      )}
                  </td>
                )}
                {columns.map((column) => {
                  const active =
                    edit?.row.id === row.id && edit.column.key === column.key;
                  const field =
                    typeof column.field === "function"
                      ? column.field(row)
                      : column.field;
                  const editable =
                    !!column.save && !!field && !column.disabled?.(row);
                  return (
                    <td
                      key={column.key}
                      role="gridcell"
                      data-sheet-cell
                      data-row={row.id}
                      data-column={column.key}
                      tabIndex={0}
                      className={`${editable ? "editable" : ""} ${active ? "editing" : ""}`}
                      aria-label={`${field?.label || column.label} ${rowLabel(row)}`}
                      aria-readonly={!editable}
                      onKeyDown={(e) => key(e, row, column)}
                      onDoubleClick={() => void begin(row, column)}
                      onBlur={(e) => {
                        if (
                          active &&
                          !e.currentTarget.contains(e.relatedTarget)
                        )
                          void finish();
                      }}
                    >
                      {active ? (
                        <span
                          className="sheet-editor"
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.nativeEvent.isComposing) return;
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setEdit(null);
                              setError("");
                              focus(row.id, column.key);
                            } else if (e.key === "Tab") {
                              e.preventDefault();
                              void finish(e.shiftKey ? "previous" : "next");
                            } else if (
                              e.key === "Enter" &&
                              !(field?.type === "textarea" && e.shiftKey)
                            ) {
                              e.preventDefault();
                              void finish("down");
                            }
                          }}
                        >
                          {field?.ref || field?.options ? (
                            <select
                              ref={(n) => {
                                editorRef.current = n;
                              }}
                              aria-label={`${field.label}を編集`}
                              required={field.required}
                              value={edit.value}
                              disabled={busy}
                              onChange={(e) =>
                                setEdit({ ...edit, value: e.target.value })
                              }
                            >
                              <option value="">—</option>
                              {(
                                column.choices?.(row) ||
                                field.options ||
                                []
                              ).map(([id, name]) => (
                                <option key={id} value={id}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          ) : field?.type === "textarea" ? (
                            <textarea
                              ref={(n) => {
                                editorRef.current = n;
                              }}
                              aria-label={`${field.label}を編集`}
                              rows={3}
                              required={field.required}
                              value={edit.value}
                              disabled={busy}
                              onChange={(e) =>
                                setEdit({ ...edit, value: e.target.value })
                              }
                            />
                          ) : (
                            <input
                              ref={(n) => {
                                editorRef.current = n;
                              }}
                              aria-label={`${field?.label}を編集`}
                              type={
                                field?.type === "money"
                                  ? "number"
                                  : field?.type || "text"
                              }
                              min={field?.min}
                              max={field?.max}
                              step={
                                field?.type === "money"
                                  ? "0.01"
                                  : field?.type === "number"
                                    ? 1
                                    : undefined
                              }
                              required={field?.required}
                              checked={edit.value === "true"}
                              value={edit.value}
                              disabled={busy}
                              onChange={(e) =>
                                setEdit({
                                  ...edit,
                                  value:
                                    field?.type === "checkbox"
                                      ? String(e.target.checked)
                                      : e.target.value,
                                })
                              }
                            />
                          )}
                        </span>
                      ) : column.render ? (
                        column.render(row)
                      ) : (
                        String(column.value?.(row) ?? "—")
                      )}
                      {hideHeader &&
                        rowIndex === 0 &&
                        resizeHandle(
                          column.key,
                          column.label,
                          columnWidth(column),
                        )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="sheet-empty">{empty}</div>}
      </div>
    </div>
  );
}
