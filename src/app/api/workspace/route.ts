import { NextResponse } from "next/server";
import {
  AccessError,
  authenticatedClient,
  loadWorkspace,
} from "@/lib/server-store";
import { applyCommand } from "@/lib/domain";
import type { Command } from "@/lib/model";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { db, user } = await authenticatedClient(request);
    return NextResponse.json(
      { workspace: await loadWorkspace(db), userId: user.id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: e instanceof AccessError ? e.status : 500 },
    );
  }
}
export async function POST(request: Request) {
  try {
    const { db, user } = await authenticatedClient(request);
    const raw = await request.text();
    if (raw.length > 200000)
      return NextResponse.json(
        { error: "入力が大きすぎます。" },
        { status: 413 },
      );
    const command = JSON.parse(raw) as Command;
    if (
      !command ||
      !["save", "lifecycle", "read_notification", "batch"].includes(
        command.kind,
      )
    )
      throw new Error("操作が不正です。");
    applyCommand(await loadWorkspace(db), command, user.id);
    const { error } = await db.rpc("crm_mutate", { command });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json(
      { workspace: await loadWorkspace(db) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: e instanceof AccessError ? e.status : 400 },
    );
  }
}
