import { test } from "node:test";
import assert from "node:assert/strict";
import { groupCards, type SansanCard } from "../src/lib/sansan";
const card = (
  id: string,
  personId: string,
  companyId: string | null,
  owner: string,
  date: string,
): SansanCard => ({
  id,
  personId,
  companyId,
  companyName: "会社",
  firstName: "太郎",
  lastName: "山田",
  departmentName: null,
  title: null,
  email: null,
  mobile: null,
  tel: null,
  address: null,
  url: null,
  exchangeDate: date,
  updatedTime: date,
  owner: { id: owner, name: owner },
});
test("groups by company and person while retaining all owners", () => {
  const groups = groupCards([
    card("1", "p", "c", "A", "2020-01-01"),
    card("2", "p", "c", "B", "2022-01-01"),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].cards.length, 1);
  assert.equal(groups[0].cards[0].id, "2");
  assert.deepEqual(groups[0].owners.map((x) => x.id).sort(), ["A", "B"]);
});
test("holds missing company IDs and cross-company persons for review", () => {
  const groups = groupCards([
    card("1", "p", "a", "A", "2020-01-01"),
    card("2", "p", "b", "A", "2022-01-01"),
    card("3", "q", null, "A", "2022-01-01"),
  ]);
  assert.equal(groups.filter((x) => x.warning.includes("複数")).length, 2);
  assert.ok(
    groups.find((x) => x.id === "missing:3")?.warning.includes("会社ID"),
  );
});

test("department filtering includes descendants and concurrent memberships", async () => {
  const { filterCardsByDepartment } = await import("../src/lib/sansan");
  const org = {
    departments: [
      { id: "a", name: "本部", parentId: "" },
      { id: "b", name: "部", parentId: "a" },
      { id: "c", name: "他", parentId: "" },
    ],
    users: [
      { id: "A", departmentIds: ["b", "c"] },
      { id: "B", departmentIds: ["c"] },
    ],
  };
  const cards = [
    card("1", "p", "x", "A", "2020-01-01"),
    card("2", "q", "y", "B", "2020-01-01"),
  ];
  assert.deepEqual(
    filterCardsByDepartment(cards, org, "a").map((x) => x.id),
    ["1"],
  );
  assert.equal(filterCardsByDepartment(cards, org, "").length, 2);
  assert.throws(
    () => filterCardsByDepartment(cards, org, "missing"),
    /見つかりません/,
  );
});
test("organization CSV handles escaped quotes, commas and multiple departments", async () => {
  const { parseOrganizationCsv } = await import("../src/lib/sansan");
  const rows = parseOrganizationCsv(
    '\ufeffUserId,DepartmentId,UserName\r\na,"1;2","姓, ""名"""\r\n',
  );
  assert.deepEqual(rows, [
    { UserId: "a", DepartmentId: "1;2", UserName: '姓, "名"' },
  ]);
  assert.throws(() => parseOrganizationCsv('A\n"oops'), /不正/);
});

test("demo import stores links and prevents duplicates", async () => {
  const { demoWorkspace } = await import("../src/lib/demo");
  const { importDemoCompany } = await import("../src/lib/sansan-demo");
  const base = demoWorkspace();
  const company = groupCards([
    card("card1", "person1", "company1", "a", "2026-01-01"),
  ])[0];
  const choices = [{ personId: "person1", contactId: null }];
  const next = importDemoCompany(
    base,
    base.users[0].id,
    company,
    null,
    choices,
  );
  assert.equal(next.customers.length, base.customers.length + 1);
  assert.equal(
    next.customer_contacts.length,
    base.customer_contacts.length + 1,
  );
  assert.ok(next.demo_sansan?.companies[company.id]);
  assert.throws(
    () => importDemoCompany(next, base.users[0].id, company, null, choices),
    /取り込み済み/,
  );
});

test("demo import links an existing customer without overwriting it", async () => {
  const { demoWorkspace } = await import("../src/lib/demo");
  const { importDemoCompany } = await import("../src/lib/sansan-demo");
  const base = demoWorkspace();
  const customer = base.customers[0];
  const company = groupCards([
    card("card1", "person1", "company1", "a", "2026-01-01"),
  ])[0];
  const next = importDemoCompany(base, base.users[0].id, company, customer.id, [
    { personId: "person1", contactId: null },
  ]);
  assert.equal(next.customers.length, base.customers.length);
  assert.deepEqual(
    next.customers.find((c) => c.id === customer.id),
    customer,
  );
  assert.equal(
    next.customer_contacts.length,
    base.customer_contacts.length + 1,
  );
});
