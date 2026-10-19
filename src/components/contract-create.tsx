"use client";
import { useState } from "react";
import { Command, Workspace, newId } from "@/lib/model";
import { newRow } from "@/lib/forms";
import { Dialog } from "./dialog";
export function ContractCreate({
  w,
  customerId,
  userId,
  save,
  onClose,
}: {
  w: Workspace;
  customerId: string;
  userId: string;
  save: (c: Command) => Promise<void>;
  onClose: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Dialog title="契約エンジニアを追加" onClose={onClose} wide>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const data = new FormData(e.currentTarget),
              engineerId = String(data.get("engineer_id") || ""),
              newName = String(data.get("engineer_name") || "").trim(),
              customer = String(data.get("customer_id") || customerId);
            const commands: Command[] = [];
            if (!engineerId && !newName)
              throw new Error(
                "エンジニアを選択するか、氏名を入力してください。",
              );
            const engineer = engineerId || newId();
            if (!engineerId)
              commands.push({
                kind: "save",
                table: "engineers",
                row: newRow("engineers", { id: engineer, name: newName }),
                expected_version: 0,
              });
            const name = String(data.get("name"));
            const relation = newRow("customer_engineer_relations", {
              customer_id: customer,
              engineer_id: engineer,
              label: name,
            });
            commands.push({
              kind: "save",
              table: "customer_engineer_relations",
              row: relation,
              expected_version: 0,
            });
            const contract = newRow("contracts", {
              name,
              relation_id: relation.id,
              sales_user_id: String(data.get("sales_user_id")) || null,
            });
            commands.push(
              {
                kind: "save",
                table: "contracts",
                row: contract,
                expected_version: 0,
              },
              {
                kind: "save",
                table: "contract_periods",
                row: newRow("contract_periods", {
                  contract_id: contract.id,
                  starts_on: String(data.get("starts_on")),
                  ends_on: String(data.get("ends_on")),
                  billing_rate: String(data.get("billing_rate")),
                  cost: String(data.get("cost")),
                  renewal_status: "pending",
                }),
                expected_version: 0,
              },
            );
            await save({ kind: "batch", commands });
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="dialog-body">
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <div className="form-grid">
            {!customerId && (
              <label>
                取引先 *
                <select name="customer_id" required>
                  <option value="">選択してください</option>
                  {w.customers
                    .filter((c) => !c.archived_at)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              エンジニア
              <select name="engineer_id">
                <option value="">新しく登録する</option>
                {w.engineers
                  .filter((e) => !e.archived_at)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              新規エンジニア名
              <input name="engineer_name" />
            </label>
            <label>
              契約名 *<input name="name" required />
            </label>
            <label>
              担当者
              <select name="sales_user_id" defaultValue={userId}>
                {w.users
                  .filter((u) => !u.disabled_at)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              開始日 *<input name="starts_on" type="date" required />
            </label>
            <label>
              終了日 *<input name="ends_on" type="date" required />
            </label>
            <label>
              請求単価 *
              <input
                name="billing_rate"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </label>
            <label>
              原価 *
              <input name="cost" type="number" min="0" step="0.01" required />
            </label>
          </div>
        </div>
        <footer className="dialog-footer">
          <button type="button" onClick={onClose} className="button secondary">
            キャンセル
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "保存中…" : "保存する"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
