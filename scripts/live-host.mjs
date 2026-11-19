/** Reads the import map and shared-runtime export lists of a live DEX Creator site. */

export const LIVE_PAGE = "https://dex.orderly.network/dex-orbit-ca51882d/";

export async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

/** The live page's import map, with each specifier resolved to an absolute URL. */
export async function fetchLiveImportMap(page = LIVE_PAGE) {
  const html = await fetchText(page);
  const json = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1];
  if (!json) throw new Error(`no import map on ${page}`);
  const imports = JSON.parse(json).imports ?? {};
  return Object.fromEntries(
    Object.entries(imports).map(([specifier, path]) => [specifier, new URL(path, page).href]),
  );
}

/** Names a minified ESM chunk exports, in source order. */
export function chunkExports(source) {
  const names = [];
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of match[1].split(",")) {
      const pieces = part.trim().split(/\s+as\s+/);
      const name = (pieces[1] ?? pieces[0]).trim();
      if (name) names.push(name);
    }
  }
  for (const match of source.matchAll(/export\s+(?:const|let|var|function\*?|class)\s+([\w$]+)/g)) {
    names.push(match[1]);
  }
  if (/export\s+default\b/.test(source)) names.push("default");
  if (/export\s*\*\s*from/.test(source)) names.push("*unknown*");
  return [...new Set(names)];
}

/** Export names of the live chunk for one specifier. */
export async function liveExports(specifier, map) {
  const url = map[specifier];
  if (!url) throw new Error(`${specifier} is not in the live import map`);
  return { url, names: chunkExports(await fetchText(url)) };
}
