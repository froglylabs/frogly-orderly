import { afterEach, describe, expect, it, vi } from "vitest";
import { canHashSiteId, normalizeBrokerId, siteIdForBroker, siteIdFromOption } from "../src/siteId";
import vectors from "./site-id-vectors.json";

/** Frogly's server must derive exactly these values. The e2e check reads the same file. */
const VECTORS: Array<[string, string]> = Object.entries(vectors);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("siteIdForBroker", () => {
  it("has the fixed vectors", () => {
    expect(VECTORS).toHaveLength(3);
    expect(vectors.alpix).toBe("3eea9c91-59e4-542b-b897-b824bf91652f");
  });

  it.each(VECTORS)("derives the site ID of %s", async (brokerId, expected) => {
    expect(await siteIdForBroker(brokerId)).toBe(expected);
  });

  it("produces a version 5 UUID with the RFC 9562 variant", async () => {
    const id = (await siteIdForBroker("frogly-test")) as string;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("returns null when crypto.subtle is missing", async () => {
    vi.stubGlobal("crypto", {});
    expect(canHashSiteId()).toBe(false);
    expect(await siteIdForBroker("frogly-test")).toBeNull();
  });
});

describe("normalizeBrokerId", () => {
  it("trims and lowercases", () => {
    expect(normalizeBrokerId("  Frogly-Test ")).toBe("frogly-test");
  });

  it.each([
    ["no value", undefined],
    ["null", null],
    ["a number", 42],
    ["empty", ""],
    ["blank", "   "],
    ["demo", "demo"],
    ["DEMO", "DEMO"],
    ["one character", "a"],
    ["too long", "a".repeat(65)],
    ["a space inside", "al pix"],
    ["a dot", "al.pix"],
    ["a slash", "al/pix"],
    ["a quote", 'al"pix'],
    ["an angle bracket", "<frogly-test>"],
  ])("rejects %s", (_name, value) => {
    expect(normalizeBrokerId(value)).toBeNull();
  });

  it("accepts the longest and shortest valid shapes", () => {
    expect(normalizeBrokerId("ab")).toBe("ab");
    expect(normalizeBrokerId("a".repeat(64))).toBe("a".repeat(64));
    expect(normalizeBrokerId("my_dex-01")).toBe("my_dex-01");
  });
});

describe("siteIdFromOption", () => {
  it("accepts a well-formed site ID as is", () => {
    expect(siteIdFromOption("9cbe5e94-051b-5a1e-b497-ddc1c444ebc2")).toBe(
      "9cbe5e94-051b-5a1e-b497-ddc1c444ebc2",
    );
    expect(siteIdFromOption("Site_ID-8")).toBe("Site_ID-8");
  });

  it.each([
    ["no value", undefined],
    ["a number", 12345678],
    ["too short", "abcdefg"],
    ["too long", "a".repeat(81)],
    ["a space", "abcd efgh"],
    ["a dot", "abcd.efgh"],
  ])("ignores %s", (_name, value) => {
    expect(siteIdFromOption(value)).toBeNull();
  });
});
