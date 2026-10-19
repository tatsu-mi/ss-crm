import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PORT || 3000);
const children = new Set();
let temporaryDirectory;
let stopping = false;
let app;
let restarting = false;
let input;
const origin = `http://127.0.0.1:${port}`;

function launch(command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    detached: true,
  });
  children.add(child);
  child.finished = new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  return child;
}

function signalChild(child, signal) {
  if (!child.pid) return;
  try {
    // npmやNext.jsが生成した子プロセスもまとめて停止する。
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

async function finish(code) {
  if (stopping) return;
  stopping = true;
  input?.close();
  for (const child of children) signalChild(child, "SIGTERM");
  const timer = setTimeout(() => {
    for (const child of children) signalChild(child, "SIGKILL");
  }, 5000);
  await Promise.all([...children].map((child) => child.finished));
  clearTimeout(timer);
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  process.exit(code);
}

process.once("SIGINT", () => void finish(130));
process.once("SIGTERM", () => void finish(143));

async function run(command, args) {
  const child = launch(command, args);
  const result = await child.finished;
  children.delete(child);
  if (stopping) return;
  if (result.error) throw result.error;
  if (result.code !== 0) {
    throw new Error(
      `${command} が終了しました (${result.signal || result.code})`,
    );
  }
}

async function stopApp() {
  if (!app) return;
  const child = app;
  app = undefined;
  signalChild(child, "SIGTERM");
  const timer = setTimeout(() => signalChild(child, "SIGKILL"), 5000);
  await child.finished;
  clearTimeout(timer);
  children.delete(child);
}

async function startApp() {
  const child = launch(process.execPath, [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ]);
  app = child;
  void child.finished.then(() => {
    if (!stopping && !restarting && app === child) {
      console.error(
        "CRMが停止しました。公開URLは維持しています。r + Enterで再起動できます。",
      );
    }
  });
  const deadline = Date.now() + 60_000;
  while (!stopping) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("CRMが起動前に終了しました。");
    }
    try {
      const response = await fetch(origin, {
        signal: AbortSignal.timeout(1000),
      });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      // 起動完了まで待つ。
    }
    if (Date.now() >= deadline) {
      throw new Error("60秒以内にCRMの起動を確認できませんでした。");
    }
    await delay(250);
  }
}

async function restartApp() {
  if (stopping || restarting) return;
  restarting = true;
  try {
    console.log(
      "公開URLを維持してCRMを更新します。ビルド・再起動中はアクセスできません。",
    );
    // 稼働中のNext.jsが使う.nextをビルドで上書きする前に停止する。
    await stopApp();
    if (stopping) return;
    await run("npm", ["run", "build"]);
    if (stopping) return;
    await startApp();
    if (!stopping)
      console.log("CRMの更新が完了しました。同じ公開URLでアクセスできます。");
  } catch (error) {
    if (!stopping) {
      await stopApp();
      console.error(
        `${error.message}\n公開URLは維持しています。修正後、r + Enterで再試行してください。`,
      );
    }
  } finally {
    restarting = false;
  }
}

async function main() {
  if (process.platform === "win32") {
    throw new Error("このスクリプトはLinux・macOS・WSLで実行してください。");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORTは1〜65535の整数にしてください。");
  }
  try {
    await run("cloudflared", ["--version"]);
  } catch {
    throw new Error(
      "cloudflaredを実行できません。インストールしてPATHに追加してください。\nhttps://developers.cloudflare.com/tunnel/downloads/",
    );
  }

  // 使用中のポートにある別アプリを誤って公開しない。
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error) =>
      reject(
        new Error(
          `ポート${port}を使用できません (${error.code})。使用状況・実行権限を確認するか、PORTで変更してください。`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });

  console.log("CRMをビルドします…");
  await run("npm", ["run", "build"]);
  if (stopping) return;

  await startApp();
  if (stopping) return;

  // Named Tunnelの既存設定を読み込まず、変更もしない。
  temporaryDirectory = await mkdtemp(join(tmpdir(), "crm-share-"));
  const config = join(temporaryDirectory, "config.yml");
  await writeFile(config, "{}\n");
  if (stopping) return;
  console.log(
    "Quick Tunnelを起動します。ログのhttps://….trycloudflare.comが公開URLです。",
  );
  console.log(
    "r + EnterでCRMだけ再ビルド・再起動します。Ctrl+Cで公開を終了します。",
  );
  const tunnel = launch("cloudflared", [
    "tunnel",
    "--config",
    config,
    "--url",
    origin,
  ]);
  input = createInterface({ input: process.stdin });
  input.on("line", (line) => {
    if (line.trim().toLowerCase() === "r") void restartApp();
  });
  const result = await tunnel.finished;
  if (!stopping) {
    throw (
      result.error || new Error("Quick Tunnelが終了したため公開を停止します。")
    );
  }
}

main().catch(async (error) => {
  if (!stopping) console.error(error.message);
  await finish(1);
});
