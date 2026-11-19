// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { OrderlyPlugin, OrderlyPluginAPI } from "@orderly.network/plugin-core";
import { registerFroglyPlugin } from "../src/plugin";
import { runtimeBrokerId, startFrogly } from "../src/start";

vi.mock("@orderly.network/hooks", () => ({
  useConfig: () => "frogly-test",
}));

/** Server rendering: there is no window and no document. */
describe("on the server", () => {
  it("has no window or document", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });

  it("startFrogly does nothing and does not throw", () => {
    expect(() => startFrogly({ brokerId: "frogly-test" })).not.toThrow();
    expect(() => startFrogly({ siteId: "my-existing-site-01" })).not.toThrow();
    expect(runtimeBrokerId()).toBeUndefined();
  });

  it("the plugin registers and its interceptors render the original menu unchanged", () => {
    let plugin: OrderlyPlugin | undefined;
    registerFroglyPlugin()({ registerPlugin: (descriptor) => (plugin = descriptor) });
    expect(plugin).toBeDefined();
    expect(() => plugin!.setup!({} as OrderlyPluginAPI)).not.toThrow();

    const Menu = (props: Record<string, unknown>) => <button type="button">{String(props.label)}</button>;
    const props = { label: "Connect wallet" };
    const without = renderToStaticMarkup(<Menu {...props} />);
    for (const interceptor of plugin!.interceptors ?? []) {
      const markup = renderToStaticMarkup(<>{interceptor.component(Menu, props, {} as OrderlyPluginAPI)}</>);
      expect(markup).toBe(without);
    }
  });
});
