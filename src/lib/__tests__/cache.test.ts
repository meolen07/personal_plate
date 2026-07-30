import { beforeEach, describe, expect, it } from "vitest";
import {
  cacheGet,
  cacheKey,
  cacheSet,
  cached,
  clearMemoryCache,
} from "@/lib/cache";

describe("cache", () => {
  beforeEach(() => {
    clearMemoryCache();
    delete process.env.REDIS_URL;
  });

  it("builds stable namespaced keys", () => {
    const a = cacheKey("spoonacular:search", { ingredients: ["egg", "milk"] });
    const b = cacheKey("spoonacular:search", { ingredients: ["egg", "milk"] });
    const c = cacheKey("spoonacular:search", { ingredients: ["milk", "egg"] });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith("pp:spoonacular:search:")).toBe(true);
  });

  it("stores and retrieves values from memory fallback", async () => {
    await cacheSet("test:key", { ok: true }, 60);
    await expect(cacheGet<{ ok: boolean }>("test:key")).resolves.toEqual({
      ok: true,
    });
  });

  it("cached() returns loader result and reuses it", async () => {
    let calls = 0;
    const first = await cached("loader:key", 60, async () => {
      calls += 1;
      return { value: 42 };
    });
    const second = await cached("loader:key", 60, async () => {
      calls += 1;
      return { value: 99 };
    });

    expect(first).toEqual({ value: 42 });
    expect(second).toEqual({ value: 42 });
    expect(calls).toBe(1);
  });
});
