import express from 'express';
import { chromium } from 'playwright';

const app = express();
const PORT = process.env.PORT || 3000;
const RENDER_SECRET = process.env.RENDER_SECRET;

app.use(express.json({ limit: '100mb' }));

let browser;

/**
 * Reutiliza una única instancia de Chromium
 * (clave para rendimiento y estabilidad en Railway)
 */
async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
    });
  }
  return browser;
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Render HTML → PDF
app.post('/render', async (req, res) => {
  const start = Date.now();

  try {
    // Seguridad por secret compartido
    const authHeader = req.get('X-Render-Secret');
    if (authHeader !== RENDER_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { html, widthMm = 80, heightMm = 80 } = req.body;

    if (!html) {
      return res.status(400).json({ error: 'HTML is required' });
    }

    const b = await getBrowser();
    const context = await b.newContext();
    const page = await context.newPage();

    // Cargar HTML SIN networkidle (evita cuelgues)
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(200);

    const pdfBuffer = await page.pdf({
      width: `${widthMm}mm`,
      height: `${heightMm}mm`,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
      printBackground: true,
      preferCSSPageSize: true,
    });

    await context.close();

    res.json({
      success: true,
      pdf: pdfBuffer.toString('base64'),
      size: pdfBuffer.length,
      renderMs: Date.now() - start,
    });
  } catch (error) {
    console.error('Render error:', error);

    res.status(500).json({
      error: 'Render failed',
      message: error?.message || String(error),
      renderMs: Date.now() - start,
    });
  }
});

// Arranque
app.listen(PORT, () => {
  console.log(`Render service listening on port ${PORT}`);
});

// Cierre limpio (opcional pero recomendable)
process.on('SIGTERM', async () => {
  if (browser) await browser.close();
  process.exit(0);
});
