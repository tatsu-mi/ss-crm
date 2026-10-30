import type { SansanCompany } from "./sansan";
import type { Workspace } from "./model";
import { newRow } from "./forms";
import { applyCommand, runReminders } from "./domain";

export type DemoWorkspace = Workspace & {
  demo_sansan?: {
    companies: Record<string, string>;
    people: Record<string, string>;
  };
};
export function importDemoCompany(
  workspace: DemoWorkspace,
  actor: string,
  company: SansanCompany,
  customerId: string | null,
  choices: { personId: string; contactId: string | null }[],
): DemoWorkspace {
  if (
    !company ||
    company.warning ||
    workspace.demo_sansan?.companies[company.id]
  )
    throw new Error("会社が見つからないか、取り込み済みです。");
  if (
    choices.length !== company.cards.length ||
    company.cards.some((c) => !choices.some((x) => x.personId === c.personId))
  )
    throw new Error("担当者の選択が不正です。");
  let next: DemoWorkspace = structuredClone(workspace);
  const links = (next.demo_sansan ||= { companies: {}, people: {} });
  if (company.cards.some((c) => c.personId && links.people[c.personId]))
    throw new Error("担当者は連携済みです。");
  if (customerId) {
    if (!next.customers.some((c) => c.id === customerId && !c.archived_at))
      throw new Error("取引先が利用できません。");
  } else {
    const first = company.cards[0];
    const row = newRow("customers", {
      name: company.name,
      website: first.url,
      phone: first.tel,
      address: first.address,
    });
    next = applyCommand(
      next,
      { kind: "save", table: "customers", row, expected_version: 0 },
      actor,
    );
    customerId = row.id;
  }
  for (const c of company.cards) {
    const choice = choices.find((x) => x.personId === c.personId)!;
    let id = choice.contactId;
    if (id) {
      if (
        !next.customer_contacts.some(
          (x) => x.id === id && x.customer_id === customerId && !x.archived_at,
        )
      )
        throw new Error("担当者が利用できません。");
    } else {
      const row = newRow("customer_contacts", {
        customer_id: customerId,
        name: [c.lastName, c.firstName].filter(Boolean).join(" "),
        department: c.departmentName,
        position: c.title,
        email: c.email,
        phone: c.mobile,
      });
      next = applyCommand(
        next,
        { kind: "save", table: "customer_contacts", row, expected_version: 0 },
        actor,
      );
      id = row.id;
    }
    (next.demo_sansan ||= { companies: {}, people: {} }).people[c.personId!] =
      id;
  }
  (next.demo_sansan ||= { companies: {}, people: {} }).companies[company.id] =
    customerId;
  return runReminders(next) as DemoWorkspace;
}
