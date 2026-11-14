import puppeteer from "puppeteer-core";
import { preview } from "vite";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const OUT_DIR = resolve("docs/media");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const SHOTS = [
  {
    name: "water-reminder.png",
    query: "showcase&tab=water&theme=monochrome&lang=en",
  },
  {
    name: "prayer-times.png",
    query: "showcase&tab=prayer&theme=monochrome&lang=en",
  },
  {
    name: "theme-glass.png",
    query: "showcase&tab=media&play=1&theme=glass&lang=en",
  },
  {
    name: "theme-gradient.png",
    query: "showcase&tab=settings&section=display&theme=gradient&lang=en",
  },
  {
    name: "hero-notch-closed.png",
    query: "showcase&closed=1&play=1&theme=glass&lang=en",
  },
];

async function main() {
  console.log("Starting programmatic Vite preview server...");
  const server = await preview({
    preview: { port: 5199 },
  });

  const urlBase = server.resolvedUrls.local[0] || "http://localhost:5199/";
  console.log(`Preview server ready at ${urlBase}`);

  console.log("Launching Edge browser with puppeteer-core...");
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-first-run", "--no-default-browser-check", "--disable-gpu"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 600, deviceScaleFactor: 2 });

  for (const shot of SHOTS) {
    const targetUrl = `${urlBase}?${shot.query}`;
    console.log(`Navigating to ${shot.name}...`);
    await page.goto(targetUrl, { waitUntil: "networkidle0" });
    // Allow spring animations to settle
    await new Promise((r) => setTimeout(r, 1200));

    const outPath = resolve(OUT_DIR, shot.name);
    await page.screenshot({ path: outPath, type: "png" });
    console.log(`Saved: ${shot.name}`);
  }

  await browser.close();
  await server.httpServer.close();
  console.log("All screenshots successfully captured!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error capturing screenshots:", err);
  process.exit(1);
});
