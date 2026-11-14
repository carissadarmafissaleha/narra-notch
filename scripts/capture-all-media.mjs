// Captures every README screenshot (desktop notch + iPhone PWA companion).
// Usage: npm run build && node scripts/capture-all-media.mjs
import puppeteer from "puppeteer-core";
import { preview } from "vite";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const OUT_DIR = resolve("docs/media");

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const DESKTOP = { width: 960, height: 680, deviceScaleFactor: 2 };
const IPHONE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const D = "showcase&bg=white&lang=id";

const SHOTS = [
  // ── Closed notch ──
  { name: "01-closed-idle.png", query: `${D}&closed=1` },
  { name: "02-closed-media.png", query: `${D}&closed=1&play=1` },
  { name: "03-closed-lyrics.png", query: `${D}&closed=1&play=1&lyrics=1` },
  // ── Open notch tools ──
  { name: "04-overview.png", query: `${D}&tab=overview` },
  { name: "05-prayer-times.png", query: `${D}&tab=prayer` },
  { name: "06-water-reminder.png", query: `${D}&tab=water` },
  { name: "07-whatsapp.png", query: `${D}&tab=whatsapp` },
  { name: "08-coding-agent-idle.png", query: `${D}&tab=agent` },
  { name: "09-coding-agent-approval.png", query: `${D}&tab=agent&agentStatus=approval` },
  { name: "10-coding-agent-diff.png", query: `${D}&tab=agent&agentStatus=approval&agentSubTab=diff` },
  { name: "11-now-playing.png", query: `${D}&tab=media&play=1&lyrics=0` },
  { name: "12-lyrics-karaoke.png", query: `${D}&tab=media&play=1&lyrics=1` },
  { name: "13-timer-stopwatch.png", query: `${D}&tab=timer` },
  { name: "14-todos.png", query: `${D}&tab=todos` },
  { name: "15-notes.png", query: `${D}&tab=notes` },
  { name: "16-clipboard-history.png", query: `${D}&tab=clipboard` },
  { name: "17-shelf.png", query: `${D}&tab=shelf` },
  { name: "18-ai-ask.png", query: `${D}&tab=ask` },
  { name: "19-converter.png", query: `${D}&tab=convert` },
  { name: "20-trading-portfolio.png", query: `${D}&tab=trading` },
  { name: "21-ai-usage.png", query: `${D}&tab=usage` },
  { name: "22-weather.png", query: `${D}&tab=weather` },
  { name: "23-hardware-system-hud.png", query: `${D}&tab=system` },
  { name: "24-discord.png", query: `${D}&tab=discord` },
  { name: "25-vault-passwords.png", query: `${D}&tab=vault` },
  { name: "26-settings-display.png", query: `${D}&tab=settings&section=display` },
  { name: "27-settings-tools.png", query: `${D}&tab=settings&section=tools` },
  { name: "28-settings-coding-agent.png", query: `${D}&tab=settings&section=agent` },
  // ── New in v1.5.x ──
  { name: "29-coding-agent-working.png", query: `${D}&tab=agent&agentStatus=working` },
  { name: "30-coding-agent-wardrobe.png", query: `${D}&tab=agent&agentSubTab=wardrobe` },
  { name: "31-closed-agent-working.png", query: `${D}&closed=1&agentStatus=working` },
  // ── iPhone PWA companion ──
  { name: "pwa-01-idle.png", query: "mobile&showcase&lang=id", viewport: IPHONE },
  { name: "pwa-02-working.png", query: "mobile&showcase&lang=id&agentStatus=working", viewport: IPHONE },
  { name: "pwa-03-approval.png", query: "mobile&showcase&lang=id&agentStatus=approval", viewport: IPHONE },
  { name: "pwa-04-chat.png", query: "mobile&showcase&lang=id", viewport: IPHONE, click: "Chat" },
  { name: "pwa-05-diff.png", query: "mobile&showcase&lang=id&agentStatus=working", viewport: IPHONE, click: "Diff" },
  { name: "pwa-06-wardrobe.png", query: "mobile&showcase&lang=id", viewport: IPHONE, clickTitle: "Koleksi Pakaian" },
];

async function clickButton(page, { text, title }) {
  const clicked = await page.evaluate(
    ({ text, title }) => {
      const buttons = [...document.querySelectorAll("button")];
      const match = buttons.find((b) =>
        title ? (b.getAttribute("title") || "").toLowerCase().includes(title.toLowerCase())
              : (b.textContent || "").trim().toLowerCase() === text.toLowerCase(),
      );
      if (match) match.click();
      return Boolean(match);
    },
    { text, title },
  );
  if (!clicked) console.warn(`  ! button not found: ${text || title}`);
}

async function main() {
  const server = await preview({ preview: { port: 5218 } });
  const urlBase = server.resolvedUrls.local[0] || "http://localhost:5218/";
  console.log(`Preview server ready at ${urlBase}`);

  const profileDir = resolve(tmpdir(), `edge_shot_${Date.now()}`);
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    userDataDir: profileDir,
    args: ["--no-first-run", "--no-default-browser-check", "--disable-gpu"],
  });

  try {
    for (let i = 0; i < SHOTS.length; i++) {
      const shot = SHOTS[i];
      // Isolated incognito context per shot so persisted localStorage (sub-tab, toasts) never leaks.
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      const viewport = shot.viewport || DESKTOP;
      if (viewport.isMobile) await page.setUserAgent(IPHONE_UA);
      await page.setViewport(viewport);

      console.log(`[${i + 1}/${SHOTS.length}] ${shot.name}`);
      await page.goto(`${urlBase}?${shot.query}`, { waitUntil: "networkidle0", timeout: 30000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));

      if (shot.click || shot.clickTitle) {
        await clickButton(page, { text: shot.click, title: shot.clickTitle });
        await new Promise((r) => setTimeout(r, 900));
      }

      await page.screenshot({ path: resolve(OUT_DIR, shot.name), type: "png" });
      await context.close();
    }
  } finally {
    await browser.close();
    await server.httpServer.close();
    try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
  }

  console.log(`\nAll ${SHOTS.length} screenshots saved to docs/media/`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error capturing screenshots:", err);
  process.exit(1);
});
