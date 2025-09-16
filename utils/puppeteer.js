const puppeteer = require("puppeteer");

const BASE_URL = "https://livestream.ct.ws/Web/";

let browser; // manter browser global
let page;    // manter página global

async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({ headless: false }); // headless:false ajuda a depurar
    page = await browser.newPage();
  }
}

// Função para enviar requisições ao servidor
async function acessarServidor(endpoint, options = {}) {
  await initBrowser();
  const url = BASE_URL + endpoint;

  await page.goto(url, { waitUntil: "networkidle2" }); // espera o JS do site carregar

  if (options.method === "POST") {
    const resposta = await page.evaluate(async (dados) => {
      const formData = new FormData();
      for (const k in dados) {
        formData.append(k, dados[k]);
      }
      const r = await fetch(window.location.href, { method: "POST", body: formData });
      return await r.json();
    }, options.data);

    return resposta;
  } else {
    // GET
    const conteudo = await page.evaluate(() => document.body.innerText);
    try {
      return JSON.parse(conteudo);
    } catch (err) {
      console.error("Erro ao parsear JSON:", err);
      return conteudo; // retorna como texto se não for JSON
    }
  }
}

// Função para fechar o browser quando terminar
async function fecharBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
  }
}

module.exports = { acessarServidor, fecharBrowser };
