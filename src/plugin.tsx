import { useEffect } from "react";
import { useConfig } from "@orderly.network/hooks";
import { createInterceptor } from "@orderly.network/plugin-core";
import type { OrderlySDK } from "@orderly.network/plugin-core";
import { runtimeBrokerId, startFrogly } from "./start";

/** Set by the build from package.json. */
declare const __FROGLY_VERSION__: string;

/**
 * The settings DEX Creator shows for this plugin and passes to it. They are
 * public: DEX Creator publishes them in the DEX's config.js.
 */
export interface FroglySettings {
  /**
   * Free: 10 catches a month, no sign-up. See them at frogly.ai/orderly with your DEX wallet. Pro adds the maze. Leave this empty unless frogly.ai/orderly gives you a code to prove this DEX is yours.
   * @maxLength 64
   */
  claimCode?: string;
}

/** Options that exist only in code, never in the DEX Creator settings form. */
export interface FroglyCodeOptions {
  /**
   * Site ID of a DEX that already has a Frogly site. Leave it out everywhere
   * else: the site ID is then derived from the DEX's broker ID.
   */
  siteId?: string;
}

/** Renders nothing and adds no DOM node. Reads the broker ID from Orderly's config and starts Frogly once. */
function FroglyBoot(props: { siteId?: string }) {
  const brokerId = useConfig("brokerId");
  useEffect(() => {
    startFrogly({ siteId: props.siteId, brokerId });
  }, [props.siteId, brokerId]);
  return null;
}

/**
 * Register Frogly with the Orderly SDK.
 *
 * DEX Creator calls this with the DEX's settings. Custom apps pass it to
 * OrderlyAppProvider: plugins={[registerFroglyPlugin()]}.
 */
export function registerFroglyPlugin(settings: FroglySettings = {}, options: FroglyCodeOptions = {}) {
  // The settings are accepted for DEX Creator's sake and read nowhere: the only
  // one, claimCode, is read by Frogly's server from the DEX's public config.js.
  void settings;
  const siteId = typeof options?.siteId === "string" ? options.siteId : undefined;

  return (SDK: OrderlySDK) => {
    SDK.registerPlugin({
      id: "frogly",
      name: "Frogly",
      version: __FROGLY_VERSION__,
      orderlyVersion: ">=3.0.0",

      // DEX Creator sites publish their broker ID in config.js, so Frogly can
      // start before any menu renders. Whichever runs first starts Frogly; the
      // other does nothing.
      setup: () => {
        startFrogly({ siteId, brokerId: runtimeBrokerId() });
      },

      // The account menu is on screen app-wide. Both targets are wrapped, never
      // replaced: the original renders with its own props, unchanged, and the
      // boot component next to it adds no DOM node. Targets are written inline
      // because Orderly's devkit reads them from these calls.
      // Return a short array instead of a Fragment: DEX Creator's shared
      // react/jsx-runtime import-map entry does not re-export Fragment, so a
      // <>...</> wrapper fails to load the plugin at run time.
      interceptors: [
        createInterceptor("Account.AccountMenu", (Original, props) => [
          <Original key="frogly-original" {...props} />,
          <FroglyBoot key="frogly-boot" siteId={siteId} />,
        ]),
        createInterceptor("Account.MobileAccountMenu", (Original, props) => [
          <Original key="frogly-original" {...props} />,
          <FroglyBoot key="frogly-boot" siteId={siteId} />,
        ]),
      ],
    });
  };
}
