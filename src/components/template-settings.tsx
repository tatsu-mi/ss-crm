"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { ActivityTemplate, Base, Command, Workspace } from "@/lib/model";
import { inactive } from "@/lib/model";
import { newRow } from "@/lib/forms";
import { Dialog } from "./dialog";
import { ActivityContentEditor } from "./activity-content";

export function TemplateSettings({
  w,
  save,
  onClose,
}: {
  w: Workspace;
  save: (command: Command) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Base | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function select(row: Base) {
    setDraft({ ...row });
    setError("");
  }
  async function submit(command: Command) {
    setBusy(true);
    setError("");
    try {
      await save(command);
      setDraft(null);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function lifecycle(row: ActivityTemplate) {
    void submit({
      kind: "lifecycle",
      table: "activity_templates",
      id: row.id,
      expected_version: row.version,
      restore: inactive(row),
    });
  }
  const templates = w.activity_templates
    .filter((t) => showDeleted || !inactive(t))
    .toSorted((a, b) => a.name.localeCompare(b.name, "ja"));
  return (
    <Dialog
      title="設定：活動テンプレート"
      subtitle="活動の内容に挿入するテンプレートを管理します。"
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <div className="dialog-body template-settings">
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <div className="template-settings-toolbar">
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => select(newRow("activity_templates"))}
          >
            <Plus size={15} />
            テンプレートを追加
          </button>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showDeleted}
              disabled={busy}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
            削除済みを表示
          </label>
        </div>
        <ul
          className="template-settings-list"
          aria-label="活動テンプレート一覧"
        >
          {templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="text-button"
                aria-pressed={draft?.id === t.id}
                disabled={busy || inactive(t)}
                onClick={() => select(t)}
              >
                {t.name}
                {inactive(t) ? "（削除済み）" : ""}
              </button>
              <div>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  aria-label={`${t.name}を${inactive(t) ? "復元" : "削除"}`}
                  onClick={() => lifecycle(t)}
                >
                  {inactive(t) ? "復元" : "削除"}
                </button>
              </div>
            </li>
          ))}
          {!templates.length && (
            <li className="muted">テンプレートはありません。</li>
          )}
        </ul>
        {draft ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit({
                kind: "save",
                table: "activity_templates",
                row: draft,
                expected_version: draft.version,
              });
            }}
          >
            <fieldset className="editor-fieldset" disabled={busy}>
              <label>
                テンプレート名 *
                <input
                  required
                  maxLength={20000}
                  value={String(draft.name || "")}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <ActivityContentEditor
                key={draft.id}
                templates={[]}
                showTemplates={false}
                value={String(draft.body || "")}
                onChange={(body) => setDraft({ ...draft, body })}
                disabled={busy}
              />
            </fieldset>
            <div className="template-settings-toolbar">
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setError("");
                }}
              >
                編集をキャンセル
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={
                  busy ||
                  !String(draft.name || "").trim() ||
                  !String(draft.body || "").trim() ||
                  String(draft.body || "").length > 20000
                }
              >
                {busy ? "保存中…" : "保存する"}
              </button>
            </div>
          </form>
        ) : (
          <p className="muted">
            テンプレート名を選ぶと編集できます。保存した内容は、活動のテンプレート選択に反映されます。
          </p>
        )}
      </div>
      <footer className="dialog-footer">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={onClose}
        >
          閉じる
        </button>
      </footer>
    </Dialog>
  );
}
