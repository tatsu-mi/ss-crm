"use client";
import { useCallback, useEffect, useState } from "react";
import { browserClient, configured, invalidConfiguration } from "./supabase";
import { demoWorkspace } from "./demo";
import { applyCommand, runReminders } from "./domain";
import type { Workspace, Command } from "./model";
import { importDemoCompany, type DemoWorkspace } from "./sansan-demo";
import type { SansanCompany } from "./sansan";
const STORAGE = "nexus-crm-demo-v6";
export function useWorkspace() {
  const [w, setW] = useState<Workspace | null>(null),
    [userId, setUserId] = useState(""),
    [token, setToken] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const fetchData = useCallback(async (accessToken: string) => {
    try {
      const response = await fetch("/api/workspace", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setW(data.workspace);
      setUserId(data.userId);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (invalidConfiguration) {
      setError(
        "SupabaseのURLと公開キーを両方設定し、アプリを再起動してください。",
      );
      setLoading(false);
      return;
    }
    const db = browserClient();
    if (!db) {
      try {
        const raw = localStorage.getItem(STORAGE),
          next = runReminders(raw ? JSON.parse(raw) : demoWorkspace());
        localStorage.setItem(STORAGE, JSON.stringify(next));
        setW(next);
        setUserId(next.users[0].id);
      } catch {
        setError(
          "デモデータを読み込めません。ブラウザの保存領域を確認してください。",
        );
      }
      setLoading(false);
      return;
    }
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token || "");
      if (session) void fetchData(session.access_token);
      else {
        setW(null);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchData]);
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => void fetchData(token), 60000);
    return () => clearInterval(timer);
  }, [token, fetchData]);
  const save = useCallback(
    async (command: Command) => {
      if (!w) throw new Error("データを読み込み中です。");
      if (!configured) {
        const raw = localStorage.getItem(STORAGE);
        const base = raw ? (JSON.parse(raw) as Workspace) : w;
        const next = runReminders(applyCommand(base, command, userId));
        localStorage.setItem(STORAGE, JSON.stringify(next));
        setW(next);
      } else {
        const session = await browserClient()!.auth.getSession();
        const accessToken = session.data.session?.access_token;
        if (!accessToken) throw new Error("再ログインしてください。");
        const response = await fetch("/api/workspace", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(command),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setW(data.workspace);
      }
    },
    [w, userId],
  );
  const reload = useCallback(() => {
    if (token) void fetchData(token);
    else window.location.reload();
  }, [token, fetchData]);
  const importDemo = useCallback(
    async (
      company: SansanCompany,
      customerId: string | null,
      contacts: { personId: string; contactId: string | null }[],
    ) => {
      if (configured || !w) throw new Error("デモモードを利用できません。");
      const raw = localStorage.getItem(STORAGE);
      const base = raw ? (JSON.parse(raw) as DemoWorkspace) : w;
      const next = importDemoCompany(
        base,
        userId,
        company,
        customerId,
        contacts,
      );
      localStorage.setItem(STORAGE, JSON.stringify(next));
      setW(next);
    },
    [w, userId],
  );
  return { w, userId, loading, error, save, reload, importDemo };
}
