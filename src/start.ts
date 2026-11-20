import { CORE_INTEGRITY, CORE_PREFIX, CORE_SRC } from "./core";
import { canHashSiteId, normalizeBrokerId, siteIdForBroker, siteIdFromOption } from "./siteId";

/** Window flag set by the copy of this plugin that started Frogly. */
const STARTED = "__froglyOrderlyStarted";

type FlaggedWindow = Window & { [STARTED]?: boolean };

export interface StartInput {
  /** Site ID passed in code (wins over the broker ID). */
  siteId?: unknown;
  /** Orderly broker ID of the DEX. */
  brokerId?: unknown;
}

/**
 * Starts Frogly once: appends exactly one pinned script to document.head.
 *
 * Fails open. Every step is inside try/catch, nothing is thrown, and when any
 * step fails the DEX works exactly as it does without the plugin.
 */
export function startFrogly(input: StartInput): void {
  try {
    // a. Not in a browser (server rendering): nothing to do.
    if (typeof window === "undefined" || typeof document === "undefined") return;
    // b. The DEX already loads Frogly itself.
    if (hasFroglyScript()) return;
    // c. Another copy or trigger of this plugin already started Frogly.
    const w = window as FlaggedWindow;
    if (w[STARTED]) return;
    // d. Which site this is. The flag is set synchronously, before any await,
    //    so two copies or two triggers can never add two scripts. Without a
    //    usable ID the flag stays unset, so a later trigger that has one can
    //    still start Frogly.
    const siteId = siteIdFromOption(input.siteId);
    if (siteId) {
      w[STARTED] = true;
      addScript(siteId);
      return;
    }
    const brokerId = normalizeBrokerId(input.brokerId);
    if (!brokerId || !canHashSiteId()) return;
    w[STARTED] = true;
    siteIdForBroker(brokerId)
      .then((id) => {
        if (id) addScript(id);
      })
      .catch(() => undefined);
  } catch {
    // Fail open.
  }
}

/** The broker ID a DEX Creator site publishes in its config.js, if any. */
export function runtimeBrokerId(): unknown {
  try {
    if (typeof window === "undefined") return undefined;
    const config = (window as Window & { __RUNTIME_CONFIG__?: Record<string, unknown> })
      .__RUNTIME_CONFIG__;
    return config ? config.VITE_ORDERLY_BROKER_ID : undefined;
  } catch {
    return undefined;
  }
}

function hasFroglyScript(): boolean {
  return document.querySelector(`script[src^="${CORE_PREFIX}"]`) !== null;
}

/** e. Exactly one script element, pinned by address and hash. Nothing else. */
function addScript(siteId: string): void {
  try {
    if (hasFroglyScript()) return;
    const script = document.createElement("script");
    // Attributes are set explicitly so the pinned hash is visible in the DOM
    // the same way in every browser (and in tests).
    script.setAttribute("src", CORE_SRC);
    script.async = true;
    script.setAttribute("integrity", CORE_INTEGRITY);
    script.setAttribute("crossorigin", "anonymous");
    script.setAttribute("data-cfg", siteId);
    script.setAttribute("data-quiet", "1");
    document.head.appendChild(script);
  } catch {
    // Fail open.
  }
}
