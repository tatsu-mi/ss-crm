import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PORT || 3000);
const children = new Set();
let temporaryDirectory;
let stopping = false;

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

  const app = launch(process.execPath, [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ]);
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (true) {
    if (stopping) return;
    if (app.exitCode !== null || app.signalCode !== null) {
      throw new Error("CRMが起動前に終了しました。");
    }
    try {
      const response = await fetch(origin, {
        signal: AbortSignal.timeout(1000),
      });
      await response.body?.cancel();
      if (response.ok) break;
    } catch {
      // 起動完了まで待つ。
    }
    if (Date.now() >= deadline) {
      throw new Error("60秒以内にCRMの起動を確認できませんでした。");
    }
    await delay(250);
  }
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
    "終了するにはCtrl+Cを押してください。公開URLは起動ごとに変わります。",
  );
  const tunnel = launch("cloudflared", [
    "tunnel",
    "--config",
    config,
    "--url",
    origin,
  ]);
  const result = await Promise.race([app.finished, tunnel.finished]);
  if (!stopping) {
    throw (
      result.error ||
      new Error("CRMまたはQuick Tunnelが終了したため公開を停止します。")
    );
  }
}

main().catch(async (error) => {
  if (!stopping) console.error(error.message);
  await finish(1);
});
