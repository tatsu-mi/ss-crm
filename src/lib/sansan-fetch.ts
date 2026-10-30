import type { SansanCard } from "./sansan";

export async function fetchSansanCards(key: string | undefined, demo = false) {
  if (!key) throw new Error("SANSAN_API_KEYが設定されていません。");
  const all: SansanCard[] = [];
  let token = "";
  do {
    const url = new URL("https://api.sansan.com/v6.0/bizCards/search");
    if (token) url.searchParams.set("nextPageToken", token);
    else {
      url.searchParams.set("range", "all");
      url.searchParams.set("entryStatus", "completed");
      url.searchParams.set("limit", demo ? "10" : "300");
      if (demo) {
        url.searchParams.set("orderBy", "registeredAt");
        url.searchParams.set("orderDirection", "desc");
      }
    }
    let response: Response | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(url, {
        headers: { "X-Sansan-Api-Key": key! },
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });
      if (response.status !== 429 && response.status < 500) break;
      if (attempt < 3) {
        const body = await response
          .clone()
          .json()
          .catch(() => ({}));
        const retry = Number(
          body?.retry_after ?? body?.error?.[0]?.retry_after ?? 0,
        );
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(10000, Math.max(500 * 2 ** attempt, retry * 1000)),
          ),
        );
      }
    }
    if (!response?.ok)
      throw new Error(
        `Sansanから取得できませんでした（HTTP ${response?.status ?? "不明"}）。APIキーと権限を確認してください。`,
      );
    const page = await response.json();
    if (
      !Array.isArray(page.data) ||
      typeof page.hasMore !== "boolean" ||
      (page.hasMore &&
        (typeof page.nextPageToken !== "string" ||
          !page.nextPageToken ||
          page.nextPageToken === token))
    )
      throw new Error("Sansanからの応答が不正です。");
    all.push(...(demo ? page.data.slice(0, 10) : page.data));
    token = !demo && page.hasMore ? page.nextPageToken : "";
  } while (token);
  return all;
}
