const puppeteer = require("puppeteer");

const BASE_URL = "https://livestream.ct.ws/Web/";

let browser;
let page;

async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true, // usar true em produção
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
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

    // espera 5 segundos para garantir carregamento completo (Cloudflare, cookies, etc.)
    await new Promise(resolve => setTimeout(resolve, 5000));

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
      // GET → pega conteúdo renderizado
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
