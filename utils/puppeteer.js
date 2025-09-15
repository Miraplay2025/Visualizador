const puppeteer = require("puppeteer");

const BASE_URL = "https://livestream.ct.ws/Web/";

async function acessarServidor(endpoint, options = {}) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  const url = BASE_URL + endpoint;

  if (options.method === "POST") {
    await page.goto(url, { waitUntil: "networkidle2" });
    const resposta = await page.evaluate(async (dados) => {
      const formData = new FormData();
      for (const k in dados) {
        formData.append(k, dados[k]);
      }
      const r = await fetch(window.location.href, { method: "POST", body: formData });
      return await r.json();
    }, options.data);
    await browser.close();
    return resposta;
  } else {
    await page.goto(url, { waitUntil: "networkidle2" });
    const conteudo = await page.evaluate(() => document.body.innerText);
    await browser.close();
    return JSON.parse(conteudo);
  }
}

module.exports = { acessarServidor };
