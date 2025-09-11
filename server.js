<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>WhatsApp - Conexão</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #f5f7fa;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .container {
      text-align: center;
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.1);
      width: 320px;
    }
    img {
      width: 90px; /* largura fixa */
      height: 40vh;
      margin-bottom: 15px;
    }
    .hidden {
      display: none;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    input, textarea, button {
      padding: 10px;
      border-radius: 8px;
      border: 1px solid #ccc;
      font-size: 14px;
    }
    button {
      background: #25d366;
      color: white;
      border: none;
      cursor: pointer;
      transition: 0.3s;
    }
    button:hover {
      background: #20b857;
    }
    #statusMsg, #qrText {
      margin-top: 10px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="container">
    <div id="qr-section">
      <h2>Escaneie o QR Code</h2>
      <img id="qr" src="" alt="QR Code">
      <p id="qrText">Aguardando QR Code...</p>
    </div>
    <div id="form-section" class="hidden">
      <h2>Enviar Mensagem</h2>
      <form id="msgForm">
        <input type="text" id="number" placeholder="Número (ex: 25884xxxxxxx)" required>
        <textarea id="message" placeholder="Digite sua mensagem" required></textarea>
        <button type="submit">Enviar</button>
      </form>
      <p id="statusMsg"></p>
    </div>
  </div>

  <script>
    const qrImg = document.getElementById("qr");
    const qrText = document.getElementById("qrText");

    async function updateQR() {
      try {
        const statusRes = await fetch("/status");
        const statusData = await statusRes.json();

        if (statusData.connected) {
          document.getElementById("qr-section").classList.add("hidden");
          document.getElementById("form-section").classList.remove("hidden");
        } else {
          document.getElementById("qr-section").classList.remove("hidden");
          document.getElementById("form-section").classList.add("hidden");
          fetchQRCode();
        }
      } catch (err) {
        console.error("Erro ao atualizar status", err);
      }
    }

    async function fetchQRCode() {
      try {
        const timestamp = new Date().getTime();
        const res = await fetch("/qr.png?timestamp=" + timestamp);
        if (res.status === 200) {
          const blob = await res.blob();
          qrImg.src = URL.createObjectURL(blob);
          qrText.textContent = "";
        } else {
          qrImg.src = "";
          qrText.textContent = "Aguardando QR Code...";
          setTimeout(fetchQRCode, 3000);
        }
      } catch (err) {
        qrImg.src = "";
        qrText.textContent = "Aguardando QR Code...";
        setTimeout(fetchQRCode, 3000);
      }
    }

    // Atualiza QR principal a cada 30 segundos
    updateQR();
    setInterval(updateQR, 30000);

    // Enviar mensagem
    document.getElementById("msgForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const number = document.getElementById("number").value;
      const message = document.getElementById("message").value;

      try {
        const res = await fetch("/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ number, message }),
        });
        const data = await res.json();
        document.getElementById("statusMsg").textContent = data.success
          ? "✅ Mensagem enviada!"
          : "❌ Erro: " + (data.error || "desconhecido");
      } catch (err) {
        document.getElementById("statusMsg").textContent = "❌ Erro ao enviar mensagem";
        console.error(err);
      }
    });
  </script>
</body>
</html>
