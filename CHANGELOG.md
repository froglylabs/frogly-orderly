# Changelog

## 0.1.1

- Wording only: Free on Orderly DEXs now includes the maze. Settings text, listing description and README updated.
- No code change. The pinned core script and its hash are unchanged.
- Release housekeeping for the Orderly Marketplace review. The published plugin code is unchanged.
- Removed the `prepublishOnly` script. The release workflow already builds before it publishes.
- `@orderly.network/hooks` is now an optional peer and is no longer installed in this repository. The host app provides it at run time, as before.
- The repository now installs on older pnpm versions.

## 0.1.0

- First release of `@froglylabs/orderly-plugin` for Orderly SDK v3 and the Orderly Builders Marketplace.
- Adds Frogly's pinned core script once per DEX, with a site ID derived from the broker ID.
- Optional claim code in the DEX Creator settings form (read by Frogly's server from public config.js; ignored at run time by the plugin).
