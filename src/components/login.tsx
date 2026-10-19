"use client";
import { useState } from "react";
import { Network, ChevronRight } from "lucide-react";
import { browserClient } from "@/lib/supabase";
export function Login({ error: initialError }: { error: string }) {
  const [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <section className="login-story">
        <div className="brand">
          <Network size={24} /> NEXUS <span>SES CRM</span>
        </div>
        <div>
          <span className="eyebrow">PEOPLE & POSSIBILITIES</span>
          <h1>
            つながりを、
            <br />
            次の可能性へ。
          </h1>
          <p>
            顧客とエンジニアの情報をひとつに。
            <br />
            日々の対話から、次の契約まで。
          </p>
        </div>
        <small>Customer relationships, thoughtfully connected.</small>
      </section>
      <section className="login-panel">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const data = new FormData(e.currentTarget);
            const db = browserClient();
            if (!db) {
              setError("接続設定を確認してください。");
              setBusy(false);
              return;
            }
            const { error } = await db.auth.signInWithPassword({
              email: String(data.get("email")),
              password: String(data.get("password")),
            });
            if (error)
              setError("メールアドレスまたはパスワードを確認してください。");
            setBusy(false);
          }}
        >
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h2>おかえりなさい</h2>
          <p className="muted">チームのアカウントでログインしてください。</p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <label>
            メールアドレス
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="you@company.jp"
            />
          </label>
          <label>
            パスワード
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
            />
          </label>
          <button className="button primary full-width" disabled={busy}>
            {busy ? "ログイン中…" : "ログイン"}
            <ChevronRight size={16} />
          </button>
          <p className="small muted">
            アカウントの発行・パスワード再設定は管理者にお問い合わせください。
          </p>
        </form>
      </section>
    </main>
  );
}
