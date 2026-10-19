"use client";
import { useState } from "react";
import {
  Base,
  Command,
  Table,
  Workspace,
  customerOf,
  inactive,
} from "@/lib/model";
import { forms, Input, display } from "@/lib/forms";
import { projectCopyDefaults, projectCopyCommand } from "@/lib/project-copy";
import { Dialog } from "./dialog";
import { ActivityContentEditor, MarkdownContent } from "./activity-content";
import { EngineerPicker } from "./engineer-picker";
export function EntityEditor({
  w,
  table,
  initial,
  duplicateOf,
  customerId,
  userId,
  onClose,
  save,
}: {
  w: Workspace;
  table: Table;
  initial: Base;
  duplicateOf?: string;
  customerId: string;
  userId: string;
  onClose: () => void;
  save: (c: Command) => Promise<void>;
}) {
  const [copy] = useState(() =>
    duplicateOf ? projectCopyDefaults(w, duplicateOf) : null,
  );
  const [period, setPeriod] = useState<Base | null>(copy?.period || null);
  const [relatedActivities, setRelatedActivities] = useState(
    w.activity_relations
      .filter((l) => l.activity_id === initial.id)
      .map((l) => l.related_activity_id),
  );
  const [row, setRow] = useState(initial),
    [contacts, setContacts] = useState(
      w.activity_contacts
        .filter((l) => l.activity_id === initial.id)
        .map((l) => l.contact_id),
    ),
    [engineers, setEngineers] = useState(
      copy
        ? copy.engineerId
          ? [copy.engineerId]
          : []
        : (table === "projects"
            ? w.project_engineers.filter(
                (l) => l.project_id === initial.id && !inactive(l),
              )
            : w.activity_engineers.filter((l) => l.activity_id === initial.id)
          ).map((l) => l.engineer_id),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState(false);
  const archived = inactive(initial),
    own = customerOf(w, table, row) || customerId;
  async function submit(c: Command) {
    setError("");
    setBusy(true);
    try {
      await save(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function candidates(f: Input) {
    const list =
      f.ref === "users"
        ? w.users
        : f.ref === "activity_kinds"
          ? w.activity_kinds
          : w[f.ref as Table];
    return list.filter((x) => {
      if (x.id === row[f.key]) return true;
      if ("disabled_at" in x) return !x.disabled_at;
      if (
        ("archived_at" in x && x.archived_at) ||
        ("deleted_at" in x && x.deleted_at)
      )
        return false;
      if (f.ref === "users" || f.ref === "activity_kinds") return true;
      const c = customerOf(w, f.ref as Table, x as Base);
      return f.key === "customer_id" || !own || !c || c === own;
    });
  }
  function localTime(value: string) {
    if (!value) return "";
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(new Date(value))
      .replace(" ", "T");
  }
  return (
    <Dialog
      title={
        duplicateOf
          ? "契約を複製"
          : `${forms[table].label}${initial.version ? "の詳細" : "を登録"}`
      }
      subtitle={initial.version ? `版 ${initial.version}` : undefined}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (duplicateOf) {
            try {
              void submit(projectCopyCommand(row, engineers[0] || "", period));
            } catch (error) {
              setError((error as Error).message);
            }
            return;
          }
          void submit({
            kind: "save",
            table,
            row,
            expected_version: initial.version,
            ...(table === "activities"
              ? {
                  contact_ids: contacts,
                  engineer_ids: engineers,
                  related_activity_ids: relatedActivities,
                }
              : table === "projects"
                ? { engineer_ids: engineers }
                : {}),
          });
        }}
      >
        <div className="dialog-body">
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <fieldset disabled={busy || archived} className="editor-fieldset">
            <div className="form-grid">
              {forms[table].fields.map((f) =>
                table === "activities" && f.key === "body" ? (
                  <div className="span-2" key={f.key}>
                    <ActivityContentEditor
                      templates={w.activity_templates}
                      value={String(row.body || "")}
                      onChange={(value) =>
                        setRow({ ...row, body: value || null })
                      }
                      disabled={busy || archived}
                    />
                  </div>
                ) : (
                  <label
                    key={f.key}
                    className={
                      f.type === "textarea"
                        ? "span-2"
                        : f.type === "checkbox"
                          ? "checkbox-label"
                          : ""
                    }
                  >
                    {f.label}
                    {f.required && " *"}
                    {f.ref ? (
                      <select
                        required={f.required}
                        value={String(row[f.key] || "")}
                        onChange={(e) => {
                          const v = e.target.value || null;
                          setRow((old) => {
                            const next = { ...old, [f.key]: v };
                            if (
                              f.key === "customer_id" &&
                              v !== old.customer_id
                            ) {
                              for (const link of [
                                "project_id",
                                "contract_period_id",
                                "activity_id",
                              ])
                                if (link in next) next[link] = null;
                              setContacts([]);
                              setRelatedActivities([]);
                            }
                            return next;
                          });
                        }}
                      >
                        <option value="">選択してください</option>
                        {candidates(f).map((x) => (
                          <option key={x.id} value={x.id}>
                            {f.ref === "users"
                              ? String(
                                  "display_name" in x ? x.display_name : "",
                                )
                              : f.ref === "activity_kinds"
                                ? String("name" in x ? x.name : "")
                                : display(w, f, x.id)}
                            {("deleted_at" in x && x.deleted_at) ||
                            ("archived_at" in x && x.archived_at)
                              ? "（利用停止）"
                              : ""}
                          </option>
                        ))}
                      </select>
                    ) : f.options ? (
                      <select
                        required={f.required}
                        value={String(row[f.key] || "")}
                        onChange={(e) =>
                          setRow({ ...row, [f.key]: e.target.value })
                        }
                      >
                        {f.options.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : f.type === "textarea" ? (
                      <textarea
                        rows={3}
                        value={String(row[f.key] || "")}
                        onChange={(e) =>
                          setRow({ ...row, [f.key]: e.target.value || null })
                        }
                      />
                    ) : f.type === "checkbox" ? (
                      <input
                        type="checkbox"
                        checked={!!row[f.key]}
                        onChange={(e) =>
                          setRow({ ...row, [f.key]: e.target.checked })
                        }
                      />
                    ) : (
                      <input
                        required={f.required}
                        type={f.type === "money" ? "number" : f.type || "text"}
                        min={f.min}
                        max={f.max}
                        step={
                          f.type === "money"
                            ? "0.01"
                            : f.type === "number"
                              ? "1"
                              : undefined
                        }
                        maxLength={20000}
                        value={
                          f.type === "datetime-local"
                            ? localTime(String(row[f.key] || ""))
                            : String(row[f.key] ?? "")
                        }
                        onChange={(e) =>
                          setRow({
                            ...row,
                            [f.key]: !e.target.value
                              ? null
                              : f.type === "number"
                                ? Number(e.target.value)
                                : f.type === "datetime-local"
                                  ? new Date(
                                      `${e.target.value}:00+09:00`,
                                    ).toISOString()
                                  : e.target.value,
                          })
                        }
                      />
                    )}
                  </label>
                ),
              )}
            </div>
            {duplicateOf && (
              <p className="muted">
                契約情報と最新の契約期間をコピーしています。エンジニアや条件を変更して保存してください。
              </p>
            )}
            {table === "projects" && (
              <label>
                参画エンジニア
                <select
                  aria-label="参画エンジニア"
                  value={engineers[0] || ""}
                  required={!!period}
                  onChange={(e) =>
                    setEngineers(e.target.value ? [e.target.value] : [])
                  }
                >
                  <option value="">未設定</option>
                  {w.engineers
                    .filter((e) => !inactive(e) || engineers.includes(e.id))
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                        {inactive(e) ? "（保管済み）" : ""}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {period && (
              <fieldset className="participant-fields">
                <legend>複製する契約期間</legend>
                <div className="form-grid">
                  {forms.contract_periods.fields
                    .filter((f) => f.key !== "project_engineer_id")
                    .map((f) => (
                      <label key={f.key}>
                        {f.label}
                        {f.required && " *"}
                        {f.options ? (
                          <select
                            value={String(period[f.key] || "")}
                            onChange={(e) =>
                              setPeriod({ ...period, [f.key]: e.target.value })
                            }
                          >
                            {f.options.map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        ) : f.type === "textarea" ? (
                          <textarea
                            value={String(period[f.key] || "")}
                            onChange={(e) =>
                              setPeriod({
                                ...period,
                                [f.key]: e.target.value || null,
                              })
                            }
                          />
                        ) : (
                          <input
                            type={
                              f.type === "money" ? "number" : f.type || "text"
                            }
                            required={f.required}
                            min={f.min}
                            step={f.type === "money" ? "0.01" : undefined}
                            value={String(period[f.key] ?? "")}
                            onChange={(e) =>
                              setPeriod({
                                ...period,
                                [f.key]: e.target.value || null,
                              })
                            }
                          />
                        )}
                      </label>
                    ))}
                </div>
              </fieldset>
            )}
            {table === "activities" && (
              <div className="form-grid participant-fields">
                <label>
                  関連活動
                  <select
                    multiple
                    aria-label="関連活動"
                    value={relatedActivities}
                    onChange={(e) =>
                      setRelatedActivities(
                        Array.from(e.target.selectedOptions, (o) => o.value),
                      )
                    }
                  >
                    {w.activities
                      .filter(
                        (a) =>
                          a.id !== row.id &&
                          a.customer_id === row.customer_id &&
                          (!inactive(a) || relatedActivities.includes(a.id)),
                      )
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title}
                          {inactive(a) ? "（削除済み）" : ""}
                        </option>
                      ))}
                  </select>
                </label>
                {table === "activities" && (
                  <label>
                    参加した担当者
                    <select
                      multiple
                      aria-label="参加した担当者"
                      value={contacts}
                      onChange={(e) =>
                        setContacts(
                          Array.from(e.target.selectedOptions, (o) => o.value),
                        )
                      }
                    >
                      {w.customer_contacts
                        .filter(
                          (c) =>
                            c.customer_id === row.customer_id &&
                            (!inactive(c) || contacts.includes(c.id)),
                        )
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <EngineerPicker
                  engineers={w.engineers}
                  selected={engineers}
                  onChange={setEngineers}
                  disabled={busy || archived}
                />
              </div>
            )}
          </fieldset>
          {!!initial.version && (
            <>
              <button
                type="button"
                className="text-button history-toggle"
                onClick={() => setHistory(!history)}
              >
                変更履歴を{history ? "閉じる" : "表示"}
              </button>
              {history && (
                <div className="revision-list">
                  {w.revisions
                    .filter(
                      (r) =>
                        r.entity_table === table && r.entity_id === initial.id,
                    )
                    .sort((a, b) => b.version - a.version)
                    .map((r) => (
                      <details key={r.id}>
                        <summary>
                          版 {r.version} · {r.operation} ·{" "}
                          {new Date(r.changed_at).toLocaleString("ja-JP")} ·{" "}
                          {w.users.find((u) => u.id === r.changed_by)
                            ?.display_name || "自動処理"}
                        </summary>
                        <dl>
                          {forms[table].fields.map((f) => (
                            <div key={f.key}>
                              <dt>{f.label}</dt>
                              <dd>
                                {table === "activities" && f.key === "body" ? (
                                  <MarkdownContent
                                    value={String(r.snapshot.row.body || "")}
                                  />
                                ) : (
                                  (r.snapshot.reference_labels?.[f.key] ??
                                  display(w, f, r.snapshot.row[f.key]))
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        {r.snapshot.related_activity_ids && (
                          <p>
                            関連活動:{" "}
                            {r.snapshot.related_activity_ids
                              .map(
                                (id) =>
                                  r.snapshot.related_activity_labels?.[id] ||
                                  id,
                              )
                              .join("、") || "なし"}
                          </p>
                        )}
                        {r.snapshot.contact_ids && (
                          <p>
                            参加した担当者:{" "}
                            {r.snapshot.contact_ids
                              .map(
                                (id) =>
                                  r.snapshot.participant_labels?.[id] ||
                                  w.customer_contacts.find((c) => c.id === id)
                                    ?.name ||
                                  id,
                              )
                              .join("、") || "なし"}
                          </p>
                        )}
                        {r.snapshot.engineer_ids && (
                          <p>
                            関連エンジニア:{" "}
                            {r.snapshot.engineer_ids
                              .map(
                                (id) =>
                                  r.snapshot.participant_labels?.[id] ||
                                  w.engineers.find((c) => c.id === id)?.name ||
                                  id,
                              )
                              .join("、") || "なし"}
                          </p>
                        )}
                      </details>
                    ))}
                </div>
              )}
            </>
          )}
        </div>
        <footer className="dialog-footer">
          <div>
            {!!initial.version && (
              <button
                type="button"
                className="text-button danger"
                disabled={busy}
                onClick={() => {
                  if (
                    archived ||
                    window.confirm(
                      `${forms[table].label}を${forms[table].lifecycle === "archived_at" ? "保管" : "削除"}しますか？`,
                    )
                  )
                    void submit({
                      kind: "lifecycle",
                      table,
                      id: initial.id,
                      expected_version: initial.version,
                      restore: archived,
                    });
                }}
              >
                {archived
                  ? "復元する"
                  : forms[table].lifecycle === "archived_at"
                    ? "保管する"
                    : "削除"}
              </button>
            )}
          </div>
          <div className="actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={onClose}
            >
              キャンセル
            </button>
            {!archived && (
              <button type="submit" className="button primary" disabled={busy}>
                {busy ? "保存中…" : "保存する"}
              </button>
            )}
          </div>
        </footer>
      </form>
    </Dialog>
  );
}
