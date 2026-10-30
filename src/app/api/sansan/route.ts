import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { AccessError, authenticatedClient } from "@/lib/server-store";
import { fetchSansanCards } from "@/lib/sansan-fetch";
import {
  groupCards,
  filterCardsByDepartment,
  filterCardsByOwner,
  parseOrganizationCsv,
  type SansanOrganization,
} from "@/lib/sansan";

export const dynamic = "force-dynamic";
async function organization(): Promise<SansanOrganization> {
  const key = process.env.SANSAN_API_KEY;
  if (!key) throw new Error("SANSAN_API_KEYが設定されていません。");
  async function csv(path: string) {
    const response = await fetch(
      `https://api.sansan.com/v6.0/organization/${path}?delimiter=comma`,
      {
        headers: { "X-Sansan-Api-Key": key! },
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok)
      throw new Error(
        `Sansanの組織情報を取得できません（HTTP ${response.status}）。APIキーの所有者にシステム管理者権限が必要です。`,
      );
    return parseOrganizationCsv(
      await response.text(),
      path === "users"
        ? ["UserId", "DepartmentId"]
        : ["DepartmentId", "DepartmentName", "ParentDepartmentId"],
    );
  }
  const [departments, users] = await Promise.all([
    csv("departments"),
    csv("users"),
  ]);
  if (
    departments.some(
      (d) =>
        !("DepartmentId" in d) ||
        !("DepartmentName" in d) ||
        !("ParentDepartmentId" in d),
    ) ||
    users.some((u) => !("UserId" in u) || !("DepartmentId" in u))
  )
    throw new Error("Sansanの組織情報の形式が不正です。");
  return {
    departments: departments
      .filter((d) => d.DepartmentId)
      .map((d) => ({
        id: d.DepartmentId,
        name: d.DepartmentName,
        parentId: d.ParentDepartmentId,
      })),
    users: users
      .filter((u) => u.UserId)
      .map((u) => ({
        id: u.UserId,
        name: u.UserName || u.UserId,
        departmentIds: u.DepartmentId.split(";")
          .map((x) => x.trim())
          .filter(Boolean),
      })),
  };
}
async function linked(
  db: Awaited<ReturnType<typeof authenticatedClient>>["db"],
  table: string,
  column: string,
) {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from(table)
      .select(column)
      .order(column)
      .range(offset, offset + 999);
    if (error) throw new Error("連携情報を読み込めませんでした。");
    for (const row of data as unknown as Record<string, string>[])
      ids.add(row[column]);
    if (data.length < 1000) break;
  }
  return ids;
}
function fail(e: unknown) {
  return NextResponse.json(
    { error: (e as Error).message },
    {
      status: e instanceof AccessError ? e.status : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
export async function GET(request: Request) {
  try {
    const demo =
      !process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const password = process.env.SANSAN_DEMO_PASSWORD;
    let db: Awaited<ReturnType<typeof authenticatedClient>>["db"] | null = null;
    if (demo) {
      const provided = request.headers.get("x-sansan-demo-password") || "";
      if (!password)
        throw new AccessError("SANSAN_DEMO_PASSWORDを設定してください。", 503);
      const a = Buffer.from(provided),
        b = Buffer.from(password);
      if (a.length !== b.length || !timingSafeEqual(a, b))
        throw new AccessError("デモ用パスワードが正しくありません。", 401);
    } else {
      ({ db } = await authenticatedClient(request));
    }
    if (new URL(request.url).searchParams.has("metadata")) {
      const org = await organization();
      return NextResponse.json(
        { departments: org.departments, users: org.users },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const departmentId =
      new URL(request.url).searchParams.get("departmentId") || "";
    const ownerId = new URL(request.url).searchParams.get("ownerId") || "";
    const [all, companies, people, orgResult] = await Promise.all([
      fetchSansanCards(process.env.SANSAN_API_KEY, demo),
      db
        ? linked(db, "sansan_companies", "company_id")
        : Promise.resolve(new Set<string>()),
      db
        ? linked(db, "sansan_people", "person_id")
        : Promise.resolve(new Set<string>()),
      organization()
        .then((value) => ({ value, error: "" }))
        .catch((e) => ({ value: null, error: (e as Error).message })),
    ]);
    if (departmentId && !orgResult.value) throw new Error(orgResult.error);
    const scoped = orgResult.value
      ? filterCardsByDepartment(all, orgResult.value, departmentId)
      : all;
    const groups = groupCards(filterCardsByOwner(scoped, ownerId))
      .filter((c) => !companies.has(c.id))
      .map((c) => ({
        ...c,
        warning:
          c.warning ||
          (c.cards.some((x) => x.personId && people.has(x.personId))
            ? "連携済みの人物が含まれます。"
            : ""),
      }));
    return NextResponse.json(
      {
        companies: groups,
        departments: orgResult.value?.departments || [],
        organizationError: orgResult.error,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    const { db } = await authenticatedClient(request);
    const raw = await request.text();
    if (raw.length > 2000000) throw new Error("入力が大きすぎます。");
    const inputs = JSON.parse(raw);
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 20)
      throw new Error("入力が不正です。");
    const departmentId = inputs[0]?.departmentId || "";
    const ownerId = inputs[0]?.ownerId || "";
    if (
      typeof departmentId !== "string" ||
      typeof ownerId !== "string" ||
      inputs.some(
        (input) =>
          (input?.departmentId || "") !== departmentId ||
          (input?.ownerId || "") !== ownerId,
      )
    )
      throw new Error("事業部の指定が不正です。");
    const [all, org] = await Promise.all([
      fetchSansanCards(process.env.SANSAN_API_KEY),
      departmentId ? organization() : Promise.resolve(null),
    ]);
    const groups = groupCards(
      filterCardsByOwner(
        org ? filterCardsByDepartment(all, org, departmentId) : all,
        ownerId,
      ),
    );
    const results = [];
    for (const input of inputs) {
      try {
        if (
          typeof input.companyId !== "string" ||
          !Array.isArray(input.contacts) ||
          input.contacts.length > 5000
        )
          throw new Error("入力が不正です。");
        const group = groups.find((c) => c.id === input.companyId);
        if (!group || group.warning)
          throw new Error(
            group?.warning || "会社が見つかりません。再取得してください。",
          );
        if (
          JSON.stringify(input.snapshot) !==
          JSON.stringify({ name: group.name, cards: group.cards })
        )
          throw new Error("名刺が変更されました。再取得して確認してください。");
        const choices = new Map<string, string | null>();
        for (const choice of input.contacts) {
          if (
            typeof choice.personId !== "string" ||
            (choice.contactId !== null &&
              typeof choice.contactId !== "string") ||
            choices.has(choice.personId)
          )
            throw new Error("担当者の選択が不正です。");
          choices.set(choice.personId, choice.contactId);
        }
        if (
          choices.size !== group.cards.length ||
          group.cards.some((c) => !c.personId || !choices.has(c.personId))
        )
          throw new Error("名刺が変更されました。再取得して確認してください。");
        const first = group.cards[0];
        const payload = {
          company_id: group.id,
          customer_id: input.customerId || null,
          name: group.name,
          website: first.url,
          phone: first.tel,
          address: first.address,
          contacts: group.cards.map((c) => ({
            person_id: c.personId,
            card_id: c.id,
            contact_id: choices.get(c.personId!),
            name: [c.lastName, c.firstName].filter(Boolean).join(" "),
            department: c.departmentName,
            position: c.title,
            email: c.email,
            phone: c.mobile,
          })),
        };
        const { error } = await db.rpc("crm_import_sansan", { payload });
        if (error) throw new Error(error.message);
        results.push({ companyId: input.companyId, ok: true });
      } catch (e) {
        results.push({
          companyId: input?.companyId,
          ok: false,
          error: (e as Error).message,
        });
      }
    }
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
