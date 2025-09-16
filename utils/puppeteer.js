const puppeteer = require("puppeteer");

const BASE_URL = "https://livestream.ct.ws/Web/";

let browser;
let page;

async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      // evita que o browser feche sozinho
      autoClose: 0,
    });
    page = await browser.newPage();
  }
}

/**
 * Acessa servidor PHP usando Puppeteer, resolvendo JS injetado (Cloudflare, cookies, etc.)
 * @param {string} endpoint - Ex: "listar_sessoes.php"
 * @param {object} options - { method: "POST"|"GET", data: {chave:valor} }
 */
async function acessarServidor(endpoint, options = {}) {
  try {
    await initBrowser();
    const url = BASE_URL + endpoint;

    console.log(`[${new Date().toISOString()}] 🔹 Acessando servidor: ${url}`);

    await page.goto(url, { waitUntil: "domcontentloaded" });

    // espera 5 segundos pra JS injetado terminar
    await page.waitForTimeout(5000);

    if (options.method === "POST") {
      const resposta = await page.evaluate(async (dados) => {
        const formData = new FormData();
        for (const k in dados) formData.append(k, dados[k]);
        const r = await fetch(window.location.href, { method: "POST", body: formData });
        return await r.text();
      }, options.data);

      try {
        const json = JSON.parse(resposta);
        return json;
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
    return { success: false, error: err.message };
  }
}

async function fecharBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
    console.log(`[${new Date().toISOString()}] 🔹 Browser fechado`);
  }
}

module.exports = { acessarServidor, fecharBrowser };

