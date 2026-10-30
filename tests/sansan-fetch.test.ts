import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchSansanCards } from "../src/lib/sansan-fetch";

test("demo requests the latest ten cards and does not fetch later pages", async () => {
  const previousFetch = globalThis.fetch,
    previousKey = process.env.SANSAN_API_KEY;
  const urls: URL[] = [];
  process.env.SANSAN_API_KEY = "test-key";
  globalThis.fetch = async (input) => {
    urls.push(new URL(String(input)));
    return Response.json({
      hasMore: true,
      nextPageToken: "next",
      data: Array.from({ length: 10 }, (_, id) => ({ id })),
    });
  };
  try {
    const result = await fetchSansanCards("test-key", true);
    assert.equal(result.length, 10);
    assert.equal(urls.length, 1);
    assert.equal(urls[0].searchParams.get("limit"), "10");
    assert.equal(urls[0].searchParams.get("orderBy"), "registeredAt");
    assert.equal(urls[0].searchParams.get("orderDirection"), "desc");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.SANSAN_API_KEY;
    else process.env.SANSAN_API_KEY = previousKey;
  }
});
test("normal mode continues through pages", async () => {
  const previousFetch = globalThis.fetch,
    previousKey = process.env.SANSAN_API_KEY;
  const urls: URL[] = [];
  process.env.SANSAN_API_KEY = "test-key";
  globalThis.fetch = async (input) => {
    urls.push(new URL(String(input)));
    return Response.json(
      urls.length === 1
        ? { hasMore: true, nextPageToken: "next", data: [{ id: "1" }] }
        : { hasMore: false, data: [{ id: "2" }] },
    );
  };
  try {
    const result = await fetchSansanCards("test-key");
    assert.equal(result.length, 2);
    assert.equal(urls[0].searchParams.get("limit"), "300");
    assert.equal(urls[1].searchParams.get("nextPageToken"), "next");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.SANSAN_API_KEY;
    else process.env.SANSAN_API_KEY = previousKey;
  }
});
