import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createInterceptor } from "@orderly.network/plugin-core";
import * as pluginModule from "../src/index";
import { registerFroglyPlugin } from "../src/plugin";
import { Menu, api, froglyScripts, mount, registered, resetPage, settle, waitFor } from "./helpers";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readRoot = (name: string) => readFileSync(join(root, name), "utf8");

const hooks = vi.hoisted(() => ({ brokerId: undefined as unknown }));

// The real useConfig needs OrderlyAppProvider, which needs a wallet and the
// network. The plugin only ever reads "brokerId" from it.
vi.mock("@orderly.network/hooks", () => ({
  useConfig: (key: string) => (key === "brokerId" ? hooks.brokerId : undefined),
}));

const TEST_SITE_ID = "9cbe5e94-051b-5a1e-b497-ddc1c444ebc2";
const props = { label: "Connect wallet", onClick: () => undefined, disabled: false };

beforeEach(() => {
  resetPage();
  hooks.brokerId = "frogly-test";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("exports", () => {
  it("exposes registerFroglyPlugin as registerPlugin and as the default export", () => {
    expect(pluginModule.registerFroglyPlugin).toBe(registerFroglyPlugin);
    expect(pluginModule.registerPlugin).toBe(registerFroglyPlugin);
    expect(pluginModule.default).toBe(registerFroglyPlugin);
  });
});

describe("the registered plugin", () => {
  it("has the marketplace identity and the version from package.json", () => {
    const pkg = JSON.parse(readRoot("package.json")) as {
      version: string;
    };
    const plugin = registered(() => registerFroglyPlugin());
    expect(plugin.id).toBe("frogly");
    expect(plugin.name).toBe("Frogly");
    expect(plugin.version).toBe(pkg.version);
    expect(plugin.orderlyVersion).toBe(">=3.0.0");
    expect(typeof plugin.setup).toBe("function");
  });

  it("wraps the desktop and mobile account menus with createInterceptor", () => {
    const plugin = registered(() => registerFroglyPlugin());
    const targets = (plugin.interceptors ?? []).map((i) => i.target);
    expect(targets).toEqual(["Account.AccountMenu", "Account.MobileAccountMenu"]);
    // Same shape as createInterceptor produces: a plain function, not a component.
    const reference = createInterceptor("Account.AccountMenu", () => null);
    for (const interceptor of plugin.interceptors ?? []) {
      expect(Object.keys(interceptor).sort()).toEqual(Object.keys(reference).sort());
      expect(typeof interceptor.component).toBe("function");
    }
  });

  it("accepts whatever DEX Creator passes as settings and reads nothing from it", () => {
    const settings = { claimCode: "abc" } as Record<string, unknown>;
    const seen: string[] = [];
    const watched = new Proxy(settings, {
      get(target, key) {
        seen.push(String(key));
        return Reflect.get(target, key);
      },
    });
    expect(() => registered(() => registerFroglyPlugin(watched))).not.toThrow();
    expect(seen).toEqual([]);
    // A non-object settings value is tolerated too.
    expect(() => registered(() => registerFroglyPlugin(null as never))).not.toThrow();
  });
});

describe("the menu with the plugin", () => {
  it("renders the same HTML as without it, with the same props", async () => {
    const plugin = registered(() => registerFroglyPlugin());
    const receivedProps: unknown[] = [];
    const Original = (p: Record<string, unknown>) => {
      receivedProps.push(p);
      return <Menu {...p} />;
    };

    const without = renderToStaticMarkup(<Original {...props} />);
    for (const interceptor of plugin.interceptors ?? []) {
      const withPlugin = renderToStaticMarkup(<>{interceptor.component(Original, props, api)}</>);
      expect(withPlugin).toBe(without);
    }
    // JSX spreads into a new object; the values must match the original props.
    expect(receivedProps.every((p) => JSON.stringify(p) === JSON.stringify(props))).toBe(true);

    // Also in a live DOM render.
    const mounted = mount(<>{plugin.interceptors![0].component(Original, props, api)}</>);
    expect(mounted.container.innerHTML).toBe(without);
    mounted.unmount();
  });

  it("adds exactly one script from the account menu", async () => {
    const plugin = registered(() => registerFroglyPlugin());
    const mounted = mount(<>{plugin.interceptors![0].component(Menu, props, api)}</>);
    await waitFor(() => froglyScripts().length > 0);
    const [script] = froglyScripts();
    expect(froglyScripts()).toHaveLength(1);
    expect(script.getAttribute("data-cfg")).toBe(TEST_SITE_ID);
    expect(mounted.container.querySelectorAll("script")).toHaveLength(0);
    mounted.unmount();
  });

  it("still has one script after setup, both interceptors, ten rerenders and a second copy", async () => {
    (window as Window & { __RUNTIME_CONFIG__?: Record<string, string> }).__RUNTIME_CONFIG__ = {
      VITE_ORDERLY_BROKER_ID: "frogly-test",
    };
    const plugin = registered(() => registerFroglyPlugin());
    plugin.setup!(api);

    const desktop = mount(<>{plugin.interceptors![0].component(Menu, props, api)}</>);
    const mobile = mount(<>{plugin.interceptors![1].component(Menu, props, api)}</>);
    for (let i = 0; i < 10; i++) {
      desktop.rerender(<>{plugin.interceptors![0].component(Menu, { ...props, label: `Render ${i}` }, api)}</>);
      mobile.rerender(<>{plugin.interceptors![1].component(Menu, { ...props, label: `Render ${i}` }, api)}</>);
    }

    // A second copy of the plugin module (as when a DEX loads it twice).
    vi.resetModules();
    const second = (await import("../src/plugin")) as typeof import("../src/plugin");
    expect(second.registerFroglyPlugin).not.toBe(registerFroglyPlugin);
    const secondPlugin = registered(() => second.registerFroglyPlugin());
    secondPlugin.setup!(api);
    const secondMenu = mount(<>{secondPlugin.interceptors![0].component(Menu, props, api)}</>);

    await waitFor(() => froglyScripts().length > 0);
    await settle();
    expect(froglyScripts()).toHaveLength(1);
    expect(froglyScripts()[0].getAttribute("data-cfg")).toBe(TEST_SITE_ID);

    desktop.unmount();
    mobile.unmount();
    secondMenu.unmount();
  });

  it("adds nothing when any Frogly script is already on the page", async () => {
    const pasted = document.createElement("script");
    pasted.src = "https://cdn.frogly.ai/w/core.v3.js";
    document.head.appendChild(pasted);

    const plugin = registered(() => registerFroglyPlugin());
    plugin.setup!(api);
    const mounted = mount(<>{plugin.interceptors![0].component(Menu, props, api)}</>);
    await settle();
    expect(froglyScripts()).toEqual([pasted]);
    mounted.unmount();
  });

  it("uses a site ID passed in code over the broker ID, and ignores an invalid one", async () => {
    const withSite = registered(() => registerFroglyPlugin({}, { siteId: "my-existing-site-01" }));
    const a = mount(<>{withSite.interceptors![0].component(Menu, props, api)}</>);
    await waitFor(() => froglyScripts().length > 0);
    expect(froglyScripts()[0].getAttribute("data-cfg")).toBe("my-existing-site-01");
    a.unmount();

    resetPage();
    const withBadSite = registered(() => registerFroglyPlugin({}, { siteId: "nope" }));
    const b = mount(<>{withBadSite.interceptors![0].component(Menu, props, api)}</>);
    await waitFor(() => froglyScripts().length > 0);
    expect(froglyScripts()[0].getAttribute("data-cfg")).toBe(TEST_SITE_ID);
    b.unmount();
  });

  it("adds no script without a usable broker ID", async () => {
    for (const brokerId of [undefined, "", "demo", "DEMO", "x".repeat(65), "al pix"]) {
      resetPage();
      hooks.brokerId = brokerId;
      const plugin = registered(() => registerFroglyPlugin());
      plugin.setup!(api);
      const mounted = mount(<>{plugin.interceptors![0].component(Menu, props, api)}</>);
      await settle();
      expect(froglyScripts()).toHaveLength(0);
      expect(mounted.container.innerHTML).toBe(renderToStaticMarkup(<Menu {...props} />));
      mounted.unmount();
    }
  });

  it("adds no script when crypto.subtle is missing, and the menu still renders", async () => {
    vi.stubGlobal("crypto", {});
    const plugin = registered(() => registerFroglyPlugin());
    const mounted = mount(<>{plugin.interceptors![0].component(Menu, props, api)}</>);
    await settle();
    expect(froglyScripts()).toHaveLength(0);
    expect(mounted.container.innerHTML).toBe(renderToStaticMarkup(<Menu {...props} />));
    mounted.unmount();
  });

  it("fails open: when crypto.subtle.digest throws, nothing throws and the menu still renders", async () => {
    vi.stubGlobal("crypto", {
      subtle: {
        digest: () => {
          throw new Error("digest exploded");
        },
      },
    });
    const plugin = registered(() => registerFroglyPlugin());
    expect(() => plugin.setup!(api)).not.toThrow();
    let mounted: ReturnType<typeof mount> | undefined;
    expect(() => {
      mounted = mount(<>{plugin.interceptors![0].component(Menu, props, api)}</>);
    }).not.toThrow();
    await settle();
    expect(mounted!.container.innerHTML).toBe(renderToStaticMarkup(<Menu {...props} />));
    expect(froglyScripts()).toHaveLength(0);
    mounted!.unmount();
  });

  it("never calls fetch, XMLHttpRequest, sendBeacon or WebSocket, and never touches cookies or storage", async () => {
    const fetchSpy = vi.fn();
    const xhrSpy = vi.fn();
    const wsSpy = vi.fn();
    const beaconSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("XMLHttpRequest", xhrSpy);
    vi.stubGlobal("WebSocket", wsSpy);
    Object.defineProperty(navigator, "sendBeacon", { value: beaconSpy, configurable: true });
    const cookieGet = vi.fn(() => "");
    const cookieSet = vi.fn();
    Object.defineProperty(document, "cookie", { get: cookieGet, set: cookieSet, configurable: true });
    const storageSpies = ["getItem", "setItem", "removeItem", "clear", "key"].map((method) =>
      vi.spyOn(Storage.prototype, method as "getItem"),
    );

    (window as Window & { __RUNTIME_CONFIG__?: Record<string, string> }).__RUNTIME_CONFIG__ = {
      VITE_ORDERLY_BROKER_ID: "frogly-test",
    };
    const plugin = registered(() => registerFroglyPlugin({ claimCode: "abc" }));
    plugin.setup!(api);
    const desktop = mount(<>{plugin.interceptors![0].component(Menu, props, api)}</>);
    const mobile = mount(<>{plugin.interceptors![1].component(Menu, props, api)}</>);
    await waitFor(() => froglyScripts().length > 0);
    await settle();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(wsSpy).not.toHaveBeenCalled();
    expect(beaconSpy).not.toHaveBeenCalled();
    expect(cookieGet).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
    for (const spy of storageSpies) expect(spy).not.toHaveBeenCalled();

    desktop.unmount();
    mobile.unmount();
    delete (document as { cookie?: unknown }).cookie;
  });
});

describe("the settings form (configSchema.json)", () => {
  it("has exactly one optional field, claimCode", () => {
    const schema = JSON.parse(readRoot("configSchema.json")) as {
      type: string;
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, { type: string; maxLength: number; description: string }>;
    };
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual([]);
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties)).toEqual(["claimCode"]);
    expect(schema.properties.claimCode.type).toBe("string");
    expect(schema.properties.claimCode.maxLength).toBe(64);
    expect(schema.properties.claimCode.description).toBe(
      "Free: 10 catches a month, no sign-up. See them at frogly.ai/orderly with your DEX wallet. Pro adds the maze. Leave this empty unless frogly.ai/orderly gives you a code to prove this DEX is yours.",
    );
  });
});
