import { registerFroglyPlugin } from "./plugin";

export { registerFroglyPlugin };
/** DEX Creator looks for `registerPlugin`, then `default`, and calls it with the DEX's settings. */
export { registerFroglyPlugin as registerPlugin };
export default registerFroglyPlugin;

export type { FroglyCodeOptions, FroglySettings } from "./plugin";
