import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CORE_INTEGRITY, CORE_SRC } from "../src/core";
import { startFrogly } from "../src/start";
import { froglyScripts, resetPage, settle, waitFor } from "./helpers";

const TEST_SITE_ID = "9cbe5e94-051b-5a1e-b497-ddc1c444ebc2";

beforeEach(resetPage);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("startFrogly with broker frogly-test", () => {
  it("adds exactly one script with the exact attributes", async () => {
    startFrogly({ brokerId: "frogly-test" });
    await waitFor(() => froglyScripts().length > 0);

    const scripts = froglyScripts();
    expect(scripts).toHaveLength(1);
    const [script] = scripts;
    expect(script.parentElement).toBe(document.head);
    expect(script.getAttribute("src")).toBe(CORE_SRC);
    expect(script.getAttribute("src")).toBe("https://cdn.frogly.ai/w/core.v6.js");
    expect(script.getAttribute("integrity")).toBe(CORE_INTEGRITY);
    expect(script.getAttribute("integrity")).toBe(
      "sha384-z29wAlCbvQ06jGYHkjK/R7MJkdaD1F4dfOlhsHFy6fPOAII/YzEZsPZDX4NtqIwV",
    );
    expect(script.getAttribute("crossorigin")).toBe("anonymous");
    expect(script.async).toBe(true);
    expect(script.getAttribute("data-cfg")).toBe(TEST_SITE_ID);
    expect(script.getAttribute("data-quiet")).toBe("1");
    // Nothing else: no inline code, no extra attributes.
    expect(script.textContent).toBe("");
    expect(Array.from(script.attributes).map((a) => a.name).sort()).toEqual(
      ["async", "crossorigin", "data-cfg", "data-quiet", "integrity", "src"].sort(),
    );
    // Only the script was added to the page.
    expect(document.head.children).toHaveLength(1);
    expect(document.body.children).toHaveLength(0);
  });
});

describe("startFrogly adds no script for", () => {
  it.each([
    ["no broker ID", {}],
    ["demo", { brokerId: "demo" }],
    ["DEMO", { brokerId: "DEMO" }],
    ["an empty broker ID", { brokerId: "" }],
    ["a broker ID that is too long", { brokerId: "x".repeat(65) }],
    ["a broker ID with characters outside the pattern", { brokerId: "alp!x" }],
    ["a broker ID that is not a string", { brokerId: { id: "frogly-test" } }],
  ])("%s", async (_name, input) => {
    startFrogly(input);
    await settle();
    expect(froglyScripts()).toHaveLength(0);
    expect((window as Window & { __froglyOrderlyStarted?: boolean }).__froglyOrderlyStarted).toBeUndefined();
  });

  it("a missing crypto.subtle", async () => {
    vi.stubGlobal("crypto", {});
    startFrogly({ brokerId: "frogly-test" });
    await settle();
    expect(froglyScripts()).toHaveLength(0);
  });

  it("a page that already loads Frogly itself (old or new form)", async () => {
    for (const src of [
      "https://cdn.frogly.ai/w/core.v4.js",
      "https://cdn.frogly.ai/w/core.v5.js",
      "https://cdn.frogly.ai/w/core.v6.js",
    ]) {
      resetPage();
      const pasted = document.createElement("script");
      pasted.src = src;
      pasted.setAttribute("data-cfg", "pasted-site-id");
      document.head.appendChild(pasted);

      startFrogly({ brokerId: "frogly-test" });
      await settle();
      expect(froglyScripts()).toHaveLength(1);
      expect(froglyScripts()[0]).toBe(pasted);
    }
  });
});

describe("startFrogly runs once", () => {
  it("adds one script however many times it is triggered", async () => {
    for (let i = 0; i < 12; i++) startFrogly({ brokerId: "frogly-test" });
    await waitFor(() => froglyScripts().length > 0);
    await settle();
    expect(froglyScripts()).toHaveLength(1);
  });

  it("sets the window flag synchronously, before the hash is computed", async () => {
    startFrogly({ brokerId: "frogly-test" });
    expect((window as Window & { __froglyOrderlyStarted?: boolean }).__froglyOrderlyStarted).toBe(true);
    expect(froglyScripts()).toHaveLength(0); // the digest has not resolved yet
    // Let the pending digest finish so it cannot leak a script into the next test.
    await settle();
  });

  it("lets a later trigger start Frogly when the first one had no broker ID", async () => {
    startFrogly({});
    startFrogly({ brokerId: "demo" });
    await settle();
    expect(froglyScripts()).toHaveLength(0);

    startFrogly({ brokerId: "frogly-test" });
    await waitFor(() => froglyScripts().length > 0);
    expect(froglyScripts()[0].getAttribute("data-cfg")).toBe(TEST_SITE_ID);
  });
});

describe("startFrogly with a site ID passed in code", () => {
  it("uses the site ID instead of the broker ID, without hashing", () => {
    startFrogly({ siteId: "my-existing-site-01", brokerId: "frogly-test" });
    expect(froglyScripts()).toHaveLength(1);
    expect(froglyScripts()[0].getAttribute("data-cfg")).toBe("my-existing-site-01");
  });

  it("ignores an invalid site ID and falls back to the broker ID", async () => {
    startFrogly({ siteId: "bad id", brokerId: "frogly-test" });
    await waitFor(() => froglyScripts().length > 0);
    expect(froglyScripts()[0].getAttribute("data-cfg")).toBe(TEST_SITE_ID);
  });

  it("ignores a site ID that is not a string", async () => {
    startFrogly({ siteId: 12345678, brokerId: "frogly-test" });
    await waitFor(() => froglyScripts().length > 0);
    expect(froglyScripts()[0].getAttribute("data-cfg")).toBe(TEST_SITE_ID);
  });
});

describe("startFrogly fails open", () => {
  it("does not throw when crypto.subtle.digest throws", async () => {
    vi.stubGlobal("crypto", {
      subtle: {
        digest: () => {
          throw new Error("digest exploded");
        },
      },
    });
    expect(() => startFrogly({ brokerId: "frogly-test" })).not.toThrow();
    await settle();
    expect(froglyScripts()).toHaveLength(0);
  });

  it("does not throw when crypto.subtle.digest rejects", async () => {
    vi.stubGlobal("crypto", { subtle: { digest: () => Promise.reject(new Error("digest rejected")) } });
    expect(() => startFrogly({ brokerId: "frogly-test" })).not.toThrow();
    await settle();
    expect(froglyScripts()).toHaveLength(0);
  });

  it("does not throw when document.head.appendChild throws", async () => {
    vi.spyOn(document.head, "appendChild").mockImplementation(() => {
      throw new Error("append refused");
    });
    expect(() => startFrogly({ siteId: "my-existing-site-01" })).not.toThrow();
    await settle();
    expect(froglyScripts()).toHaveLength(0);
  });

  it("does not throw when querySelector throws", () => {
    vi.spyOn(document, "querySelector").mockImplementation(() => {
      throw new Error("selector refused");
    });
    expect(() => startFrogly({ brokerId: "frogly-test" })).not.toThrow();
  });
});
