/**
 * The host app provides @orderly.network/hooks at run time. The plugin reads
 * one value from it, so the package is not installed here: this is the whole
 * surface the plugin uses.
 */
declare module "@orderly.network/hooks" {
  export function useConfig(key: "brokerId"): unknown;
}
