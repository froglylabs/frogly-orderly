import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { OrderlyPlugin, OrderlyPluginAPI } from "@orderly.network/plugin-core";
import { CORE_PREFIX } from "../src/core";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Window flag the plugin sets when it starts Frogly. */
export const STARTED_FLAG = "__froglyOrderlyStarted";

/** A stand-in for Orderly's account menu: whatever props it gets, it renders them. */
export function Menu(props: Record<string, unknown>) {
  return (
    <button type="button" className="oui-account-menu" data-label={String(props.label)}>
      {String(props.label)}
    </button>
  );
}

/** Plugin API facade; the plugin never touches it. */
export const api = {} as OrderlyPluginAPI;

/** Registers the plugin against a fake SDK and returns the descriptor it registered. */
export function registered(
  register: () => (SDK: { registerPlugin: (plugin: OrderlyPlugin) => void }) => void,
): OrderlyPlugin {
  let plugin: OrderlyPlugin | undefined;
  register()({ registerPlugin: (descriptor) => (plugin = descriptor) });
  if (!plugin) throw new Error("plugin did not register");
  return plugin;
}

/** Mounts a node into a fresh container inside document.body. */
export function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return {
    container,
    rerender(next: ReactNode) {
      act(() => root.render(next));
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** Frogly script elements currently on the page. */
export function froglyScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>(`script[src^="${CORE_PREFIX}"]`));
}

/** Waits until the check passes, or fails after the timeout. */
export async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  if (!check()) throw new Error("waitFor: timed out");
}

/** Gives any pending promise work (the SHA-1 digest) time to finish. */
export async function settle(ms = 60): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** A clean page: no scripts, no flag, no leftovers from the previous test. */
export function resetPage(): void {
  delete (window as Window & { [STARTED_FLAG]?: boolean })[STARTED_FLAG];
  delete (window as Window & { __RUNTIME_CONFIG__?: unknown }).__RUNTIME_CONFIG__;
  for (const node of Array.from(document.head.childNodes)) node.remove();
  for (const node of Array.from(document.body.childNodes)) node.remove();
}
