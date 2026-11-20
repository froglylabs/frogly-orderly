import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import vectors from "../test/site-id-vectors.json";

const CORE_SRC = "https://cdn.frogly.ai/w/core.v6.js";
const CORE_INTEGRITY =
  "sha384-z29wAlCbvQ06jGYHkjK/R7MJkdaD1F4dfOlhsHFy6fPOAII/YzEZsPZDX4NtqIwV";

/** The host's own config.js. The broker ID is read from it, never stored here. */
const HOST_CONFIG_PATH =
  process.env.FROGLY_E2E_HOST_CONFIG || join(homedir(), "frogly-orderly-host/public/config.js");
const hostConfig: Record<string, unknown> = JSON.parse(
  readFileSync(HOST_CONFIG_PATH, "utf8")
    .replace(/^\s*window\.__RUNTIME_CONFIG__\s*=\s*/, "")
    .replace(/;\s*$/, ""),
);

/**
 * The expected site ID comes from the fixed vectors, not from the plugin's own
 * code, so a bug in the plugin cannot pass its own test.
 */
const brokerId = hostConfig.VITE_ORDERLY_BROKER_ID;
if (typeof brokerId !== "string" || !Object.prototype.hasOwnProperty.call(vectors, brokerId)) {
  throw new Error(
    `host broker ID ${JSON.stringify(brokerId)} has no fixed vector in test/site-id-vectors.json`,
  );
}
const EXPECTED_SITE_ID = vectors[brokerId as keyof typeof vectors];
const CFG_URL = `https://cdn.frogly.ai/cfg/s/${EXPECTED_SITE_ID}.json`;

/** The same config.js as the host, without any plugin. */
const CONFIG_WITHOUT_PLUGIN = `window.__RUNTIME_CONFIG__ = ${JSON.stringify({
  ...hostConfig,
  VITE_DEX_PLUGINS: "[]",
})};`;

type Menu = { text: string; box: { x: number; y: number; width: number; height: number } };

async function froglyScripts(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLScriptElement>('script[src^="https://cdn.frogly.ai/w/"]')).map(
      (script) => ({
        src: script.getAttribute("src"),
        integrity: script.getAttribute("integrity"),
        crossorigin: script.getAttribute("crossorigin"),
        async: script.async,
        dataCfg: script.getAttribute("data-cfg"),
        dataQuiet: script.getAttribute("data-quiet"),
        inHead: script.parentElement === document.head,
        attributes: Array.from(script.attributes)
          .map((a) => a.name)
          .sort(),
      }),
    ),
  );
}

/** The account menu entry point: the connect-wallet button in the top bar or the bottom bar. */
function accountMenu(page: Page) {
  return page.getByRole("button", { name: /connect wallet|connect/i }).filter({ visible: true }).first();
}

async function readMenu(page: Page): Promise<Menu> {
  const menu = accountMenu(page);
  await expect(menu).toBeVisible({ timeout: 60_000 });
  const box = await menu.boundingBox();
  if (!box) throw new Error("account menu has no box");
  return {
    text: (await menu.innerText()).trim(),
    box: {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    },
  };
}

/**
 * Clicking the account menu opens the wallet panel. It renders inside the wallet
 * widget's shadow root with no dialog role, so it is found by its heading text
 * (Playwright text locators pierce open shadow roots).
 */
async function menuWorks(page: Page): Promise<boolean> {
  await accountMenu(page).click();
  const panel = page.getByText(/connect your wallet/i).filter({ visible: true }).first();
  try {
    await expect(panel).toBeVisible({ timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

function pathFor(project: string) {
  // The mobile account menu sits in the bottom bar of the trading page.
  return project === "mobile" ? "/perp/PERP_ETH_USDC" : "/";
}

test("Frogly adds one pinned script and leaves the account menu unchanged", async ({ browser }, testInfo) => {
  const path = pathFor(testInfo.project.name);

  // 1. Without the plugin.
  const plain = await browser.newPage();
  await plain.route("**/config.js", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: CONFIG_WITHOUT_PLUGIN }),
  );
  await plain.goto(path, { waitUntil: "domcontentloaded" });
  const menuWithout = await readMenu(plain);
  await plain.waitForTimeout(3_000);
  expect(await froglyScripts(plain)).toHaveLength(0);
  const worksWithout = await menuWorks(plain);
  expect(worksWithout, "without the plugin, the account menu must open the wallet panel").toBe(true);
  await plain.close();

  // 2. With the plugin (the host's own config.js).
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const where = msg.location()?.url ?? "";
    const line = `${msg.text()} ${where}`.trim();
    // The core fails open when its config or event request fails. That is not
    // a plugin error and not an integrity error.
    if (/https:\/\/cdn\.frogly\.ai\/cfg\//.test(line) || /https:\/\/api\.frogly\.ai\//.test(line)) return;
    errors.push(line);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const cfgStatus: number[] = [];
  page.on("response", (response) => {
    if (response.url() === CFG_URL) cfgStatus.push(response.status());
  });

  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await froglyScripts(page)).length, { timeout: 60_000 }).toBe(1);
  const menuWith = await readMenu(page);

  // Exactly one Frogly script in head, with the exact attributes.
  const scripts = await froglyScripts(page);
  expect(scripts).toEqual([
    {
      src: CORE_SRC,
      integrity: CORE_INTEGRITY,
      crossorigin: "anonymous",
      async: true,
      dataCfg: EXPECTED_SITE_ID,
      dataQuiet: "1",
      inHead: true,
      attributes: ["async", "crossorigin", "data-cfg", "data-quiet", "integrity", "src"],
    },
  ]);

  // The browser ran the core (so the integrity check passed): the core then
  // asks for its signed config.
  await expect.poll(() => cfgStatus.length, { timeout: 30_000 }).toBeGreaterThan(0);
  console.log(`[${testInfo.project.name}] config request ${CFG_URL} answered ${cfgStatus[0]}`);

  // Still one script after the app has settled.
  await page.waitForTimeout(3_000);
  expect(await froglyScripts(page)).toHaveLength(1);

  // The account menu looks and works the same.
  expect(menuWith).toEqual(menuWithout);
  const worksWith = await menuWorks(page);
  expect(worksWith).toBe(worksWithout);
  console.log(
    `[${testInfo.project.name}] account menu "${menuWith.text}" at ${JSON.stringify(menuWith.box)}, opens dialog: ${worksWith}`,
  );

  // No console error from the plugin or from an integrity check.
  const relevant = errors.filter((line) => /frogly|integrity|\[plugins\]|\[Plugin frogly\]/i.test(line));
  expect(relevant, relevant.join("\n")).toEqual([]);
  await page.close();
});
