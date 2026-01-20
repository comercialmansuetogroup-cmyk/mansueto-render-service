// index.js
import express from "express";
import { chromium } from "playwright";

const app = express();
const PORT = process.env.PORT || 3000;
const RENDER_SECRET = process.env.RENDER_SECRET;

app.use(express.json({ limit: "100mb" }));

let browser;

/** Reutiliza el navegador (más rápido y estable) */
async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browser;
}

/** Health check */
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/** Render HTML -> PDF (base64) */
app.post("/render", async (req, res) => {
  const t0 = Date.now();

  try {
    // Seguridad por secret compartido
    const authHeader = req.get("X-Render-Secret");
    if (!RENDER_SECRET || authHeader !== RENDER_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { html, widthMm = 80, heightMm = 80 } = req.body;
    if (!html) return res.status(400).json({ error: "HTML is required" });

    const b = await getBrowser();
    const context = await b.newContext();
    const page = await context.newPage();

    // Cargar HTML (sin dependencias externas recomendado)
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForTimeout(200);

    const pdfBuffer = await page.pdf({
      width: `${widthMm}mm`,
      height: `${heightMm}mm`,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      printBackground: true,
      preferCSSPageSize: true,
    });

    // Limpieza correcta (evita fugas)
    await page.close();
    await context.close();

    return res.json({
      success: true,
      pdf: pdfBuffer.toString("base64"),
      size: pdfBuffer.length,
      renderMs: Date.now() - t0,
    });
  } catch (error) {
    console.error("Render error:", error);

    return res.status(500).json({
      error: "Render failed",
      message: error?.message || String(error),
      renderMs: Date.now() - t0,
    });
  }
});

// Cierre limpio (Railway manda SIGTERM en redeploy)
async function shutdown() {
  try {
    if (browser) await browser.close();
  } catch {}
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// IMPORTANTE: escuchar en 0.0.0.0 para contenedores
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Render service listening on port ${PORT}`);
});

