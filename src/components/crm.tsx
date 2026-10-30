"use client";
import { useRef, useState } from "react";
import {
  Building2,
  Users,
  BriefcaseBusiness,
  ContactRound,
  Activity,
  Folder,
  ChartNoAxesCombined,
  Mail,
  Search,
  Bell,
  Plus,
  PencilLine,
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
import { SettingsMenu } from "./settings-menu";
import { TemplateSettings } from "./template-settings";
import { EntityEditor } from "./entity-editor";
import { BusinessTable } from "./business-table";
import { CustomerProfile } from "./customer-profile";
import { ProjectEngineers } from "./project-engineers";
import { SansanImport } from "./sansan-import";
export function Crm() {
  const data = useWorkspace();
  if (data.loading)
    return (
      <main className="loading">
        <h1>Tatsumi SS CRM</h1>
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
      importDemo={data.importDemo}
      loadError={data.error}
    />
  );
}
type Axis =
  | "customers"
  | "engineers"
  | "customer_contacts"
  | "projects"
  | "activities"
  | "tasks"
  | "notifications";
type Tab =
  "profile" | "contacts" | "projects" | "members" | "activities" | "tasks";
function WorkspaceView({
  w,
  userId,
  save,
  reload,
  importDemo,
  loadError,
}: {
  w: Workspace;
  userId: string;
  save: (c: Command) => Promise<void>;
  reload: () => void;
  importDemo: (
    company: import("@/lib/sansan").SansanCompany,
    customerId: string | null,
    contacts: { personId: string; contactId: string | null }[],
  ) => Promise<void>;
  loadError: string;
}) {
  const [settings, setSettings] = useState(false);
  const [sansan, setSansan] = useState(false);
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
    [edit, setEdit] = useState<{
      table: Table;
      row: Base;
      duplicateOf?: string;
    } | null>(null),
    [related, setRelated] = useState<{ table: Table; id: string } | null>(null),
    [error, setError] = useState(""),
    [ratio, setRatio] = useState(49),
    [detailRatio, setDetailRatio] = useState(50);
  const workspace = useRef<HTMLDivElement>(null);
  const detailWorkspace = useRef<HTMLDivElement>(null);
  const customer =
    axis === "customers"
      ? w.customers.find((c) => c.id === selected)
      : undefined;
  const date = (value: Value | undefined) =>
    value ? String(value).slice(0, 10).replaceAll("-", "/") : "—";
  function navigate(next: Axis) {
    setSansan(false);
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
        project_engineer_id: p.project_engineer_id,
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
    if (related.table === "activities" && "activity_kind_id" in row)
      return w.activity_relations.some(
        (x) => x.activity_id === row.id && x.related_activity_id === related.id,
      );
    const key = (
      {
        projects: "project_id",
        activities: "activity_id",
      } as Partial<Record<Table, string>>
    )[related.table];
    return key ? row[key] === related.id : true;
  }
  const directory = w.customers.filter(
    (c) =>
      (inactive(c) === showDeleted) &&
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
      label: "稼働エンジニア数",
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
    standardColumn(w, "customers", "sales_user_id", saveCell, "営業", 105),
  ];
  const customerRows = (table: Table) =>
    w[table].filter(
      (row) =>
        customerOf(w, table, row) === customer?.id &&
        (inactive(row) === showDeleted),
    );
  const activities = (all = false) =>
    w.activities
      .filter(
        (a) =>
          (all || a.customer_id === customer?.id) &&
          (inactive(a) === showDeleted) &&
          (!kind ||
            w.activity_kinds.find((k) => k.id === a.activity_kind_id)?.name ===
              kind) &&
          matchesRelated(a),
      )
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const activityTabs = (
    <div className="mock-activity-tabs">
      {["すべて", "商談", "面談", "その他"].map((name) => (
        <button
          key={name}
          className={
            (!kind && name === "すべて") || kind === name ? "active" : ""
          }
          onClick={() => setKind(name === "すべて" ? "" : name)}
        >
          {name}
        </button>
      ))}
    </div>
  );
  const business = (table: Table, rows: Base[], label?: string) => (
    <BusinessTable
      w={w}
      table={table}
      data={rows}
      onEdit={setEdit}
      onDuplicate={
        table === "projects"
          ? (source) =>
              setEdit({
                table: "projects",
                row: newRow("projects", {
                  ...Object.fromEntries(
                    forms.projects.fields.map((f) => [f.key, source[f.key]]),
                  ),
                  name: `${source.name}（コピー）`,
                }),
                duplicateOf: source.id,
              })
          : undefined
      }
      onRelated={table === "projects" ? linkFilter : undefined}
      onRenew={renew}
      saveCell={saveCell}
      label={label}
    />
  );
  function globalContent() {
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
          (inactive(row) === showDeleted) &&
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
      projects: "契約",
      activities: "活動",
      tasks: "自分のタスク",
      notifications: "通知",
    } as const
  )[axis];
  return (
    <main className="app-shell mock-workspace">
      <header className="topbar">
        <a href="/" className="brand">
          Tatsumi SS <span>CRM</span>
        </a>
        <nav aria-label="メインメニュー">
          {(
            [
              { axis: "customers", label: "取引先", icon: Building2 },
              { axis: "projects", label: "契約", icon: BriefcaseBusiness },
              { axis: "engineers", label: "エンジニア", icon: Users },
              { axis: "activities", label: "活動", icon: Activity },
            ] as const
          ).map((item) => (
            <button
              key={item.axis}
              className={!sansan && axis === item.axis ? "active" : ""}
              onClick={() => navigate(item.axis)}
            >
              <item.icon size={15} />
              {item.label}
            </button>
          ))}
          <button
            className={sansan ? "active" : ""}
            onClick={() => setSansan(true)}
          >
            Sansan連携
          </button>
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
          <SettingsMenu
            items={[
              { label: "活動テンプレート", onSelect: () => setSettings(true) },
            ]}
          />
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
      {sansan ? (
        <SansanImport w={w} reload={reload} importDemo={importDemo} />
      ) : (
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
              {axis !== "notifications" && (
                <button
                  className="button primary"
                  onClick={() => openNew(axis as Table)}
                >
                  <Plus size={15} />
                  新規登録
                </button>
              )}
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
                      営業
                      <select
                        aria-label="営業で絞り込み"
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
                  削除済みのみ
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
                              Math.min(
                                65,
                                r + (e.key === "ArrowDown" ? 5 : -5),
                              ),
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
                          Math.round(
                            ((e.clientY - box.top) / box.height) * 100,
                          ),
                        ),
                      ),
                    );
                  }
                }}
                onPointerUp={(e) =>
                  e.currentTarget.releasePointerCapture(e.pointerId)
                }
              />
              <div
                className="detail-workspace"
                ref={detailWorkspace}
                style={{
                  gridTemplateColumns: `minmax(0, ${detailRatio}fr) 7px minmax(0, ${100 - detailRatio}fr)`,
                }}
              >
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
                        <span>{customer.website}</span>
                      </a>
                    )}
                    {customer.address && (
                      <span
                        className="customer-location"
                        title={String(customer.address)}
                      >
                        <MapPin size={15} />
                        <span>{customer.address}</span>
                      </span>
                    )}
                    <div className="customer-heading-actions">
                      <button
                        className="icon-button"
                        aria-label="取引先を編集"
                        onClick={() =>
                          setEdit({ table: "customers", row: customer })
                        }
                      >
                        <PencilLine size={18} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="詳細を閉じる"
                        onClick={() => setSelected("")}
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </header>
                  <div className="detail-tabs">
                    {(
                      [
                        { id: "profile", label: "基本情報" },
                        { id: "contacts", label: "担当者" },
                        {
                          id: "projects",
                          label: `契約（${customerRows("projects").length}）`,
                        },
                        { id: "members", label: "参画エンジニア" },
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
                      />
                    ) : (
                      <>
                        {tab === "projects" ? (
                          <>
                            <div className="mock-section-heading">
                              <FileText size={16} />
                              <h3>契約</h3>
                              <button
                                className="button primary"
                                onClick={() => openNew("projects")}
                              >
                                契約を追加
                              </button>
                            </div>
                            {business("projects", customerRows("projects"))}
                          </>
                        ) : tab === "members" ? (
                          <>
                            <div className="mock-section-heading">
                              <h3>参画エンジニア・契約期間</h3>
                            </div>
                            <ProjectEngineers
                              w={w}
                              customerId={customer.id}
                              saveCell={saveCell}
                              onContract={(row) =>
                                setEdit({ table: "projects", row })
                              }
                              onEdit={(table, row) =>
                                table === "project_engineers"
                                  ? openNew("contract_periods", {
                                      project_engineer_id: row.id,
                                    })
                                  : setEdit({ table, row })
                              }
                              onRenew={renew}
                              onRelated={(row) =>
                                linkFilter({ table: "projects", id: row.id })
                              }
                            />
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
                <div
                  className="detail-splitter"
                  role="separator"
                  aria-label="取引先詳細と活動の幅"
                  aria-orientation="vertical"
                  aria-valuemin={25}
                  aria-valuemax={75}
                  aria-valuenow={detailRatio}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (
                      ["Home", "End", "ArrowLeft", "ArrowRight"].includes(e.key)
                    ) {
                      e.preventDefault();
                      setDetailRatio((r) =>
                        e.key === "Home"
                          ? 25
                          : e.key === "End"
                            ? 75
                            : Math.max(
                                25,
                                Math.min(
                                  75,
                                  r + (e.key === "ArrowRight" ? 5 : -5),
                                ),
                              ),
                      );
                    }
                  }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      const box =
                        detailWorkspace.current!.getBoundingClientRect();
                      const available = box.width - 7;
                      if (available <= 0) return;
                      setDetailRatio(
                        Math.max(
                          25,
                          Math.min(
                            75,
                            Math.round(
                              ((e.clientX - box.left - 3.5) / available) * 100,
                            ),
                          ),
                        ),
                      );
                    }
                  }}
                  onPointerUp={(e) =>
                    e.currentTarget.releasePointerCapture(e.pointerId)
                  }
                />
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
      )}
      {settings && (
        <TemplateSettings
          w={w}
          save={save}
          onClose={() => setSettings(false)}
        />
      )}
      {edit && (
        <EntityEditor
          key={`${edit.table}:${edit.row.id}`}
          w={w}
          table={edit.table}
          initial={edit.row}
          duplicateOf={edit.duplicateOf}
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
    </main>
  );
}
