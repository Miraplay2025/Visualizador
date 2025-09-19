<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Gerenciador de Sessões WhatsApp</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --primary: #3498db;
      --secondary: #2ecc71;
      --danger: #e74c3c;
      --warning: #f1c40f;
      --bg: #f5f6fa;
      --text: #333;
    }

    body {
      font-family: "Segoe UI", Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
    }

    header {
      background: var(--primary);
      color: #fff;
      padding: 15px;
      text-align: center;
      font-size: 20px;
      font-weight: bold;
      position: relative;
    }

    header .top-btn {
      position: absolute;
      right: 15px;
      top: 50%;
      transform: translateY(-50%);
      background: var(--secondary);
      border: none;
      color: white;
      padding: 10px 18px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: bold;
      transition: 0.3s;
    }

    header .top-btn:hover {
      background: #27ae60;
    }

    .container {
      max-width: 900px;
      margin: 20px auto;
      padding: 15px;
    }

    .session {
      border: 1px solid #ddd;
      margin: 12px 0;
      padding: 15px;
      background: #fff;
      border-radius: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
    }

    .session-left {
      display: flex;
      flex-direction: column;
    }

    .session span.name {
      cursor: pointer;
      font-weight: bold;
      color: var(--primary);
      font-size: 16px;
    }

    .session span.status {
      font-size: 14px;
      margin-top: 4px;
    }

    .status-online {
      color: var(--secondary);
      font-weight: bold;
    }

    .status-offline {
      color: var(--danger);
      font-weight: bold;
    }

    .session-controls {
      display: flex;
      gap: 10px;
      margin-top: 10px;
      flex-wrap: wrap;
    }

    .btn {
      padding: 8px 14px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      transition: 0.3s;
    }

    .btn-connect {
      background: var(--warning);
      color: #fff;
    }

    .btn-connect:hover {
      background: #d4ac0d;
    }

    .btn-delete {
      background: var(--danger);
      color: #fff;
    }

    .btn-delete:hover {
      background: #c0392b;
    }

    .popup {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.6);
      justify-content: center;
      align-items: center;
      padding: 15px;
      z-index: 1000;
    }

    .popup-content {
      background: #fff;
      padding: 25px;
      border-radius: 12px;
      width: 100%;
      max-width: 400px;
      text-align: center;
      position: relative;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    .popup-content h2 {
      margin: 0 0 15px 0;
    }

    .popup-content input {
      width: 90%;
      padding: 10px;
      border: 1px solid #ccc;
      border-radius: 8px;
      margin-bottom: 15px;
      font-size: 15px;
    }

    .popup-content .btn {
      width: 95%;
      margin-top: 5px;
    }

    .close-btn {
      position: absolute;
      top: 12px;
      right: 15px;
      cursor: pointer;
      font-size: 22px;
      color: #999;
    }

    .close-btn:hover {
      color: #555;
    }

    .status {
      font-size: 14px;
      margin-top: 8px;
      color: #555;
    }

    img.qr {
      max-width: 100%;
      border: 1px solid #ddd;
      border-radius: 8px;
      margin: 10px 0;
    }

    .error {
      color: red;
      margin-top: 10px;
    }

    .success {
      color: green;
      margin-top: 10px;
    }

    .retorno {
      margin-top: 10px;
      font-weight: bold;
    }

    @media(max-width:600px) {
      header {
        font-size: 18px;
        padding: 12px;
      }
      .session {
        flex-direction: column;
        align-items: flex-start;
      }
      .session-controls {
        width: 100%;
        justify-content: flex-start;
      }
      .btn {
        width: 100%;
        text-align: center;
      }
    }
  </style>
</head>
<body>
<header>
  Gerenciador de Sessões WhatsApp
  <button class="top-btn" onclick="openNewSessionPopup()">Nova Sessão</button>
</header>

<div class="container" id="sessionList">Carregando sessões...</div>

<!-- Popup Nova Sessão -->
<div class="popup" id="newSessionPopup">
  <div class="popup-content">
    <span class="close-btn" onclick="closePopup('newSessionPopup')">&times;</span>
    <h2>Criar Nova Sessão</h2>
    <input type="text" id="sessionName" placeholder="Digite o nome da sessão">
    <button class="btn" style="background:var(--primary);color:#fff;" id="createBtn" onclick="createSession()">Criar Sessão</button>
    <div class="error" id="createError"></div>
    <div class="success" id="createSuccess"></div>
    <div class="retorno" id="createRetorno"></div>
  </div>
</div>

<!-- Popup QR Code -->
<div class="popup" id="qrPopup">
  <div class="popup-content">
    <span class="close-btn" onclick="closePopup('qrPopup')">&times;</span>
    <h2>Conectar Sessão</h2>
    <div id="qrArea">Clique em "Atualizar QRCode" para gerar o QR</div>
    <div class="status" id="qrStatus"></div>
    <div class="error" id="qrError"></div>
    <div class="retorno" id="qrRetorno"></div>
    <button class="btn" style="background:var(--primary);color:#fff;" id="refreshQrBtn" onclick="fetchQRManual()">Atualizar QRCode</button>
  </div>
</div>

<script>
const API_BASE = "https://visualizador-o1yz.onrender.com";

function openNewSessionPopup() {
  document.getElementById("newSessionPopup").style.display = "flex";
  document.getElementById("createError").textContent = "";
  document.getElementById("createSuccess").textContent = "";
  document.getElementById("createRetorno").textContent = "";
}

function closePopup(id){ document.getElementById(id).style.display = "none"; }

// Listar sessões
async function loadSessions() {
  try {
    const res = await fetch(`${API_BASE}/listar`);
    const data = await res.json();
    const container = document.getElementById("sessionList");
    container.innerHTML = "";
    const sessions = Array.isArray(data.sessoes)?data.sessoes:[];
    if(!sessions.length){ container.innerHTML="<p style='text-align:center;font-weight:bold;'>Nenhuma sessão encontrada</p>"; return; }

    sessions.forEach(s=>{
      const div = document.createElement("div");
      div.className="session";

      const statusHTML = s.conectado 
        ? `<span class="status status-online">✅ Conectado</span>` 
        : `<span class="status status-offline">❌ Não conectado</span>`;

      div.innerHTML = `
        <div class="session-left">
          <span class="name">${s.nome}</span>
          ${statusHTML}
        </div>
        <div class="session-controls">
          <button class="btn btn-connect" onclick="connectSession('${s.nome}')">Conectar</button>
          <button class="btn btn-delete" onclick="deleteSession('${s.nome}')">Excluir</button>
        </div>
        <div class="retorno" id="retorno-${s.nome}"></div>
      `;
      container.appendChild(div);
    });
  } catch(err) {
    document.getElementById("sessionList").innerHTML="<p style='color:red;text-align:center;'>Erro: "+err.message+"</p>";
  }
}

// Criar sessão
async function createSession() {
  const name = document.getElementById("sessionName").value.trim();
  const btn = document.getElementById("createBtn");
  const errBox = document.getElementById("createError");
  const successBox = document.getElementById("createSuccess");
  const retorno = document.getElementById("createRetorno");
  if(!name){ errBox.textContent="Digite um nome válido."; return; }

  btn.textContent="Criando..."; errBox.textContent=""; successBox.textContent=""; retorno.textContent="";

  try {
    const res = await fetch(`${API_BASE}/criar/${name}`, { method:"POST" });
    const data = await res.json();
    if(data.success){
      successBox.textContent="Sessão criada com sucesso!";
      retorno.innerHTML=`<span style="color:green">${data.nome||name}</span>`;
      btn.textContent="Criar Sessão";
      setTimeout(()=>{ 
        closePopup("newSessionPopup"); 
        loadSessions(); 
        currentSessionName = name; 
        // NÃO busca QR automaticamente
      }, 1000);
    } else {
      errBox.textContent=data.error||"Erro desconhecido";
      retorno.innerHTML=`<span style="color:red">${data.error||"Erro desconhecido"}</span>`;
      btn.textContent="Criar Sessão";
    }
  } catch(err){
    errBox.textContent=err.message;
    retorno.innerHTML=`<span style="color:red">${err.message}</span>`;
    btn.textContent="Criar Sessão";
  }
}

// Excluir sessão
async function deleteSession(name){
  if(!confirm("Deseja realmente excluir a sessão "+name+"?")) return;
  const retorno=document.getElementById(`retorno-${name}`);
  try{
    const res = await fetch(`${API_BASE}/deletar/${name}`,{method:"DELETE"});
    const data = await res.json();
    if(data.success){ loadSessions(); }
    else { retorno.innerHTML=`<span style="color:red">Erro: ${data.error}</span>`; }
  }catch(err){ retorno.innerHTML=`<span style="color:red">Erro: ${err.message}</span>`; }
}

// Conectar sessão (QR)
let currentSessionName = "";

function connectSession(name){
  currentSessionName = name;
  document.getElementById("qrPopup").style.display="flex";
  document.getElementById("qrArea").innerHTML="Clique em 'Atualizar QRCode' para gerar o QR"; 
  document.getElementById("qrStatus").textContent="";
  document.getElementById("qrError").textContent="";
  document.getElementById("qrRetorno").textContent="";
}

// Função para atualizar QR manualmente
async function fetchQRManual(){
  if(!currentSessionName) return;
  const qrArea=document.getElementById("qrArea");
  const qrStatus=document.getElementById("qrStatus");
  const qrError=document.getElementById("qrError");
  const retorno=document.getElementById("qrRetorno");

  qrArea.innerHTML="Gerando QRCode...";
  qrStatus.textContent="";

  try {
    // ⚡ Ajustado para .png
    const res = await fetch(`${API_BASE}/qrcode/${currentSessionName}.png?nocache=${Date.now()}`);
    const data = await res.json();
    if(data.success && data.base64){
      qrArea.innerHTML = `<img class="qr" src="data:image/png;base64,${data.base64}">`;
      qrStatus.textContent = "✅ QR code gerado. Escaneie com o WhatsApp.";
      qrError.textContent = "";
      retorno.textContent = "";
    } else if(data.error){
      qrError.textContent = data.error;
      qrArea.innerHTML = "";
      qrStatus.textContent = "";
      retorno.textContent = "";
    }
  } catch(err){
    qrError.textContent="Erro ao buscar QR code";
    qrArea.innerHTML="";
    console.error(`Erro ao buscar QR da sessão "${currentSessionName}":`, err);
  }
}

// Inicializa
loadSessions();
</script>
</body>
</html>
