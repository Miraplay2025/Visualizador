const puppeteer = require("puppeteer");

const BASE_URL = "https://livestream.ct.ws/Web/";

let browser;
let page;

/**
 * Inicializa o browser se ainda não foi criado
 */
async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
      ],
      ignoreHTTPSErrors: true,
      defaultViewport: null,
      // 🔴 evita que o browser feche sozinho
      autoClose: 0,
    });

    page = await browser.newPage();
    page.setDefaultTimeout(30000); // timeout padrão 30s
  }
}

/**
 * Acessa servidor PHP usando Puppeteer, resolvendo JS injetado
 * @param {string} endpoint - Ex: "listar_sessoes.php"
 * @param {object} options - { method: "POST"|"GET", data: {chave:valor} }
 */
async function acessarServidor(endpoint, options = {}) {
  try {
    await initBrowser();
    const url = BASE_URL + endpoint;

    console.log(`[${new Date().toISOString()}] 🔹 Acessando servidor: ${url}`);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // ⬅️ espera apenas 5 segundos para JS injetado terminar
    await new Promise((resolve) => setTimeout(resolve, 5000));

    if (options.method === "POST") {
      const resposta = await page.evaluate(async (dados) => {
        const formData = new FormData();
        for (const k in dados) formData.append(k, dados[k]);
        const r = await fetch(window.location.href, { method: "POST", body: formData });
        return await r.text();
      }, options.data);

      try {
        return JSON.parse(resposta);
      } catch {
        return { success: false, error: "Resposta não é JSON", raw: resposta };
      }
    } else {
      const conteudo = await page.evaluate(() => document.body.innerText);
      try {
        return JSON.parse(conteudo);
      } catch {
        return { success: false, error: "Resposta não é JSON", raw: conteudo };
      }
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Erro acessarServidor(${endpoint}): ${err.message}`);
    // Evita congelamento do Render retornando sempre JSON, mesmo em erro
    return { success: false, error: err.message };
  }
}

/**
 * Fecha o browser manualmente, se necessário
 */
async function fecharBrowser() {
  if (browser) {
    try {
      await browser.close();
      console.log(`[${new Date().toISOString()}] 🔹 Browser fechado`);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] ⚠️ Falha ao fechar browser: ${err.message}`);
    } finally {
      browser = null;
      page = null;
    }
  }
}

module.exports = { acessarServidor, fecharBrowser };
