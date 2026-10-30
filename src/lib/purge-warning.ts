import type { Table } from "./model";
import { forms } from "./forms";

const affected: Record<Table, string> = {
  activity_templates: "テンプレートとその変更履歴",
  customers:
    "取引先、担当者、参画関係、契約、参画エンジニア、契約期間、活動、タスク、通知、Sansan連携情報",
  engineers:
    "エンジニア、参画関係、参画エンジニア、契約期間、それらに紐づくタスク・通知、活動との紐づけ",
  customer_contacts: "担当者、活動との紐づけ、Sansan連携情報",
  customer_engineer_relations: "参画関係",
  projects: "契約、参画エンジニア、契約期間、活動、タスク、通知",
  project_engineers: "参画エンジニア、契約期間、それらに紐づくタスク・通知",
  contract_periods: "契約期間、それに紐づくタスク・通知",
  activities: "活動、それに紐づくタスク・通知、参加者や他の活動との紐づけ",
  tasks: "タスクとその通知",
};
export function purgeWarning(table: Table) {
  return `${forms[table].label}を完全に削除します。復元できません。\n\n削除される範囲：${affected[table]}。関連データには削除済みでないものも含まれます。\n\n削除対象の変更履歴と、削除対象を参照する他の変更履歴も削除されます。\n\n完全に削除しますか？`;
}
