/**
 * The one script this plugin adds to the page: Frogly's core, pinned by
 * address and by hash. The browser refuses to run the file if one byte
 * differs from the integrity value.
 *
 * A new core version always means a new plugin version: change these two
 * constants together, bump the version in package.json and publish again.
 * The plugin never loads an unpinned file.
 *
 * Source and hashes: https://github.com/froglylabs/frogly-widget
 * (docs/INTEGRITY.md). `pnpm verify:core` downloads the file and checks it
 * against CORE_INTEGRITY.
 */
export const CORE_SRC = "https://cdn.frogly.ai/w/core.v5.js";

export const CORE_INTEGRITY =
  "sha384-5PrNyFpjR+GGOLhFy+XWlvP9vJtqRDKWrSyGVuWYl907zw26TU0PSCod12iTAUdu";

/**
 * A script whose src starts with this prefix is Frogly's own line, pasted by
 * the DEX itself (any version). The plugin then adds nothing.
 */
export const CORE_PREFIX = "https://cdn.frogly.ai/w/";
