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
    });
    page = await browser.newPage();
    page.setDefaultTimeout(30000);

    console.log(`[${new Date().toISOString()}] 🔹 Browser iniciado e permanecerá ativo`);
  }
}

/**
 * Interage com submeter_requisicacao.html simulando clique
 * @param {string} endpoint - ex: "salvar_sessao.php"
 * @param {object} options - { data: { chave:valor } }
 */
async function acessarServidor(endpoint, options = {}) {
  try {
    await initBrowser();

    const htmlUrl = BASE_URL + "submeter_requisicacao.html";
    console.log(`[${new Date().toISOString()}] 🔹 Abrindo: ${htmlUrl}`);
    await page.goto(htmlUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Preenche campo nome, se existir
    if (options.data?.nome) {
      await page.evaluate((nome) => {
        const input = document.querySelector("#nomeSessao");
        if (input) input.value = nome;
      }, options.data.nome);
      console.log(`[${new Date().toISOString()}] 🔹 Nome preenchido: ${options.data.nome}`);
    }

    // Clica no botão correspondente ao endpoint
    const clicked = await page.evaluate((endpoint) => {
      const btn = Array.from(document.querySelectorAll("button")).find(b =>
        b.getAttribute("onclick")?.includes(endpoint)
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    }, endpoint);

    if (!clicked) {
      return { success: false, error: `Botão para ${endpoint} não encontrado` };
    }
    console.log(`[${new Date().toISOString()}] 🔹 Botão ${endpoint} clicado`);

    // Espera até que a div #output tenha algum conteúdo que não seja "Enviando requisição"
    const texto = await page.waitForFunction(() => {
      const el = document.querySelector("#output");
      if (!el) return false;
      const txt = el.textContent.trim();
      return txt && !txt.includes("Enviando requisição") ? txt : false;
    }, { timeout: 30000 }).then(handle => handle.jsonValue());

    console.log(`[${new Date().toISOString()}] 🔹 Resposta bruta recebida:`, texto);

    // Tenta converter em JSON
    try {
      const parsed = JSON.parse(texto);
      console.log(`[${new Date().toISOString()}] 🔹 Resposta parseada:`, parsed);
      return parsed;
    } catch (err) {
      console.error(`[${new Date().toISOString()}] ❌ Falha ao parsear JSON: ${err.message}`);
      return { success: false, error: "Resposta não é JSON válida", raw: texto };
    }

  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Erro acessarServidor(${endpoint}): ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Fecha o browser manualmente (se for chamado explicitamente)
 */
async function fecharBrowser() {
  if (browser) {
    try {
      await browser.close();
      console.log(`[${new Date().toISOString()}] 🔹 Browser fechado manualmente`);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] ⚠️ Falha ao fechar browser: ${err.message}`);
    } finally {
      browser = null;
      page = null;
    }
  }
}

module.exports = { acessarServidor, initBrowser, fecharBrowser };
