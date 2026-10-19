export type Value = string | number | boolean | null;
export interface Base {
  [key: string]: Value;
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
}
export interface Customer extends Base {
  name: string;
  name_kana: string | null;
  employee_size: string | null;
  established_on: string | null;
  revenue_scale: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  industry: string | null;
  trade_status: string;
  sales_user_id: string | null;
  notes: string | null;
  archived_at: string | null;
}
export interface Engineer extends Base {
  name: string;
  preferences: string | null;
  archived_at: string | null;
}
export interface Contact extends Base {
  customer_id: string;
  name: string;
  department: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  archived_at: string | null;
}
export interface Relation extends Base {
  customer_id: string;
  engineer_id: string;
  label: string;
  archived_at: string | null;
}
export interface Project extends Base {
  customer_id: string;
  name: string;
  description: string | null;
  required_skills: string | null;
  budget: string | null;
  planned_start_on: string | null;
  sales_user_id: string | null;
  deleted_at: string | null;
}
export interface Deal extends Base {
  customer_id: string;
  project_id: string | null;
  relation_id: string | null;
  sales_user_id: string | null;
  title: string;
  stage: string;
  probability: string | null;
  expected_amount: string | null;
  expected_order_on: string | null;
  planned_start_on: string | null;
  planned_end_on: string | null;
  deleted_at: string | null;
}
export interface ProjectEngineer extends Base {
  project_id: string;
  engineer_id: string;
  deleted_at: string | null;
}
export interface ContractPeriod extends Base {
  project_engineer_id: string;
  starts_on: string;
  ends_on: string;
  billing_rate: string;
  cost: string;
  renewal_status: string;
  notes: string | null;
  deleted_at: string | null;
}
export interface Activity extends Base {
  customer_id: string;
  activity_kind_id: string;
  recorded_by: string;
  project_id: string | null;
  title: string;
  occurred_at: string;
  body: string | null;
  deleted_at: string | null;
}
export interface Task extends Base {
  customer_id: string;
  assignee_user_id: string | null;
  project_id: string | null;
  deal_id: string | null;
  contract_period_id: string | null;
  activity_id: string | null;
  title: string;
  body: string | null;
  due_at: string | null;
  status: string;
  automation_key: string | null;
  deleted_at: string | null;
}
export interface ActivityTemplate extends Base {
  name: string;
  body: string;
  deleted_at: string | null;
}
export interface Tables {
  activity_templates: ActivityTemplate;
  customers: Customer;
  engineers: Engineer;
  customer_contacts: Contact;
  customer_engineer_relations: Relation;
  projects: Project;
  deals: Deal;
  project_engineers: ProjectEngineer;
  contract_periods: ContractPeriod;
  activities: Activity;
  tasks: Task;
}
export type Table = keyof Tables;
export interface AppUser {
  id: string;
  display_name: string;
  role: "admin" | "member";
  disabled_at: string | null;
}
export interface ActivityKind {
  id: string;
  name: string;
  display_order: number;
  archived_at: string | null;
}
export interface Notification {
  id: string;
  task_id: string | null;
  contract_period_id: string | null;
  recipient_user_id: string;
  rule_key: string;
  scheduled_at: string;
  status: string;
  idempotency_key: string;
  delivered_at: string | null;
  read_at: string | null;
}
export interface Revision {
  id: string;
  entity_table: Table;
  entity_id: string;
  version: number;
  operation: string;
  snapshot: {
    row: Base;
    reference_labels?: Record<string, string>;
    participant_labels?: Record<string, string>;
    related_activity_ids?: string[];
    related_activity_labels?: Record<string, string>;
    contact_ids?: string[];
    engineer_ids?: string[];
  };
  changed_by: string | null;
  changed_at: string;
}
export type Workspace = { [K in Table]: Tables[K][] } & {
  users: AppUser[];
  activity_kinds: ActivityKind[];
  activity_relations: { activity_id: string; related_activity_id: string }[];
  activity_contacts: { activity_id: string; contact_id: string }[];
  activity_engineers: { activity_id: string; engineer_id: string }[];
  revisions: Revision[];
  notifications: Notification[];
};
export type Command =
  | { kind: "batch"; commands: Command[] }
  | {
      kind: "save";
      table: Table;
      row: Base;
      expected_version: number;
      related_activity_ids?: string[];
      contact_ids?: string[];
      engineer_ids?: string[];
    }
  | {
      kind: "lifecycle";
      table: Table;
      id: string;
      expected_version: number;
      restore: boolean;
    }
  | { kind: "read_notification"; id: string };
export const tableNames: Table[] = [
  "activity_templates",
  "customers",
  "engineers",
  "customer_contacts",
  "customer_engineer_relations",
  "projects",
  "deals",
  "project_engineers",
  "contract_periods",
  "activities",
  "tasks",
];
export function emptyWorkspace(): Workspace {
  return {
    activity_templates: [],
    customers: [],
    engineers: [],
    customer_contacts: [],
    customer_engineer_relations: [],
    projects: [],
    deals: [],
    project_engineers: [],
    contract_periods: [],
    activities: [],
    tasks: [],
    users: [],
    activity_kinds: [],
    activity_relations: [],
    activity_contacts: [],
    activity_engineers: [],
    revisions: [],
    notifications: [],
  };
}
export const newId = () => crypto.randomUUID();
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
export const addDays = (day: string, days: number) =>
  new Date(Date.parse(day.slice(0, 10)) + days * 86400000)
    .toISOString()
    .slice(0, 10);
export const inactive = (row: Base) => !!(row.archived_at || row.deleted_at);
export const titleOf = (row: Base) =>
  String(
    row.name ||
      row.title ||
      row.label ||
      (row.starts_on ? `${row.starts_on} 〜 ${row.ends_on}` : row.id),
  );
export function customerOf(
  w: Workspace,
  table: Table,
  row: Base,
): string | null {
  if (table === "customers") return row.id;
  if (row.customer_id) return String(row.customer_id);
  if (table === "project_engineers") {
    const project = w.projects.find((p) => p.id === row.project_id);
    return project?.customer_id || null;
  }
  if (table === "contract_periods") {
    const assignment = w.project_engineers.find(
      (x) => x.id === row.project_engineer_id,
    );
    return assignment ? customerOf(w, "project_engineers", assignment) : null;
  }
  return null;
}
export function activeCount(w: Workspace, customer: string, day = today()) {
  return new Set(
    w.contract_periods
      .filter((p) => !inactive(p) && p.starts_on <= day && p.ends_on >= day)
      .flatMap((p) => {
        const assignment = w.project_engineers.find(
          (x) => x.id === p.project_engineer_id && !inactive(x),
        );
        const project = w.projects.find(
          (x) => x.id === assignment?.project_id && !inactive(x),
        );
        return assignment &&
          project?.customer_id === customer &&
          w.engineers.some(
            (e) => e.id === assignment.engineer_id && !inactive(e),
          )
          ? [assignment.engineer_id]
          : [];
      }),
  ).size;
}
