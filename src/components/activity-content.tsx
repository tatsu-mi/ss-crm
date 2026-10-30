"use client";
import { useId, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Base, ActivityTemplate } from "@/lib/model";
import { inactive, titleOf } from "@/lib/model";
import type { SaveCell } from "@/lib/sheet-columns";
import { Dialog } from "./dialog";

export function MarkdownContent({ value }: { value: string }) {
  return (
    <div className="markdown-content">
      <Markdown remarkPlugins={[remarkGfm]}>
        {value || "内容は未入力です。"}
      </Markdown>
    </div>
  );
}

export function ActivityContentEditor({
  value,
  onChange,
  disabled = false,
  defaultPreview = false,
  templates,
  showTemplates = true,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  defaultPreview?: boolean;
  templates: ActivityTemplate[];
  showTemplates?: boolean;
}) {
  const id = useId();
  const [template, setTemplate] = useState("");
  const availableTemplates = templates;
  const selectedTemplate = availableTemplates.find((t) => t.id === template);
  const [preview, setPreview] = useState(defaultPreview || disabled);
  return (
    <div className="activity-content-editor">
      <div className="markdown-toolbar">
        <strong>内容</strong>
        <div role="group" aria-label="内容の表示切替">
          <button
            type="button"
            className="text-button"
            aria-pressed={!preview}
            onClick={() => setPreview(false)}
          >
            編集
          </button>
          <button
            type="button"
            className="text-button"
            aria-pressed={preview}
            onClick={() => setPreview(true)}
          >
            プレビュー
          </button>
        </div>
      </div>
      {!preview && (
        <>
          {showTemplates && (
            <div className="markdown-templates">
              <label htmlFor={`${id}-template`}>テンプレート</label>
              <select
                id={`${id}-template`}
                value={template}
                disabled={disabled}
                onChange={(e) => setTemplate(e.target.value)}
              >
                <option value="">選択してください</option>
                {availableTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button"
                disabled={disabled || !selectedTemplate}
                onClick={() => {
                  const body = selectedTemplate!.body;
                  onChange(value.trim() ? `${value}\n\n${body}` : body);
                }}
              >
                {value.trim() ? "末尾に追加" : "挿入する"}
              </button>
            </div>
          )}
          <label className="markdown-source-label" htmlFor={`${id}-body`}>
            内容（Markdown）
          </label>
          <textarea
            id={`${id}-body`}
            value={value}
            rows={12}
            maxLength={20000}
            disabled={disabled}
            placeholder="Markdownで自由に入力できます。テンプレートから始めることもできます。"
            onChange={(e) => onChange(e.target.value)}
          />
          <small className="muted">
            見出し、箇条書き、チェックリスト、表、リンクが使えます。
          </small>
        </>
      )}
      {preview && <MarkdownContent value={value} />}
    </div>
  );
}

export function ActivityContentDialog({
  row,
  templates,
  saveCell,
  onClose,
}: {
  row: Base;
  templates: ActivityTemplate[];
  saveCell: SaveCell;
  onClose: () => void;
}) {
  const [body, setBody] = useState(String(row.body || ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      title={`${titleOf(row)}の内容`}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await saveCell("activities", row, "body", body || null);
            onClose();
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="dialog-body">
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <ActivityContentEditor
            templates={templates}
            value={body}
            onChange={setBody}
            disabled={busy || inactive(row)}
            defaultPreview={!!body}
          />
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
          {!inactive(row) && (
            <button
              type="submit"
              className="button primary"
              disabled={busy || body.length > 20000}
            >
              {busy ? "保存中…" : "保存する"}
            </button>
          )}
        </footer>
      </form>
    </Dialog>
  );
}
