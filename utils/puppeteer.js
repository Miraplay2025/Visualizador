const puppeteer = require("puppeteer");

const BASE_URL = "https://livestream.ct.ws/Web/";

async function acessarServidor(endpoint, options = {}) {
  let browser;
  let page;
  try {
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
    console.log(`[${new Date().toISOString()}] 🔹 Browser iniciado`);

    const htmlUrl = BASE_URL + "submeter_requisicacao.html";
    console.log(`[${new Date().toISOString()}] 🔹 Abrindo: ${htmlUrl}`);
    await page.goto(htmlUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Preenche nome da sessão
    if (options.data?.nome) {
      await page.evaluate((nome) => {
        const input = document.querySelector("#nomeSessao");
        if (input) input.value = nome;
      }, options.data.nome);
      console.log(`[${new Date().toISOString()}] 🔹 Nome preenchido: ${options.data.nome}`);
    }

    // Preenche dados JSON ou base64 QR code
    if (options.data?.dados || options.data?.qrcode) {
      await page.evaluate((dados, qrcode) => {
        let input = document.querySelector("#dadosSessao");
        if (!input) {
          input = document.createElement("input");
          input.type = "hidden";
          input.id = "dadosSessao";
          input.name = "dados";
          document.body.appendChild(input);
        }
        if (qrcode) input.value = qrcode;
        else if (dados) input.value = JSON.stringify(dados);
      }, options.data.dados, options.data.qrcode);
      console.log(`[${new Date().toISOString()}] 🔹 Dados preenchidos`);
    }

    // Clica no botão correspondente ao endpoint
    const clicked = await page.evaluate((endpoint) => {
      const btn = Array.from(document.querySelectorAll("button")).find(b =>
        b.getAttribute("onclick")?.includes(endpoint)
      );
      if (btn) { btn.click(); return true; }
      return false;
    }, endpoint);

    if (!clicked) return { success: false, error: `Botão ${endpoint} não encontrado` };
    console.log(`[${new Date().toISOString()}] 🔹 Botão ${endpoint} clicado`);

    // Espera resposta JSON no div #output
    const texto = await page.waitForFunction(() => {
      const el = document.querySelector("#output");
      if (!el) return false;
      const txt = el.textContent.trim();
      return txt && !txt.includes("Enviando requisição") ? txt : false;
    }, { timeout: 30000 }).then(handle => handle.jsonValue());

    console.log(`[${new Date().toISOString()}] 🔹 Resposta bruta:`, texto);

    // Parse JSON
    try {
      const parsed = JSON.parse(texto);
      console.log(`[${new Date().toISOString()}] 🔹 Resposta parseada:`, parsed);
      return parsed;
    } catch (err) {
      return { success: false, error: "Resposta não é JSON válida", raw: texto };
    }

  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Erro acessarServidor: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log(`[${new Date().toISOString()}] 🔹 Browser fechado após resposta`);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] ⚠️ Erro ao fechar browser: ${err.message}`);
      }
    }
  }
}

module.exports = { acessarServidor };
