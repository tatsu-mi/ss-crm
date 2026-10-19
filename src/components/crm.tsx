"use client";
import { useRef, useState } from "react";
import {
  Building2,
  Users,
  BriefcaseBusiness,
  Handshake,
  ContactRound,
  Activity,
  Folder,
  ChartNoAxesCombined,
  Mail,
  Search,
  Bell,
  Plus,
  MoreHorizontal,
  PencilLine,
  ExternalLink,
  X,
  MapPin,
  Link,
  ChevronDown,
  Filter,
  RefreshCw,
  LogOut,
  FileText,
} from "lucide-react";
import { browserClient, configured } from "@/lib/supabase";
import { useWorkspace } from "@/lib/use-workspace";
import {
  Base,
  Command,
  Table,
  Value,
  Workspace,
  activeCount,
  inactive,
  titleOf,
  customerOf,
  addDays,
} from "@/lib/model";
import { newRow, forms } from "@/lib/forms";
import { SaveCell, standardColumn } from "@/lib/sheet-columns";
import { Spreadsheet, SheetColumn } from "./spreadsheet";
import { Login } from "./login";
import { EntityEditor } from "./entity-editor";
import { BusinessTable } from "./business-table";
import { CustomerProfile } from "./customer-profile";
import { ContractEngineers } from "./contract-engineers";
import { ContractCreate } from "./contract-create";
export function Crm() {
  const data = useWorkspace();
  if (data.loading)
    return (
      <main className="loading">
        <h1>NEXUS</h1>
        <p>ワークスペースを準備しています…</p>
      </main>
    );
  if (!data.w) return <Login error={data.error} />;
  return (
    <WorkspaceView
      w={data.w}
      userId={data.userId}
      save={data.save}
      reload={data.reload}
      loadError={data.error}
    />
  );
}
type Axis =
  | "customers"
  | "engineers"
  | "customer_contacts"
  | "projects"
  | "deals"
  | "contract_engineers"
  | "activities"
  | "tasks"
  | "notifications";
type Tab =
  "profile" | "contacts" | "projects" | "contracts" | "activities" | "tasks";
function WorkspaceView({
  w,
  userId,
  save,
  reload,
  loadError,
}: {
  w: Workspace;
  userId: string;
  save: (c: Command) => Promise<void>;
  reload: () => void;
  loadError: string;
}) {
  const [axis, setAxis] = useState<Axis>("customers"),
    [selected, setSelected] = useState(
      w.customers.find((c) => !c.archived_at)?.id || "",
    ),
    [query, setQuery] = useState(""),
    [filters, setFilters] = useState(false),
    [sales, setSales] = useState(""),
    [trade, setTrade] = useState(""),
    [showDeleted, setShowDeleted] = useState(false),
    [tab, setTab] = useState<Tab>("profile"),
    [kind, setKind] = useState(""),
    [edit, setEdit] = useState<{ table: Table; row: Base } | null>(null),
    [createContract, setCreateContract] = useState(false),
    [related, setRelated] = useState<{ table: Table; id: string } | null>(null),
    [error, setError] = useState(""),
    [ratio, setRatio] = useState(49);
  const workspace = useRef<HTMLDivElement>(null);
  const customer =
    axis === "customers"
      ? w.customers.find((c) => c.id === selected)
      : undefined;
  const date = (value: Value | undefined) =>
    value ? String(value).slice(0, 10).replaceAll("-", "/") : "—";
  function navigate(next: Axis) {
    setAxis(next);
    setQuery("");
    setRelated(null);
  }
  const saveCell: SaveCell = async (table, row, key, value) => {
    await save({
      kind: "save",
      table,
      row: { ...row, [key]: value },
      expected_version: row.version,
    });
  };
  async function action(command: Command) {
    try {
      await save(command);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function openNew(table: Table, defaults: Record<string, Value> = {}) {
    const values: Record<string, Value> = { ...defaults };
    if (customer && forms[table].fields.some((f) => f.key === "customer_id"))
      values.customer_id = customer.id;
    if (table === "activities") {
      values.recorded_by = userId;
      values.activity_kind_id =
        w.activity_kinds.find((k) => k.name === "商談")?.id ||
        w.activity_kinds[0]?.id ||
        null;
    }
    if (table === "tasks") values.assignee_user_id = userId;
    if (related) {
      const key = (
        {
          projects: "project_id",
          deals: "deal_id",
          contracts: "contract_id",
          activities: "activity_id",
        } as Partial<Record<Table, string>>
      )[related.table];
      if (key && forms[table].fields.some((f) => f.key === key))
        values[key] = related.id;
    }
    setEdit({ table, row: newRow(table, values) });
  }
  function renew(p: Base) {
    const start = addDays(String(p.ends_on), 1),
      end = new Date(`${start}T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 3);
    end.setUTCDate(end.getUTCDate() - 1);
    setEdit({
      table: "contract_periods",
      row: newRow("contract_periods", {
        contract_id: p.contract_id,
        starts_on: start,
        ends_on: end.toISOString().slice(0, 10),
        billing_rate: p.billing_rate,
        cost: p.cost,
        renewal_status: "pending",
      }),
    });
  }
  function linkFilter(row: { table: Table; id: string }) {
    setRelated(row);
    setKind("");
  }
  function matchesRelated(row: Base) {
    if (!related) return true;
    const key = (
      {
        projects: "project_id",
        deals: "deal_id",
        contracts: "contract_id",
        activities: "activity_id",
      } as Partial<Record<Table, string>>
    )[related.table];
    return key ? row[key] === related.id : true;
  }
  const directory = w.customers.filter(
    (c) =>
      (showDeleted || !inactive(c)) &&
      c.name.toLowerCase().includes(query.toLowerCase()) &&
      (!sales || c.sales_user_id === sales) &&
      (!trade || c.trade_status === trade),
  );
  const customerColumns: SheetColumn<Base>[] = [
    {
      key: "edit",
      label: "",
      width: 32,
      render: (r) => (
        <button
          className="cell-action"
          aria-label={`${r.name}を編集`}
          onClick={(e) => {
            e.stopPropagation();
            setEdit({ table: "customers", row: r });
          }}
        >
          <PencilLine size={15} />
        </button>
      ),
    },
    {
      key: "open",
      label: "",
      width: 32,
      render: (r) => (
        <button
          className="cell-action"
          aria-label={`${r.name}の詳細を表示`}
          onClick={() => setSelected(r.id)}
        >
          <ExternalLink size={15} />
        </button>
      ),
    },
    {
      ...standardColumn(w, "customers", "name", saveCell, "取引先名", 190),
      render: (r) => (
        <button className="company-cell" onClick={() => setSelected(r.id)}>
          {r.name}
        </button>
      ),
    },
    standardColumn(w, "customers", "website", saveCell, "WEBサイト", 175),
    standardColumn(w, "customers", "phone", saveCell, "電話番号", 120),
    standardColumn(w, "customers", "industry", saveCell, "業種", 100),
    standardColumn(w, "customers", "address", saveCell, "所在地", 130),
    {
      key: "contacts",
      label: "担当者数",
      width: 85,
      value: (r) =>
        `${w.customer_contacts.filter((c) => c.customer_id === r.id && !inactive(c)).length}名`,
    },
    {
      key: "engineers",
      label: "契約エンジニア数",
      width: 125,
      value: (r) => `${activeCount(w, r.id)}名`,
    },
    standardColumn(w, "customers", "trade_status", saveCell, "進捗状況", 100),
    {
      key: "last_activity",
      label: "最終活動日",
      width: 105,
      value: (r) =>
        date(
          w.activities
            .filter((a) => a.customer_id === r.id && !inactive(a))
            .map((a) => a.occurred_at)
            .sort()
            .at(-1),
        ),
    },
    {
      key: "updated",
      label: "更新日",
      width: 105,
      value: (r) => date(r.updated_at),
    },
    standardColumn(w, "customers", "sales_user_id", saveCell, "担当者", 105),
  ];
  const customerRows = (table: Table) =>
    w[table].filter(
      (row) =>
        customerOf(w, table, row) === customer?.id &&
        (showDeleted || !inactive(row)),
    );
  const kindLabel = (name: string) => (name === "フィードバック" ? "FB" : name);
  const activities = (all = false) =>
    w.activities
      .filter(
        (a) =>
          (all || a.customer_id === customer?.id) &&
          (showDeleted || !inactive(a)) &&
          (!kind ||
            kindLabel(
              w.activity_kinds.find((k) => k.id === a.activity_kind_id)?.name ||
                "",
            ) === kind) &&
          matchesRelated(a),
      )
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const activityTabs = (
    <div className="mock-activity-tabs">
      {["すべて", "商談", "提案", "契約", "面談", "FB", "その他"].map(
        (name) => (
          <button
            key={name}
            className={
              (!kind && name === "すべて") || kind === name ? "active" : ""
            }
            onClick={() => setKind(name === "すべて" ? "" : name)}
          >
            {name}
          </button>
        ),
      )}
    </div>
  );
  const business = (table: Table, rows: Base[], label?: string) => (
    <BusinessTable
      w={w}
      table={table}
      data={rows}
      onEdit={setEdit}
      onRelated={
        ["projects", "deals", "contracts"].includes(table)
          ? linkFilter
          : undefined
      }
      onRenew={renew}
      saveCell={saveCell}
      label={label}
    />
  );
  function globalContent() {
    if (axis === "contract_engineers")
      return (
        <ContractEngineers
          w={w}
          saveCell={saveCell}
          onEdit={(table, row) => {
            if (table === "contracts")
              openNew("contract_periods", { contract_id: row.id });
            else setEdit({ table, row });
          }}
          onRenew={renew}
          onRelated={(row) => {
            navigate("customers");
            setSelected(customerOf(w, "contracts", row) || "");
            linkFilter({ table: "contracts", id: row.id });
          }}
        />
      );
    if (axis === "activities") return business("activities", activities(true));
    if (axis === "notifications")
      return (
        <div className="notification-list">
          {w.notifications
            .filter(
              (n) => n.recipient_user_id === userId && n.status === "delivered",
            )
            .map((n) => (
              <button
                key={n.id}
                className={`notification-item ${n.read_at ? "" : "unread"}`}
                onClick={async () => {
                  await action({ kind: "read_notification", id: n.id });
                  const table = n.task_id ? "tasks" : "contract_periods",
                    row = w[table].find(
                      (r) => r.id === (n.task_id || n.contract_period_id),
                    );
                  if (row) setEdit({ table, row });
                }}
              >
                <Bell size={16} />
                {n.task_id
                  ? w.tasks.find((t) => t.id === n.task_id)?.title
                  : "契約更新を確認してください"}
                <time>{date(n.scheduled_at)}</time>
              </button>
            ))}
        </div>
      );
    const table = axis as Table;
    return business(
      table,
      w[table].filter(
        (row) =>
          (showDeleted || !inactive(row)) &&
          titleOf(row).toLowerCase().includes(query.toLowerCase()) &&
          (axis !== "tasks" || row.assignee_user_id === userId),
      ),
    );
  }
  const title = (
    {
      customers: "取引先",
      engineers: "エンジニア",
      customer_contacts: "担当者",
      projects: "案件",
      deals: "商談",
      contract_engineers: "契約エンジニア",
      activities: "活動",
      tasks: "自分のタスク",
      notifications: "通知",
    } as const
  )[axis];
  return (
    <main className="app-shell mock-workspace">
      <header className="topbar">
        <a href="/" className="brand">
          NEXUS <span>CRM</span>
        </a>
        <nav aria-label="メインメニュー">
          {(
            [
              { axis: "customers", label: "取引先", icon: Building2 },
              {
                axis: "customer_contacts",
                label: "担当者",
                icon: ContactRound,
              },
              { axis: "projects", label: "案件", icon: BriefcaseBusiness },
              { axis: "deals", label: "商談", icon: Handshake },
              {
                axis: "contract_engineers",
                label: "契約エンジニア",
                icon: Users,
              },
              { axis: "activities", label: "活動", icon: Activity },
            ] as const
          ).map((item) => (
            <button
              key={item.axis}
              className={axis === item.axis ? "active" : ""}
              onClick={() => navigate(item.axis)}
            >
              <item.icon size={15} />
              {item.label}
            </button>
          ))}
          <button disabled>
            <Folder size={15} />
            ファイル
          </button>
          <button disabled>
            <ChartNoAxesCombined size={15} />
            レポート
          </button>
          <button disabled>
            <Mail size={15} />
            メール配信
          </button>
        </nav>
        <div className="topbar-right">
          <button
            className="top-icon"
            aria-label="自分のタスク"
            onClick={() => navigate("tasks")}
          >
            <Search size={17} />
          </button>
          <button
            className="top-icon notification-button"
            aria-label="通知"
            onClick={() => navigate("notifications")}
          >
            <Bell size={18} />
            {w.notifications.filter(
              (n) =>
                !n.read_at &&
                n.recipient_user_id === userId &&
                n.status === "delivered",
            ).length > 0 && (
              <span>
                {
                  w.notifications.filter(
                    (n) =>
                      !n.read_at &&
                      n.recipient_user_id === userId &&
                      n.status === "delivered",
                  ).length
                }
              </span>
            )}
          </button>
          <span className="user-menu">
            {w.users.find((u) => u.id === userId)?.display_name}
            <ChevronDown size={12} />
          </span>
          <button className="top-icon" aria-label="再読み込み" onClick={reload}>
            <RefreshCw size={13} />
          </button>
          {configured && (
            <button
              className="top-icon"
              aria-label="ログアウト"
              onClick={() => void browserClient()?.auth.signOut()}
            >
              <LogOut size={13} />
            </button>
          )}
        </div>
      </header>
      {(error || loadError) && (
        <div className="error" role="alert">
          {error || loadError}
          <button onClick={() => setError("")}>閉じる</button>
        </div>
      )}
      <div className="workspace" ref={workspace}>
        <section
          className="panel directory"
          role="region"
          aria-label={axis === "customers" ? "顧客一覧" : `${title}一覧`}
          style={{ flex: customer ? `0 0 ${ratio}%` : "1" }}
        >
          <div className="directory-toolbar">
            <div className="directory-title">
              <Building2 size={20} />
              <h1>{title}</h1>
              <span className="count">
                {axis === "customers" ? `${directory.length}件` : ""}
              </span>
            </div>
            <div className="searchbox">
              <Search size={15} />
              <input
                aria-label="名前で検索"
                placeholder={
                  axis === "customers" ? "取引先名で検索" : "名前で検索"
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              className="button secondary filter-button"
              aria-expanded={filters}
              onClick={() => setFilters(!filters)}
            >
              <Filter size={15} />
              詳細絞り込み
            </button>
            <div className="spacer" />
            {axis === "contract_engineers" && (
              <button
                className="button secondary"
                onClick={() => navigate("engineers")}
              >
                エンジニア一覧
              </button>
            )}
            {axis !== "notifications" && (
              <button
                className="button primary"
                onClick={() =>
                  axis === "contract_engineers"
                    ? setCreateContract(true)
                    : openNew(axis as Table)
                }
              >
                <Plus size={15} />
                新規登録
              </button>
            )}
            <button
              className="icon-button"
              aria-label="一覧のメニュー"
              onClick={() => setFilters(!filters)}
            >
              <MoreHorizontal size={20} />
            </button>
          </div>
          {filters && (
            <div className="filters">
              {axis === "customers" && (
                <>
                  <label>
                    進捗状況
                    <select
                      aria-label="取引状況で絞り込み"
                      value={trade}
                      onChange={(e) => setTrade(e.target.value)}
                    >
                      <option value="">すべて</option>
                      {forms.customers.fields
                        .find((f) => f.key === "trade_status")!
                        .options!.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    担当者
                    <select
                      aria-label="営業担当で絞り込み"
                      value={sales}
                      onChange={(e) => setSales(e.target.value)}
                    >
                      <option value="">すべて</option>
                      {w.users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => setShowDeleted(e.target.checked)}
                />
                削除・保管済み
              </label>
            </div>
          )}
          {axis === "customers" ? (
            <div className="directory-table">
              <Spreadsheet
                label="取引先一覧"
                rows={directory}
                columns={customerColumns}
                rowLabel={(r) => String(r.name)}
                onSelect={(row) => {
                  setSelected(row.id);
                  setRelated(null);
                }}
                selectedId={selected}
                actions={(row) => (
                  <button
                    className="cell-action"
                    aria-label={`${row.name}の詳細・履歴`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEdit({ table: "customers", row });
                    }}
                  >
                    <MoreHorizontal size={15} />
                  </button>
                )}
              />
            </div>
          ) : (
            <div className="global-sheet">
              {axis === "activities" && activityTabs}
              {globalContent()}
            </div>
          )}
        </section>
        {customer && (
          <>
            <div
              className="splitter"
              role="separator"
              aria-label="一覧と詳細の高さ"
              aria-orientation="horizontal"
              tabIndex={0}
              aria-valuemin={25}
              aria-valuemax={65}
              aria-valuenow={ratio}
              onKeyDown={(e) => {
                if (["Home", "End", "ArrowUp", "ArrowDown"].includes(e.key)) {
                  e.preventDefault();
                  setRatio((r) =>
                    e.key === "Home"
                      ? 25
                      : e.key === "End"
                        ? 65
                        : Math.max(
                            25,
                            Math.min(65, r + (e.key === "ArrowDown" ? 5 : -5)),
                          ),
                  );
                }
              }}
              onPointerDown={(e) =>
                e.currentTarget.setPointerCapture(e.pointerId)
              }
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  const box = workspace.current!.getBoundingClientRect();
                  setRatio(
                    Math.max(
                      25,
                      Math.min(
                        65,
                        Math.round(((e.clientY - box.top) / box.height) * 100),
                      ),
                    ),
                  );
                }
              }}
              onPointerUp={(e) =>
                e.currentTarget.releasePointerCapture(e.pointerId)
              }
            />
            <div className="detail-workspace">
              <section className="panel customer-detail">
                <header className="customer-heading">
                  <ChevronDown size={16} />
                  <h2>{customer.name}</h2>
                  {customer.website && (
                    <a
                      href={
                        /^https?:\/\//.test(String(customer.website))
                          ? String(customer.website)
                          : undefined
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Link size={15} />
                      {customer.website}
                    </a>
                  )}
                  {customer.address && (
                    <span className="customer-location">
                      <MapPin size={15} />
                      {customer.address}
                    </span>
                  )}
                  <div className="spacer" />
                  <button
                    className="icon-button"
                    aria-label="取引先の詳細・履歴"
                    onClick={() =>
                      setEdit({ table: "customers", row: customer })
                    }
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="詳細を閉じる"
                    onClick={() => setSelected("")}
                  >
                    <X size={16} />
                  </button>
                </header>
                <div className="detail-tabs">
                  {(
                    [
                      { id: "profile", label: "基本情報" },
                      { id: "contacts", label: "担当者" },
                      {
                        id: "projects",
                        label: `案件（${customerRows("projects").length}）`,
                      },
                      {
                        id: "contracts",
                        label: `契約エンジニア（${activeCount(w, customer.id)}）`,
                      },
                      { id: "activities", label: "活動履歴" },
                      { id: "tasks", label: "タスク" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      className={tab === item.id ? "active" : ""}
                      onClick={() => setTab(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                  <button disabled>ファイル</button>
                  <div className="spacer" />
                  <button
                    className="button primary compact-edit"
                    onClick={() => {
                      const first = document.querySelector<HTMLElement>(
                        '.customer-detail [data-sheet-cell][aria-readonly="false"]',
                      );
                      first?.focus();
                      first?.dispatchEvent(
                        new KeyboardEvent("keydown", {
                          key: "Enter",
                          bubbles: true,
                        }),
                      );
                    }}
                  >
                    <PencilLine size={14} />
                    編集
                  </button>
                </div>
                <div className="detail-content">
                  {tab === "profile" ? (
                    <CustomerProfile
                      w={w}
                      customer={customer}
                      save={saveCell}
                      onEdit={setEdit}
                      onAddContact={() => openNew("customer_contacts")}
                    />
                  ) : tab === "contracts" ? (
                    <>
                      <div className="mock-section-heading">
                        <FileText size={16} />
                        <h3>契約エンジニア</h3>
                        <button
                          className="button primary"
                          onClick={() => setCreateContract(true)}
                        >
                          <Plus size={14} />
                          契約エンジニアを追加
                        </button>
                      </div>
                      <ContractEngineers
                        w={w}
                        customerId={customer.id}
                        saveCell={saveCell}
                        onEdit={(table, row) =>
                          table === "contracts"
                            ? openNew("contract_periods", {
                                contract_id: row.id,
                              })
                            : setEdit({ table, row })
                        }
                        onRenew={renew}
                        onRelated={(row) =>
                          linkFilter({ table: "contracts", id: row.id })
                        }
                      />
                    </>
                  ) : (
                    <>
                      {tab === "projects" ? (
                        <>
                          <div className="mock-section-heading">
                            <FileText size={16} />
                            <h3>案件</h3>
                            <button
                              className="button primary"
                              onClick={() => openNew("projects")}
                            >
                              案件を追加
                            </button>
                          </div>
                          {business("projects", customerRows("projects"))}
                          <div className="mock-section-heading">
                            <FileText size={16} />
                            <h3>商談</h3>
                            <button
                              className="button primary"
                              onClick={() => openNew("deals")}
                            >
                              商談を追加
                            </button>
                          </div>
                          {business("deals", customerRows("deals"))}
                        </>
                      ) : (
                        <>
                          <div className="mock-section-heading">
                            <FileText size={16} />
                            <h3>
                              {tab === "contacts"
                                ? "担当者"
                                : tab === "activities"
                                  ? "活動履歴"
                                  : "タスク"}
                            </h3>
                            <button
                              className="button primary"
                              onClick={() =>
                                openNew(
                                  tab === "contacts"
                                    ? "customer_contacts"
                                    : tab === "activities"
                                      ? "activities"
                                      : "tasks",
                                )
                              }
                            >
                              追加
                            </button>
                          </div>
                          {business(
                            tab === "contacts"
                              ? "customer_contacts"
                              : tab === "activities"
                                ? "activities"
                                : "tasks",
                            customerRows(
                              tab === "contacts"
                                ? "customer_contacts"
                                : tab === "activities"
                                  ? "activities"
                                  : "tasks",
                            ),
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </section>
              <section className="panel activity-panel">
                <div className="activity-head">
                  <h2>
                    <ContactRound size={19} />
                    活動
                  </h2>
                  {activityTabs}
                  <button
                    className="button primary"
                    onClick={() => openNew("activities")}
                  >
                    <Plus size={14} />
                    活動を追加
                  </button>
                  <button
                    className="icon-button"
                    aria-label="活動のメニュー"
                    onClick={() => setShowDeleted(!showDeleted)}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </div>
                {related && (
                  <div className="related-filter">
                    <span>関連する活動</span>
                    <button onClick={() => setRelated(null)}>
                      絞り込みを解除
                    </button>
                  </div>
                )}
                <div className="activity-content">
                  {business("activities", activities())}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
      {edit && (
        <EntityEditor
          key={`${edit.table}:${edit.row.id}`}
          w={w}
          table={edit.table}
          initial={edit.row}
          customerId={customer?.id || ""}
          userId={userId}
          onClose={() => setEdit(null)}
          save={async (command) => {
            await save(command);
            if (command.kind === "save" && command.table === "customers") {
              setAxis("customers");
              setSelected(command.row.id);
            }
            setEdit(null);
          }}
        />
      )}
      {createContract && (
        <ContractCreate
          w={w}
          customerId={customer?.id || ""}
          userId={userId}
          save={save}
          onClose={() => setCreateContract(false)}
        />
      )}
    </main>
  );
}
