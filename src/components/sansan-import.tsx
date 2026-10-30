"use client";
import { useEffect, useState } from "react";
import { browserClient, configured } from "@/lib/supabase";
import type { Workspace } from "@/lib/model";
import type { SansanCompany, SansanDepartment } from "@/lib/sansan";
import type { DemoWorkspace } from "@/lib/sansan-demo";

export function SansanImport({
  w,
  reload,
  importDemo,
}: {
  w: Workspace;
  reload: () => void;
  importDemo: (
    company: SansanCompany,
    customerId: string | null,
    contacts: { personId: string; contactId: string | null }[],
  ) => Promise<void>;
}) {
  const [demoPassword, setDemoPassword] = useState("");
  const [companies, setCompanies] = useState<SansanCompany[] | null>(null);
  const [departments, setDepartments] = useState<SansanDepartment[]>([]),
    [department, setDepartment] = useState(""),
    [organizationError, setOrganizationError] = useState("");
  const [owner, setOwner] = useState("");
  const [users, setUsers] = useState<{ id: string; name?: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]),
    [current, setCurrent] = useState("");
  const [customer, setCustomer] = useState("new"),
    [contacts, setContacts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState("");
  async function request(method: string, body?: unknown) {
    if (!configured && method === "POST") {
      const fresh = await request("GET");
      const results = [];
      for (const input of body as {
        companyId: string;
        customerId: string | null;
        snapshot: { name: string; cards: SansanCompany["cards"] };
        contacts: { personId: string; contactId: string | null }[];
      }[]) {
        try {
          const company = (fresh.companies as SansanCompany[]).find(
            (c) => c.id === input.companyId,
          );
          if (
            !company ||
            company.warning ||
            JSON.stringify(input.snapshot) !==
              JSON.stringify({ name: company.name, cards: company.cards })
          )
            throw new Error(
              "名刺が変更されたか、取り込み済みです。再取得してください。",
            );
          await importDemo(company, input.customerId, input.contacts);
          results.push({ companyId: input.companyId, ok: true });
        } catch (e) {
          results.push({
            companyId: input.companyId,
            ok: false,
            error: (e as Error).message,
          });
        }
      }
      return { results };
    }
    const token = configured
      ? (await browserClient()?.auth.getSession())?.data.session?.access_token
      : "";
    if (configured && !token) throw new Error("再ログインしてください。");
    const response = await fetch(
      method === "META"
        ? "/api/sansan?metadata=1"
        : method === "GET"
          ? `/api/sansan?${new URLSearchParams({ departmentId: department, ownerId: owner })}`
          : "/api/sansan",
      {
        method: method === "META" ? "GET" : method,
        headers: {
          ...(configured
            ? { Authorization: `Bearer ${token}` }
            : { "X-Sansan-Demo-Password": demoPassword }),
          ...(method === "POST" && body
            ? { "Content-Type": "application/json" }
            : {}),
        },
        ...(method === "POST" && body ? { body: JSON.stringify(body) } : {}),
      },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (!configured && method === "GET") {
      const links = (w as DemoWorkspace).demo_sansan;
      data.companies = (data.companies as SansanCompany[])
        .filter((c) => !links?.companies[c.id])
        .map((c) => ({
          ...c,
          warning:
            c.warning ||
            (c.cards.some(
              (card) => card.personId && links?.people[card.personId],
            )
              ? "連携済みの人物が含まれます。"
              : ""),
        }));
    }
    return data;
  }
  useEffect(() => {
    let active = true;
    if (!configured) return;
    void request("META")
      .then((data) => {
        if (active) {
          setDepartments(data.departments);
          setUsers(data.users);
        }
      })
      .catch((e) => {
        if (active) setOrganizationError((e as Error).message);
      });
    return () => {
      active = false;
    };
    // The metadata is loaded once when the tab opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function connectDemo() {
    setBusy(true);
    setOrganizationError("");
    setError("");
    try {
      const data = await request("META");
      setDepartments(data.departments);
      setUsers(data.users);
    } catch (e) {
      setOrganizationError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    setBusy(true);
    setError("");
    setSelected([]);
    setCurrent("");
    setCompanies(null);
    try {
      const data = await request("GET");
      setCompanies(data.companies);
      setDepartments(data.departments);
      setOrganizationError(data.organizationError);
      setSelected([]);
      setCurrent("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const normalize = (s: string) =>
    s.normalize("NFKC").replace(/\s/g, "").toLowerCase();
  const matches = (c: SansanCompany) =>
    w.customers.filter(
      (x) =>
        normalize(x.name) &&
        (normalize(x.name).includes(normalize(c.name)) ||
          normalize(c.name).includes(normalize(x.name))),
    );
  const candidateDuplicates = (c: SansanCompany) =>
    (companies || []).filter(
      (other) =>
        other.id !== c.id &&
        normalize(c.name) &&
        normalize(other.name) === normalize(c.name),
    );
  const visible = companies || [];
  const active = companies?.find((c) => c.id === current);
  function open(c: SansanCompany) {
    setCurrent(c.id);
    setCustomer("new");
    setContacts({});
    setError("");
    setResult("");
  }
  async function submit(list: SansanCompany[], individual: boolean) {
    if (!list.length) return;
    if (!window.confirm(`${list.length}社を取り込みます。実行しますか？`))
      return;
    setBusy(true);
    setError("");
    setResult("");
    const succeeded: string[] = [],
      failed: string[] = [];
    for (let offset = 0; offset < list.length; offset += 20) {
      const batch = list.slice(offset, offset + 20);
      try {
        const data = await request(
          "POST",
          batch.map((c) => ({
            companyId: c.id,
            departmentId: department,
            ownerId: owner,
            snapshot: { name: c.name, cards: c.cards },
            customerId: individual && customer !== "new" ? customer : null,
            contacts: c.cards.map((card) => ({
              personId: card.personId,
              contactId:
                individual &&
                contacts[card.personId!] &&
                contacts[card.personId!] !== "new"
                  ? contacts[card.personId!]
                  : null,
            })),
          })),
        );
        for (const item of data.results) {
          if (item.ok) succeeded.push(item.companyId);
          else
            failed.push(
              `${batch.find((c) => c.id === item.companyId)?.name || item.companyId}: ${item.error}`,
            );
        }
      } catch (e) {
        for (const c of batch)
          failed.push(`${c.name}: ${(e as Error).message}`);
      }
    }
    setCompanies(
      (prev) => prev?.filter((c) => !succeeded.includes(c.id)) || [],
    );
    setSelected((prev) => prev.filter((id) => !succeeded.includes(id)));
    if (succeeded.includes(current)) setCurrent("");
    setResult(
      `${succeeded.length}社を取り込みました。${failed.length ? ` ${failed.length}社は失敗しました。` : ""}`,
    );
    setError(failed.join("\n"));
    setBusy(false);
    if (succeeded.length && configured) reload();
  }
  const canBatch = (c: SansanCompany) =>
    !c.warning && !matches(c).length && !candidateDuplicates(c).length;
  return (
    <section className="sansan-panel" aria-label="Sansan連携">
      <div className="sansan-heading">
        <div>
          <h1>Sansan連携</h1>
          <p>未連携の会社を確認し、取引先と担当者を取り込みます。</p>
        </div>
        <button
          className="button secondary"
          disabled={busy || (!configured && !demoPassword)}
          onClick={() => void load()}
        >
          {companies ? "再取得" : "Sansanから取得"}
        </button>
      </div>
      {!configured && (
        <div>
          <p>
            デモモード：Sansanの名刺を登録日時の新しい順に最大10件取得し、取り込み結果をこのブラウザ内に保存します。取得範囲外の名刺は含まれません。
          </p>
          <label>
            デモ用パスワード{" "}
            <input
              className="sansan-demo-password"
              type="password"
              value={demoPassword}
              onChange={(e) => {
                setDemoPassword(e.target.value);
                setDepartments([]);
                setUsers([]);
                setCompanies(null);
                setCurrent("");
                setSelected([]);
              }}
            />
          </label>{" "}
          <button
            className="button secondary"
            disabled={busy || !demoPassword}
            onClick={() => void connectDemo()}
          >
            事業部・社員を取得
          </button>
        </div>
      )}
      {organizationError && (
        <p className="sansan-warning">
          事業部・社員での絞り込みを利用できません。{organizationError}
        </p>
      )}
      {error && (
        <div className="error" role="alert" style={{ whiteSpace: "pre-wrap" }}>
          {error}
        </div>
      )}
      {result && <p role="status">{result}</p>}
      {departments.length > 0 && (
        <>
          <label>
            取込元の事業部{" "}
            <select
              value={department}
              disabled={busy || !departments.length}
              onChange={(e) => {
                const value = e.target.value;
                setDepartment(value);
                setOwner("");
                setCompanies(null);
                setSelected([]);
                setCurrent("");
                setResult("");
              }}
            >
              <option value="">すべての事業部</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.id})
                </option>
              ))}
            </select>
          </label>
          <label>
            社員（名刺所有者）{" "}
            <select
              value={owner}
              disabled={busy || !users.length}
              onChange={(e) => {
                setOwner(e.target.value);
                setCompanies(null);
                setSelected([]);
                setCurrent("");
                setResult("");
              }}
            >
              <option value="">すべての社員</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.id} ({u.id})
                </option>
              ))}
            </select>
          </label>
          <p>
            条件を選んでから「Sansanから取得」を押してください。事業部と社員は取得後に絞り込みます。Sansan
            {configured
              ? "APIからは参照可能な名刺を全件取得します。"
              : "事業部・社員の条件は取得した10件に対して適用するため、表示件数が少ない場合があります。"}
            選択した事業部の配下部署も対象です。条件に合わない担当者は取り込まれず、会社の取込後に追加する機能はまだありません。
          </p>
        </>
      )}
      {companies && (
        <>
          <div className="sansan-filters">
            <span>{visible.length}社</span>
            <button
              className="button secondary"
              disabled={busy || !visible.some(canBatch)}
              onClick={() =>
                setSelected([
                  ...new Set([
                    ...selected,
                    ...visible.filter(canBatch).map((c) => c.id),
                  ]),
                ])
              }
            >
              一括選択
            </button>
            <button
              className="button secondary"
              disabled={busy || !selected.length}
              onClick={() => setSelected([])}
            >
              選択を解除
            </button>
            <button
              className="button primary"
              disabled={busy || !selected.length}
              onClick={() =>
                void submit(
                  companies.filter(
                    (c) => selected.includes(c.id) && canBatch(c),
                  ),
                  false,
                )
              }
            >
              選択した会社を一括新規取込 ({selected.length})
            </button>
          </div>
          <p>
            一括選択では、既存取引先や同名の取込候補がある会社、確認が必要な会社を除きます。名刺所有者はCRMの営業担当には設定されません。
          </p>
          <div className="sansan-list">
            {visible.map((c) => (
              <div className="sansan-row" key={c.id}>
                <input
                  type="checkbox"
                  aria-label={`${c.name || "会社名なし"}を一括取込に選択`}
                  disabled={!canBatch(c) || busy}
                  checked={selected.includes(c.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, c.id]
                        : selected.filter((x) => x !== c.id),
                    )
                  }
                />
                <div>
                  <strong>{c.name || "会社名なし"}</strong>
                  <div>
                    {c.cards.length}人 · 名刺所有者:{" "}
                    {[
                      ...new Set(c.owners.map((x) => x.name).filter(Boolean)),
                    ].join("、") || "不明"}
                  </div>
                  {c.warning && (
                    <span className="sansan-warning">{c.warning}</span>
                  )}
                  {candidateDuplicates(c).length > 0 && (
                    <span className="sansan-warning">
                      同名の取込候補があります。個別に確認してください。
                    </span>
                  )}
                  {!c.warning && matches(c).length > 0 && (
                    <span className="sansan-warning">
                      既存取引先の候補:{" "}
                      {matches(c)
                        .map(
                          (x) => x.name + (x.archived_at ? "（削除済み）" : ""),
                        )
                        .join("、")}
                    </span>
                  )}
                </div>
                <button
                  className="button secondary"
                  disabled={busy || !!c.warning}
                  onClick={() => open(c)}
                >
                  確認・取込
                </button>
              </div>
            ))}
            {!visible.length && <p>未連携の会社はありません。</p>}
          </div>
        </>
      )}
      {active && (
        <div className="sansan-review">
          <h2>{active.name} の取り込み</h2>
          <label>
            取引先{" "}
            <select
              value={customer}
              onChange={(e) => {
                setCustomer(e.target.value);
                setContacts({});
              }}
            >
              <option value="new">新規作成</option>
              {w.customers
                .filter((c) => !c.archived_at)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          {customer === "new" && matches(active).length > 0 && (
            <p className="sansan-warning">
              既存取引先の候補があります。新規作成すると重複する場合があります。
            </p>
          )}
          <h3>担当者</h3>
          {active.cards.map((card) => {
            const existing = w.customer_contacts.filter(
              (c) => c.customer_id === customer && !c.archived_at,
            );
            const matching = existing.filter(
              (c) =>
                (card.email &&
                  c.email?.toLowerCase() === card.email.toLowerCase()) ||
                normalize(c.name) ===
                  normalize(`${card.lastName || ""}${card.firstName || ""}`),
            );
            return (
              <div className="sansan-contact" key={card.id}>
                <div>
                  <strong>
                    {card.lastName} {card.firstName}
                  </strong>
                  　{card.departmentName} {card.title}
                  <div>
                    {card.email || "メールなし"} {card.mobile || ""}
                  </div>
                  {matching.length > 0 && (
                    <span className="sansan-warning">
                      既存担当者の候補: {matching.map((c) => c.name).join("、")}
                    </span>
                  )}
                </div>
                <label>
                  取込先{" "}
                  <select
                    value={
                      contacts[card.personId!] || (matching.length ? "" : "new")
                    }
                    onChange={(e) =>
                      setContacts({
                        ...contacts,
                        [card.personId!]: e.target.value,
                      })
                    }
                  >
                    {matching.length > 0 && (
                      <option value="">選択してください</option>
                    )}
                    <option value="new">新規作成</option>
                    {existing.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name} {c.email || ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            );
          })}
          <div className="sansan-actions">
            <button
              className="button secondary"
              onClick={() => setCurrent("")}
              disabled={busy}
            >
              閉じる
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                active.cards.some((card) => {
                  const existing = w.customer_contacts.filter(
                    (c) => c.customer_id === customer && !c.archived_at,
                  );
                  return (
                    existing.some(
                      (c) =>
                        (card.email &&
                          c.email?.toLowerCase() ===
                            card.email.toLowerCase()) ||
                        normalize(c.name) ===
                          normalize(
                            `${card.lastName || ""}${card.firstName || ""}`,
                          ),
                    ) && !contacts[card.personId!]
                  );
                })
              }
              onClick={() => void submit([active], true)}
            >
              取り込む
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
