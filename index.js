import express from "express";
import { chromium } from "playwright";

const app = express();
const PORT = process.env.PORT || 3000;
const RENDER_SECRET = process.env.RENDER_SECRET;

app.use(express.json({ limit: "100mb" }));

let browser;

async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browser;
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/render", async (req, res) => {
  const t0 = Date.now();
  let context;
  let page;

  try {
    const authHeader = req.get("X-Render-Secret");
    if (!RENDER_SECRET || authHeader !== RENDER_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { html, widthMm = 80, heightMm = 80 } = req.body;
    if (!html) return res.status(400).json({ error: "HTML is required" });

    const b = await getBrowser();
    context = await b.newContext();
    page = await context.newPage();

    // Evita renders eternos
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(15000);

    await page.setContent(html, { waitUntil: "load" });
    await page.waitForTimeout(100);

    const pdfBuffer = await page.pdf({
      width: `${widthMm}mm`,
      height: `${heightMm}mm`,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      printBackground: true,
      // Si ya pasas width/height, esto puede estorbar según CSS; mejor dejarlo en false.
      preferCSSPageSize: false,
    });

    res.json({
      success: true,
      pdf: pdfBuffer.toString("base64"),
      size: pdfBuffer.length,
      renderMs: Date.now() - t0,
    });
  } catch (error) {
    console.error("Render error:", error);
    res.status(500).json({
      error: "Render failed",
      message: error?.message || String(error),
      renderMs: Date.now() - t0,
    });
  } finally {
    try {
      if (page) await page.close();
    } catch {}
    try {
      if (context) await context.close();
    } catch {}
  }
});

// cierre limpio
process.on("SIGTERM", async () => {
  try {
    if (browser) await browser.close();
  } catch {}
  process.exit(0);
});

app.listen(PORT, "0.0.0.0", () =>
  console.log(`Render service listening on port ${PORT}`)
);

