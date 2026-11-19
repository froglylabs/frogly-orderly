#!/usr/bin/env node
/**
 * Local end-to-end check against a copy of Orderly's dex-creator-template.
 *
 * - Clones the template into ~/frogly-orderly-host (outside this repo).
 * - Adds @orderly.network/plugin-core at the template's SDK version.
 * - Reads the host's own public/config.js (never writes it). Its broker ID must
 *   have a fixed vector in test/site-id-vectors.json, and its VITE_DEX_PLUGINS
 *   must load this plugin's dist/index.mjs from http://127.0.0.1:4321.
 * - Serves dist/ on :4321, builds and previews the host, runs Playwright.
 *
 * Nothing is published. The host copy is never committed from this repo.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { LIVE_PAGE, fetchLiveImportMap, liveExports } from "./live-host.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const hostDir = join(homedir(), "frogly-orderly-host");
const outputDir = join(root, "e2e/.output");
const DIST_PORT = 4321;
const HOST_PORT = 4173;
const TEMPLATE = "https://github.com/OrderlyNetwork/dex-creator-template.git";

mkdirSync(outputDir, { recursive: true });

function run(command, args, opts = {}) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    encoding: "utf8",
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
  return result;
}

console.log("e2e: building plugin");
run("pnpm", ["build"], { cwd: root });

if (!existsSync(join(hostDir, "package.json"))) {
  console.log(`e2e: cloning ${TEMPLATE} into ${hostDir}`);
  if (existsSync(hostDir)) rmSync(hostDir, { recursive: true, force: true });
  run("git", ["clone", "--depth", "1", TEMPLATE, hostDir]);
} else {
  console.log(`e2e: reusing existing host at ${hostDir}`);
}

const hostPkgPath = join(hostDir, "package.json");
const hostPkg = JSON.parse(readFileSync(hostPkgPath, "utf8"));
const sdkVersion =
  hostPkg.dependencies?.["@orderly.network/react-app"] ||
  hostPkg.dependencies?.["@orderly.network/hooks"] ||
  "3.2.2";

if (!hostPkg.dependencies["@orderly.network/plugin-core"]) {
  console.log(`e2e: adding @orderly.network/plugin-core@${sdkVersion} to the host`);
  hostPkg.dependencies["@orderly.network/plugin-core"] = sdkVersion;
  writeFileSync(hostPkgPath, JSON.stringify(hostPkg, null, 2) + "\n");
}

const PLUGIN_ENTRY = `http://127.0.0.1:${DIST_PORT}/index.mjs`;
const hostConfigPath = join(hostDir, "public/config.js");
const vectors = JSON.parse(readFileSync(join(root, "test/site-id-vectors.json"), "utf8"));

function hostConfigProblem(message) {
  return new Error(
    `e2e: ${message}\n` +
      `Write ${hostConfigPath} yourself, for example:\n` +
      `window.__RUNTIME_CONFIG__ = {"VITE_ORDERLY_BROKER_ID":"<a broker ID from test/site-id-vectors.json>",` +
      `"VITE_DEX_PLUGINS":"[{\\"pluginId\\":\\"frogly\\",\\"config\\":{},\\"entry\\":\\"${PLUGIN_ENTRY}\\"}]"};`,
  );
}

if (!existsSync(hostConfigPath)) throw hostConfigProblem("the host has no public/config.js");
const hostConfigJs = readFileSync(hostConfigPath, "utf8");
let hostConfig;
try {
  hostConfig = JSON.parse(
    hostConfigJs.replace(/^\s*window\.__RUNTIME_CONFIG__\s*=\s*/, "").replace(/;\s*$/, ""),
  );
} catch {
  throw hostConfigProblem("public/config.js is not window.__RUNTIME_CONFIG__ = {JSON};");
}
let hostPlugins = [];
try {
  hostPlugins = JSON.parse(hostConfig.VITE_DEX_PLUGINS || "[]");
} catch {
  throw hostConfigProblem("VITE_DEX_PLUGINS in public/config.js is not valid JSON");
}
if (!hostPlugins.some((p) => p?.pluginId === "frogly" && p?.entry === PLUGIN_ENTRY)) {
  throw hostConfigProblem(`VITE_DEX_PLUGINS has no frogly entry loading ${PLUGIN_ENTRY}`);
}
const brokerId = hostConfig.VITE_ORDERLY_BROKER_ID;
if (typeof brokerId !== "string" || !Object.hasOwn(vectors, brokerId)) {
  throw hostConfigProblem(
    `broker ID ${JSON.stringify(brokerId)} has no fixed vector in test/site-id-vectors.json`,
  );
}
console.log(`e2e: host config uses a broker ID with a fixed vector; expecting data-cfg ${vectors[brokerId]}`);

const yarn = ["npx", "-y", "yarn@1.22.22"];
if (!existsSync(join(hostDir, "node_modules"))) {
  console.log("e2e: installing host dependencies (yarn)");
  run(yarn[0], [...yarn.slice(1), "install"], { cwd: hostDir, env: process.env });
} else if (!existsSync(join(hostDir, "node_modules/@orderly.network/plugin-core"))) {
  console.log("e2e: installing newly added plugin-core");
  run(yarn[0], [...yarn.slice(1), "install"], { cwd: hostDir, env: process.env });
}

// The host's loader and scripts/shared-runtime-plugin.ts are never changed.

// The template sets server.open: true, and vite preview reuses it, so a run
// would open the developer's own browser. Turn it off for both. Every vite
// process below also gets BROWSER=none as a second guard.
const viteConfigPath = join(hostDir, "vite.config.ts");
let viteConfigSrc = readFileSync(viteConfigPath, "utf8");
if (viteConfigSrc.includes("open: true")) {
  viteConfigSrc = viteConfigSrc.replace(/open: true/g, "open: false");
}
if (!/preview:\s*\{\s*open: false/.test(viteConfigSrc)) {
  const anchor = "    base: basePath,";
  if (!viteConfigSrc.includes(anchor)) {
    throw new Error("e2e: vite.config.ts changed upstream; update the host patch");
  }
  viteConfigSrc = viteConfigSrc.replace(anchor, `    preview: {\n      open: false,\n    },\n${anchor}`);
}
// Test-only host change (docs/TESTING.md): keep the export names of the
// shared-runtime entries, as the live hosted DEX Creator release does.
if (!viteConfigSrc.includes('preserveEntrySignatures: "exports-only"')) {
  const anchor = '      outDir: "build/client",\n';
  if (!viteConfigSrc.includes(anchor)) {
    throw new Error("e2e: vite.config.ts changed upstream; update the host patch");
  }
  viteConfigSrc = viteConfigSrc.replace(
    anchor,
    `${anchor}      rollupOptions: {\n        preserveEntrySignatures: "exports-only",\n      },\n`,
  );
}
// Test-only host change (docs/TESTING.md): react and react/jsx-runtime are
// CommonJS, so the template's `export *` entries for them carry no names. Give
// those two entries the exact export lists of the live hosted files.
const LIVE_NAMES_PLUGIN = "froglyTestLiveReactNames";
if (!viteConfigSrc.includes(LIVE_NAMES_PLUGIN)) {
  const liveMap = await fetchLiveImportMap();
  const lists = {};
  for (const specifier of ["react", "react/jsx-runtime"]) {
    const { url, names } = await liveExports(specifier, liveMap);
    if (names.includes("*unknown*") || names.length === 0) {
      throw new Error(`e2e: could not read the export list of ${url}`);
    }
    lists[specifier] = names;
    console.log(`e2e: live ${specifier} (${url}) exports ${names.join(", ")}`);
  }
  const definition = [
    "// Test-only (frogly-orderly docs/TESTING.md): explicit names for the CommonJS",
    `// shared entries, copied from the live files on ${LIVE_PAGE}.`,
    `function ${LIVE_NAMES_PLUGIN}(): Plugin {`,
    `  const names: Record<string, string[]> = ${JSON.stringify(lists)};`,
    '  const prefix = "\\0virtual:orderly-shared-runtime/";',
    "  return {",
    '    name: "frogly-test-live-react-names",',
    '    apply: "build",',
    '    enforce: "pre",',
    "    load(id) {",
    "      if (!id.startsWith(prefix)) return null;",
    "      const specifier = id.slice(prefix.length);",
    "      const list = names[specifier];",
    "      if (!list) return null;",
    "      const quoted = JSON.stringify(specifier);",
    "      return list.map((name) => `export { ${name} } from ${quoted};`).join(\"\\n\") + \"\\n\";",
    "    },",
    "  };",
    "}",
    "",
    "",
  ].join("\n");
  const defineAnchor = "export default defineConfig(";
  const pluginAnchor = "      sharedRuntimePlugin(),\n";
  if (!viteConfigSrc.includes(defineAnchor) || !viteConfigSrc.includes(pluginAnchor)) {
    throw new Error("e2e: vite.config.ts changed upstream; update the host patch");
  }
  viteConfigSrc = viteConfigSrc
    .replace(defineAnchor, `${definition}${defineAnchor}`)
    .replace(pluginAnchor, `${pluginAnchor}      ${LIVE_NAMES_PLUGIN}(),\n`);
}
let hostConfigChanged = false;
if (viteConfigSrc !== readFileSync(viteConfigPath, "utf8")) {
  writeFileSync(viteConfigPath, viteConfigSrc);
  hostConfigChanged = true;
  console.log("e2e: applied the test-only host changes in docs/TESTING.md to vite.config.ts");
}

// The template's vite outDir is build/client (not dist).
const clientDir = join(hostDir, "build/client");
const mapPath = join(clientDir, "import-map.json");

if (process.env.FROGLY_E2E_REBUILD === "1" || hostConfigChanged || !existsSync(mapPath)) {
  console.log("e2e: building host with its own build script (this takes a while)");
  run(yarn[0], [...yarn.slice(1), "build"], { cwd: hostDir, env: { ...process.env, BROWSER: "none" } });
} else {
  console.log("e2e: reusing existing host build (set FROGLY_E2E_REBUILD=1 to rebuild)");
}
const importMap = JSON.parse(readFileSync(mapPath, "utf8"));
const provided = Object.keys(importMap.imports).sort();
console.log(`e2e: host import map provides ${provided.join(", ")}`);

// Every bare import in the plugin must be one the host import map provides.
const pluginImports = [
  ...readFileSync(join(root, "dist/index.mjs"), "utf8").matchAll(/^\s*import\s[^;]*?\sfrom\s+"([^"]+)"/gm),
].map((match) => match[1]);
const unprovided = pluginImports.filter((specifier) => !provided.includes(specifier));
if (unprovided.length > 0) {
  throw new Error(`e2e: the host import map does not provide ${unprovided.join(", ")}`);
}
console.log(`e2e: plugin imports ${pluginImports.join(", ")}; all provided by the host`);

// Preview serves build/client, which holds the copy of public/config.js the
// host build made. config.js is read-only here; rebuild after changing it.
if (readFileSync(join(clientDir, "config.js"), "utf8") !== hostConfigJs) {
  throw new Error("e2e: build/client/config.js differs from public/config.js; set FROGLY_E2E_REBUILD=1");
}

/** Serve this repo's dist/ with CORS so the host can dynamic-import it. */
function serveDist() {
  const distDir = join(root, "dist");
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url || "/", `http://127.0.0.1:${DIST_PORT}`);
        const name = url.pathname === "/" ? "/index.mjs" : url.pathname;
        const file = join(distDir, name);
        if (!file.startsWith(distDir) || !existsSync(file)) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        const body = readFileSync(file);
        const type = name.endsWith(".mjs")
          ? "text/javascript"
          : name.endsWith(".js")
            ? "text/javascript"
            : name.endsWith(".map")
              ? "application/json"
              : "application/octet-stream";
        res.writeHead(200, {
          "content-type": type,
          "access-control-allow-origin": "*",
          "cache-control": "no-store",
        });
        res.end(body);
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });
    server.listen(DIST_PORT, "127.0.0.1", () => {
      console.log(`e2e: serving dist on http://127.0.0.1:${DIST_PORT}`);
      resolve(server);
    });
  });
}

async function waitForUrl(url, timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs;
  let lastError = "not tried";
  while (Date.now() < end) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status > 0) return;
      lastError = `status ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for ${url}: ${lastError}`);
}

function startPreview() {
  return new Promise((resolve, reject) => {
    // Call the host's vite binary directly. Going through `yarn vite` prints
    // the word "preview" before the server listens, which used to fool a
    // log-based readiness check.
    const viteBin = join(hostDir, "node_modules/.bin/vite");
    const child = spawn(
      viteBin,
      ["preview", "--host", "127.0.0.1", "--port", String(HOST_PORT), "--strictPort"],
      {
        cwd: hostDir,
        env: { ...process.env, BROWSER: "none" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const onData = (chunk) => process.stdout.write(chunk.toString());
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => {
      reject(new Error(`host preview exited early with ${code}`));
    });
    waitForUrl(`http://127.0.0.1:${HOST_PORT}/`)
      .then(() => {
        console.log(`e2e: host preview ready on http://127.0.0.1:${HOST_PORT}`);
        resolve(child);
      })
      .catch(reject);
  });
}

// A leftover server on either port would answer the readiness check, and the
// tests would run against it instead of the servers started here.
for (const port of [DIST_PORT, HOST_PORT]) {
  const busy = await fetch(`http://127.0.0.1:${port}/`, { redirect: "manual" }).then(
    () => true,
    () => false,
  );
  if (busy) {
    throw new Error(
      `e2e: port ${port} is already in use. Find the process with: lsof -nP -iTCP:${port} -sTCP:LISTEN`,
    );
  }
}

const distServer = await serveDist();
const preview = await startPreview();

/** Like run(), but without blocking this process, which serves dist/ meanwhile. */
function runAsync(command, args, opts) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...opts });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with exit ${code}`));
    });
  });
}

let exitCode = 0;
try {
  console.log("e2e: running Playwright");
  await runAsync("pnpm", ["exec", "playwright", "test", "--config", "e2e/playwright.config.ts"], {
    cwd: root,
    env: {
      ...process.env,
      FROGLY_E2E_HOST: `http://127.0.0.1:${HOST_PORT}`,
      FROGLY_E2E_HOST_CONFIG: hostConfigPath,
    },
  });
  console.log("e2e: passed");
} catch (err) {
  console.error(err);
  exitCode = 1;
} finally {
  preview.kill("SIGTERM");
  distServer.close();
}

process.exit(exitCode);
