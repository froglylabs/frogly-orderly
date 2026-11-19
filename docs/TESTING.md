# Testing

## Unit tests

```bash
cd ~/frogly-orderly && pnpm test
```

Vitest with jsdom, no network. The expected site IDs come from the fixed vectors in `test/site-id-vectors.json`, which Frogly's server must match exactly.

## Live import check (no browser)

```bash
cd ~/frogly-orderly && pnpm build && pnpm check:live
```

Reads every import in `dist/index.mjs`, fetches the import map from https://dex.orderly.network/dex-orbit-ca51882d/, and fails unless the live file for each specifier exports every imported name. It runs in `pnpm release:check`, in the release workflow, and weekly.

## End-to-end check

```bash
cd ~/frogly-orderly && pnpm e2e
```

It runs against a local copy of Orderly's DEX Creator template in `~/frogly-orderly-host`. That copy is outside this repo and is never committed or pushed. It is built with its own `yarn build` and served with `vite preview`. Its loader (`app/plugins/loader.ts`) and `scripts/shared-runtime-plugin.ts` are never changed. Browser tests run headless in Google Chrome with a fresh temporary profile.

You write the copy's `public/config.js` yourself. The check only reads it: its broker ID must have a fixed vector in `test/site-id-vectors.json`, and its `VITE_DEX_PLUGINS` must load `http://127.0.0.1:4321/index.mjs` as plugin `frogly`.

### Test-only changes to the host copy

`scripts/e2e.mjs` applies these to the copy, and nothing else:

1. **`@orderly.network/plugin-core` in `package.json` dependencies**, at the template's SDK version. The template's import map only includes SDK packages listed there, and the public template does not list plugin-core yet. Live DEX Creator sites do provide it.
2. **`server.open: false` and `preview.open: false` in `vite.config.ts`.** The template opens a browser on start, and `vite preview` reuses that setting. Tests must never open the developer's own browser.
3. **`build.rollupOptions.preserveEntrySignatures: "exports-only"` in `vite.config.ts`.** Built as published, Vite's default for app builds (`false`) lets Rollup rename the exports of the shared-runtime entry files: in a local build `react/jsx-runtime` exported only `j`, and plugin-core exported `createInterceptor` under a short name. No runtime plugin that imports a name can load from such a build. The live hosted DEX Creator release keeps the names (`pnpm check:live` confirms `jsx`, `useEffect`, `useConfig` and `createInterceptor`). With this change the local copy keeps them for the Orderly packages (`createInterceptor`, `useConfig`).

   It does not help `react` and `react/jsx-runtime`. Those are CommonJS files, and the template's entries re-export them with `export * from "react/jsx-runtime"`, which cannot carry the names of a CommonJS module: locally `react` exports only `default` and `react/jsx-runtime` exports no usable name. The live release's files list the names explicitly (its `react/jsx-runtime` file ends with `export { Fragment, default, jsx, jsxs }`), so the live host does something the public template does not.
4. **Explicit names for the `react` and `react/jsx-runtime` entries, in `vite.config.ts`.** A small build-only Vite plugin (`froglyTestLiveReactNames`) answers for those two shared entries only, with `export { name } from "react"` lines for each name. The names are not typed by hand: when the copy does not have this change yet, `scripts/e2e.mjs` fetches the live import map of https://dex.orderly.network/dex-orbit-ca51882d/, reads the export lists of its `react` and `react/jsx-runtime` files, and writes exactly those names. Every other shared entry, the loader and `scripts/shared-runtime-plugin.ts` stay as published. To pick up newer live names, revert `vite.config.ts` in the copy (`cd ~/frogly-orderly-host && git checkout vite.config.ts`) and run `pnpm e2e` again.

DEXs that build their own copy of the template without such a setting may rename these exports; see Known limits in the README.
