const puppeteer = require("puppeteer");

const BASE_URL = "https://livestream.ct.ws/Web/";

let browser;
let page;

async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true, // Executa em background
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
 * Acessa o servidor através de submeter_requisicacao.html simulando interação humana
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

    // 2️⃣ Preenche o input de nome da sessão se existir
    if (options.data && options.data.nome) {
      await page.evaluate((nome) => {
        const input = document.querySelector("#nomeSessao");
        if (input) input.value = nome;
      }, options.data.nome);
    }

    // 3️⃣ Clica no botão correspondente ao endpoint
    await page.evaluate((endpoint) => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.onclick.toString().includes(endpoint));
      if (btn) btn.click();
    }, endpoint);

    // 4️⃣ Captura a resposta da div#output
    const resposta = await page.waitForFunction(
      () => document.querySelector("#output")?.textContent || null,
      { timeout: 30000 }
    );
    const texto = await resposta.jsonValue();

    // 5️⃣ Tenta converter em JSON
    try {
      return JSON.parse(texto);
    } catch {
      return { success: false, error: "Resposta não é JSON", raw: texto };
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

