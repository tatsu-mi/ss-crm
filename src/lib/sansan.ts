export type SansanCard = {
  id: string;
  companyId: string | null;
  personId: string | null;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  departmentName: string | null;
  title: string | null;
  email: string | null;
  mobile: string | null;
  tel: string | null;
  address: string | null;
  url: string | null;
  exchangeDate: string | null;
  updatedTime: string | null;
  owner: { id: string; name: string } | null;
};
export type SansanCompany = {
  id: string;
  name: string;
  cards: SansanCard[];
  owners: { id: string; name: string }[];
  warning: string;
};

export function groupCards(cards: SansanCard[]): SansanCompany[] {
  const groups = new Map<string, SansanCard[]>();
  for (const card of cards) {
    const key = card.companyId || `missing:${card.id}`;
    groups.set(key, [...(groups.get(key) || []), card]);
  }
  const peopleCompanies = new Map<string, Set<string>>();
  for (const card of cards)
    if (card.personId) {
      const companies = peopleCompanies.get(card.personId) || new Set<string>();
      companies.add(card.companyId || `missing:${card.id}`);
      peopleCompanies.set(card.personId, companies);
    }
  return [...groups.entries()]
    .map(([id, group]) => {
      group.sort(
        (a, b) =>
          (b.exchangeDate || "").localeCompare(a.exchangeDate || "") ||
          (b.updatedTime || "").localeCompare(a.updatedTime || "") ||
          a.id.localeCompare(b.id),
      );
      const seen = new Set<string>();
      const latest = group.filter((c) => {
        const key = c.personId || `missing:${c.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const warning = id.startsWith("missing:")
        ? "会社IDがないため取り込めません。"
        : !group[0].companyName?.trim()
          ? "会社名がないため取り込めません。"
          : latest.some(
                (c) =>
                  !c.personId ||
                  !`${c.lastName || ""}${c.firstName || ""}`.trim(),
              )
            ? "人物IDまたは氏名がない名刺があります。"
            : latest.some(
                  (c) =>
                    c.personId &&
                    (peopleCompanies.get(c.personId)?.size || 0) > 1,
                )
              ? "同じ人物が複数の会社にいます。"
              : "";
      const owners = [
        ...new Map(
          group.filter((c) => c.owner?.id).map((c) => [c.owner!.id, c.owner!]),
        ).values(),
      ];
      return {
        id,
        name: group[0].companyName || "",
        cards: latest,
        owners,
        warning,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export type SansanDepartment = { id: string; name: string; parentId: string };
export type SansanOrganization = {
  departments: SansanDepartment[];
  users: { id: string; name?: string; departmentIds: string[] }[];
};

// Organization API returns CSV, including quoted commas, quotes, and line breaks.
export function parseOrganizationCsv(
  text: string,
  required: string[] = [],
): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && !field) quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("Sansanの組織情報のCSVが不正です。");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift();
  if (!header?.length) throw new Error("Sansanの組織情報のCSVが空です。");
  if (required.some((name) => !header.some((value) => value.trim() === name)))
    throw new Error("Sansanの組織情報の形式が不正です。");
  return rows
    .filter((r) => r.some(Boolean))
    .map((r) =>
      Object.fromEntries(header.map((h, i) => [h.trim(), r[i] || ""])),
    );
}
export function filterCardsByDepartment(
  cards: SansanCard[],
  organization: SansanOrganization,
  departmentId: string,
): SansanCard[] {
  if (!departmentId) return cards;
  if (!organization.departments.some((d) => d.id === departmentId))
    throw new Error("選択した事業部が見つかりません。再取得してください。");
  const ids = new Set([departmentId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const d of organization.departments)
      if (ids.has(d.parentId) && !ids.has(d.id)) {
        ids.add(d.id);
        changed = true;
      }
  }
  const owners = new Set(
    organization.users
      .filter((u) => u.departmentIds.some((d) => ids.has(d)))
      .map((u) => u.id),
  );
  return cards.filter((c) => c.owner?.id && owners.has(c.owner.id));
}

export function filterCardsByOwner(
  cards: SansanCard[],
  ownerId: string,
): SansanCard[] {
  return ownerId ? cards.filter((c) => c.owner?.id === ownerId) : cards;
}
