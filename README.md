# Frogly for Orderly

Keep your DEX safe from AI attacks. Frogly adds hidden decoys to your DEX. When an automated intruder takes one, Frogly records a catch, and on paid plans it can send that visitor into a fake back office (the maze) that Frogly hosts away from your DEX.

## Turn it on in DEX Creator

Open your DEX in [DEX Creator](https://dex.orderly.network/), find **Frogly** in the Marketplace plugins, and click Enable. No settings and no sign-up. The plugin derives a site ID from your broker ID and adds Frogly's pinned script once.

## Plans

- **Free:** 10 catches a month, then Frogly naps until the 1st.
- **Pro, 19 USD a month:** maze on, 100 catches a month, up to 5 sites.
- **Max, 99 USD a month:** maze on, unlimited catches and sites.

## See your catches

Sign in at [frogly.ai/orderly](https://frogly.ai/orderly) with your DEX's broker wallet. One signature, no gas, no transaction. Frogly never asks for a seed phrase.

## The script the plugin adds

Exactly one tag, pinned by address and hash:

```html
<script
  src="https://cdn.frogly.ai/w/core.v5.js"
  integrity="sha384-5PrNyFpjR+GGOLhFy+XWlvP9vJtqRDKWrSyGVuWYl907zw26TU0PSCod12iTAUdu"
  crossorigin="anonymous"
  async
  data-cfg="YOUR_SITE_ID"
></script>
```

For broker `frogly-test`, `data-cfg` is `9cbe5e94-051b-5a1e-b497-ddc1c444ebc2`.

## What the plugin never does

- Read or send any input, wallet, account, order, or position data
- Call `fetch`, `XMLHttpRequest`, `sendBeacon`, or `WebSocket`
- Set cookies or storage
- Add styles or visible elements
- Load any other script
- Use `eval`, `new Function`, `innerHTML`, or `document.write`

The plugin makes no network request of its own. The script it adds is the same public file every Frogly site loads.

## What Frogly's core does once loaded

Described from the published source at [froglylabs/frogly-widget](https://github.com/froglylabs/frogly-widget):

- Reads the site ID from `data-cfg`.
- Loads `https://cdn.frogly.ai/cfg/<SITE_ID>.json` (CORS, credentials omit). Until Frogly's Orderly server side ships, that request answers 404 and the core does nothing further.
- When a config is present, talks to `https://` + `portal_host` (api.frogly.ai): a `check_in` and later event POSTs to `/v1/events` (JSON, keepalive).
- Keeps one random session key in `sessionStorage` (`cfg_sid`). No cookies.
- Places hidden decoys in one off-screen box (`position:absolute;left:-10000px`, `aria-hidden`, `tabindex="-1"`) appended to `document.body`. Traders never see them.
- Its form check follows the site's config (`forms`). Orderly DEX site configs start with forms off.
- Footer links stay off unless the config sets `footer_links: true` (no site sets that).
- Fails open if the config or event request fails. Never uses `eval`, `new Function`, `innerHTML`, or `document.write`.

## Check the hash yourself

From the frogly-widget README:

```bash
cd ~ && curl -s https://cdn.frogly.ai/w/core.v5.js | shasum -a 256
```

```bash
cd ~ && curl -s https://cdn.frogly.ai/w/core.v5.js | openssl dgst -sha384 -binary | openssl base64 -A
```

The second command prints the SRI value of the served file, without the `sha384-` prefix. It must match the integrity value above.

## Content Security Policy

If your DEX sets a CSP, allow:

- `script-src https://cdn.frogly.ai`
- `connect-src https://cdn.frogly.ai https://api.frogly.ai`

## Custom Orderly apps

```bash
cd ~/your-dex && pnpm add @froglylabs/orderly-plugin
```

```tsx
import { OrderlyAppProvider } from "@orderly.network/react-app";
import { registerFroglyPlugin } from "@froglylabs/orderly-plugin";

<OrderlyAppProvider
  // ...your existing props
  plugins={[registerFroglyPlugin()]}
>
  {children}
</OrderlyAppProvider>
```

Register it once. Do not put it behind a condition. No settings are needed.

If the DEX already has a Frogly site, pass that site ID in code only:

```tsx
plugins={[registerFroglyPlugin({}, { siteId: "your-existing-site-id" })]}
```

## Known limits

DEX Creator's hosted release loads this plugin through an import map, and its shared files keep the names the plugin imports (`useEffect`, `jsx`, `useConfig`, `createInterceptor`). A DEX that runs its own copy of the DEX Creator template may rename these exports when it builds it, and then the plugin cannot load there. The DEX still works as before, without Frogly. Such DEXs should add the plain script line from [The script the plugin adds](#the-script-the-plugin-adds) to their page, or, for a custom Orderly app, register the plugin with `siteId` as shown above.

## Claim code

DEX Creator can show an optional **claim code**. The plugin ignores it at run time and never sends it anywhere. DEX Creator publishes plugin settings in the DEX's public `config.js` (`VITE_DEX_PLUGINS`). Frogly's server reads the code from there to confirm that the person who asked for it controls this DEX. Leave it empty unless [frogly.ai/orderly](https://frogly.ai/orderly) gives you a code.

## Turn it off

Remove the plugin in DEX Creator. Nothing is left behind: no cookies, no storage, no leftover script from the plugin itself.

## Support

support@frogly.ai

## For contributors

```bash
cd ~/frogly-orderly && pnpm install
cd ~/frogly-orderly && pnpm test
cd ~/frogly-orderly && pnpm build
cd ~/frogly-orderly && pnpm release:check
```

Local end-to-end check against a copy of Orderly's DEX Creator template. It needs Google Chrome installed. It clones the template into `~/frogly-orderly-host` (outside this repo, never committed or pushed), adds `@orderly.network/plugin-core` to that copy, builds and serves it, and checks desktop and mobile widths with Playwright in headless Chrome with a temporary profile. You write the copy's `public/config.js` yourself and the check never changes it: its broker ID must have a fixed vector in `test/site-id-vectors.json` (the expected `data-cfg` is taken from there, never computed by the plugin's own code), and its `VITE_DEX_PLUGINS` must load `http://127.0.0.1:4321/index.mjs` as plugin `frogly`. The check stops with an explanation if either is missing. The first run builds the whole DEX and takes a long time; later runs reuse the build (`FROGLY_E2E_REBUILD=1` forces a new one).

```bash
cd ~/frogly-orderly && pnpm e2e
```

The copy is built with its own `yarn build`, and its loader and `scripts/shared-runtime-plugin.ts` are never changed. It gets four test-only changes, listed with reasons in [docs/TESTING.md](docs/TESTING.md).

`pnpm check:live` needs no browser: it reads every import in `dist/index.mjs`, fetches the import map of a live DEX Creator site, and fails unless the matching live file exports each imported name. `pnpm verify:core` downloads the pinned core and checks its sha384. `pnpm covers` rebuilds the Marketplace cover images.
