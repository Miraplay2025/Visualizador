const puppeteer = require("puppeteer");

const BASE_URL = "https://livestream.ct.ws/Web/";

let browser;
let page;

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
      autoClose: 0, // 🔴 evita que o browser feche sozinho
    });
    page = await browser.newPage();
    page.setDefaultTimeout(30000);
  }
}

/**
 * Acessa o servidor através de submeter_requisicacao.html
 * @param {string} endpoint - Ex: "listar_sessoes.php"
 * @param {object} options - { method: "POST"|"GET", data: {chave:valor} }
 */
async function acessarServidor(endpoint, options = {}) {
  try {
    await initBrowser();

    // 1️⃣ Acessa a página HTML
    const htmlUrl = BASE_URL + "submeter_requisicacao.html";
    console.log(`[${new Date().toISOString()}] 🔹 Acessando HTML: ${htmlUrl}`);
    await page.goto(htmlUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // 2️⃣ Envia a requisição para o endpoint desejado via fetch
    const resposta = await page.evaluate(async (endpoint, options) => {
      const url = window.location.origin + "/" + endpoint;
      if (options.method === "POST") {
        const formData = new FormData();
        for (const key in options.data) {
          formData.append(key, options.data[key]);
        }
        const res = await fetch(url, { method: "POST", body: formData });
        return await res.text();
      } else {
        const params = new URLSearchParams(options.data || {}).toString();
        const res = await fetch(url + "?" + params);
        return await res.text();
      }
    }, endpoint, options);

    // 3️⃣ Tenta converter em JSON
    try {
      return JSON.parse(resposta);
    } catch {
      return { success: false, error: "Resposta não é JSON", raw: resposta };
    }

  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Erro acessarServidor(${endpoint}): ${err.message}`);
    return { success: false, error: err.message };
  }
}

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
