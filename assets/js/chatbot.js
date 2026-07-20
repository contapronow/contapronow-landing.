/* ────────────────────────────────────────────────────────────────────
   ContaProNow — Chatbot widget de captación de leads
   Ubicación en el repo: /assets/js/chatbot.js
   Incluir en cada página con: <script src="/assets/js/chatbot.js" defer></script>
   v2: paleta unificada con la identidad del sitio (azul corporativo)
   ──────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────────────
  // CONFIG
  // ────────────────────────────────────────────────────────────────────
  // El lead se envía a nuestro propio endpoint serverless (/api/lead), que
  // valida y reenvía a n8n desde el servidor. Así la URL de n8n ya no vive
  // en el cliente ni es invocable directamente desde el navegador.
  const LEAD_API_URL = '/api/lead';
  const CHAT_API_URL = '/api/chat';

  // NOTA DE SEGURIDAD: el SYSTEM_PROMPT ya NO vive aquí. Lo impone el servidor
  // en /api/chat.js como fuente única, para que el endpoint no pueda usarse
  // como un LLM de propósito general con un prompt arbitrario del cliente.

  // ────────────────────────────────────────────────────────────────────
  // ESTADO
  // ────────────────────────────────────────────────────────────────────
  let isOpen = false;
  let history = [];
  let leadDone = false;
  let typing = false;

  // ────────────────────────────────────────────────────────────────────
  // ESTILOS — paleta del sitio: azul corporativo sobre superficie clara
  // ────────────────────────────────────────────────────────────────────
  const styles = `
    .cpn-chat-bubble {
      position: fixed; bottom: 24px; right: 24px;
      width: 56px; height: 56px;
      background: #2A3A28; border-radius: 50%;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 14px 32px rgba(42,58,40,0.32), 0 2px 8px rgba(26,18,16,0.14);
      border: none; z-index: 9999;
      transition: transform 0.2s;
    }
    .cpn-chat-bubble:hover { transform: scale(1.08); }
    .cpn-chat-window {
      position: fixed; bottom: 92px; right: 24px;
      width: 375px; max-height: 600px;
      background: #ffffff; border: 1px solid rgba(26,18,16,0.1); border-radius: 20px;
      box-shadow: 0 24px 64px rgba(26,18,16,0.18);
      display: flex; flex-direction: column; overflow: hidden;
      z-index: 9998;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    @media (max-width: 480px) {
      .cpn-chat-window {
        width: calc(100vw - 24px); right: 12px; left: 12px;
        bottom: 88px; max-height: calc(100vh - 110px);
      }
    }
    .cpn-chat-header {
      background: #F9F5ED; border-bottom: 1px solid rgba(26,18,16,0.08);
      padding: 16px 18px; display: flex; align-items: center; gap: 12px;
    }
    .cpn-chat-avatar {
      width: 36px; height: 36px; background: #2A3A28; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 11px; color: #ffffff;
    }
    .cpn-chat-title { flex: 1; }
    .cpn-chat-title strong { display: block; font-size: 14px; color: #1A1210; }
    .cpn-chat-title span { font-size: 11px; color: #3E5340; }
    .cpn-chat-close {
      background: none; border: none; color: #6E6056; cursor: pointer; font-size: 18px;
    }
    .cpn-chat-messages {
      flex: 1; overflow-y: auto; padding: 18px 14px;
      display: flex; flex-direction: column; gap: 10px;
      background: #ffffff;
    }
    .cpn-msg-row { display: flex; align-items: flex-end; gap: 8px; }
    .cpn-msg-row.user { justify-content: flex-end; }
    .cpn-msg-avatar {
      width: 26px; height: 26px; background: #2A3A28; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 10px; color: #ffffff; flex-shrink: 0;
    }
    .cpn-msg-bubble {
      max-width: 80%; padding: 10px 13px; border-radius: 14px;
      font-size: 13.5px; line-height: 1.55;
    }
    .cpn-msg-bubble.bot {
      background: #F4EEE2; color: #1A1210; border: 1px solid rgba(26,18,16,0.06);
    }
    .cpn-msg-bubble.user {
      background: #2A3A28; color: #ffffff; font-weight: 500;
    }
    .cpn-quick-options {
      display: flex; flex-wrap: wrap; gap: 6px; padding-left: 34px;
    }
    .cpn-quick-btn {
      background: rgba(42,58,40,0.04); border: 1px solid rgba(42,58,40,0.18); color: #2A3A28;
      padding: 6px 12px; border-radius: 20px; font-size: 12px; cursor: pointer;
      font-family: inherit; font-weight: 600;
    }
    .cpn-quick-btn:hover { border-color: #3E5340; background: rgba(42,58,40,0.08); }
    .cpn-typing { display: flex; gap: 8px; }
    .cpn-typing-bubble {
      background: #F4EEE2; border: 1px solid rgba(26,18,16,0.06); border-radius: 14px;
      padding: 11px 14px; display: flex; gap: 4px;
    }
    .cpn-typing-dot {
      width: 6px; height: 6px; background: #3E5340; border-radius: 50%;
      animation: cpnblink 1.2s infinite;
    }
    .cpn-typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .cpn-typing-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes cpnblink {
      0%, 80%, 100% { opacity: 0.3; transform: scale(1); }
      40%           { opacity: 1;   transform: scale(1.3); }
    }
    .cpn-chat-form {
      padding: 12px 14px; border-top: 1px solid rgba(26,18,16,0.08);
      display: flex; gap: 8px; background: #ffffff;
    }
    .cpn-chat-input {
      flex: 1; background: #ffffff; border: 1px solid rgba(26,18,16,0.14); border-radius: 22px;
      padding: 9px 16px; color: #1A1210; font-size: 13.5px; outline: none;
      font-family: inherit;
    }
    .cpn-chat-input:focus { border-color: rgba(42,58,40,0.45); box-shadow: 0 0 0 3px rgba(42,58,40,0.08); }
    .cpn-chat-send {
      width: 38px; height: 38px; background: #2A3A28; border: none; border-radius: 50%;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .cpn-lead-confirm {
      margin: 0 14px 12px; background: rgba(42,58,40,0.06);
      border: 1px solid rgba(42,58,40,0.18); color: #2A3A28;
      padding: 8px 12px; border-radius: 8px; font-size: 12px; text-align: center; font-weight: 600;
    }
  `;

  // ────────────────────────────────────────────────────────────────────
  // INIT
  // ────────────────────────────────────────────────────────────────────
  function init() {
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    const bubble = document.createElement('button');
    bubble.className = 'cpn-chat-bubble';
    bubble.setAttribute('aria-label', 'Abrir chat');
    bubble.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="#ffffff"/></svg>';
    bubble.addEventListener('click', toggleChat);
    document.body.appendChild(bubble);

    const win = document.createElement('div');
    win.className = 'cpn-chat-window';
    win.id = 'cpn-chat-window';
    win.style.display = 'none';
    win.innerHTML = `
      <div class="cpn-chat-header">
        <div class="cpn-chat-avatar">CPN</div>
        <div class="cpn-chat-title">
          <strong>ContaProNow</strong>
          <span>● Disponible ahora</span>
        </div>
        <button class="cpn-chat-close" aria-label="Cerrar">✕</button>
      </div>
      <div class="cpn-chat-messages" id="cpn-msgs"></div>
      <form class="cpn-chat-form" id="cpn-form">
        <input type="text" class="cpn-chat-input" id="cpn-input" placeholder="Escribe tu mensaje..." autocomplete="off" />
        <button type="submit" class="cpn-chat-send" aria-label="Enviar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </form>
    `;
    document.body.appendChild(win);

    win.querySelector('.cpn-chat-close').addEventListener('click', toggleChat);
    win.querySelector('#cpn-form').addEventListener('submit', handleSubmit);
  }

  // ────────────────────────────────────────────────────────────────────
  // UI
  // ────────────────────────────────────────────────────────────────────
  function toggleChat() {
    isOpen = !isOpen;
    const win = document.getElementById('cpn-chat-window');
    win.style.display = isOpen ? 'flex' : 'none';
    if (isOpen && history.length === 0) {
      setTimeout(startConversation, 350);
    }
  }

  function renderMessage(role, text) {
    const msgs = document.getElementById('cpn-msgs');
    const row = document.createElement('div');
    row.className = 'cpn-msg-row ' + role;
    if (role === 'bot') {
      row.innerHTML = `<div class="cpn-msg-avatar">CPN</div><div class="cpn-msg-bubble bot"></div>`;
    } else {
      row.innerHTML = `<div class="cpn-msg-bubble user"></div>`;
    }
    row.querySelector('.cpn-msg-bubble').textContent = text;
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function renderQuickOptions(options) {
    const msgs = document.getElementById('cpn-msgs');
    const row = document.createElement('div');
    row.className = 'cpn-quick-options';
    row.id = 'cpn-quick-current';
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'cpn-quick-btn';
      btn.textContent = opt;
      btn.addEventListener('click', () => {
        const quick = document.getElementById('cpn-quick-current');
        if (quick) quick.remove();
        processUser(opt);
      });
      row.appendChild(btn);
    });
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function removeQuickOptions() {
    const quick = document.getElementById('cpn-quick-current');
    if (quick) quick.remove();
  }

  function showTyping() {
    if (typing) return;
    typing = true;
    const msgs = document.getElementById('cpn-msgs');
    const row = document.createElement('div');
    row.className = 'cpn-typing';
    row.id = 'cpn-typing-current';
    row.innerHTML = `
      <div class="cpn-msg-avatar">CPN</div>
      <div class="cpn-typing-bubble">
        <span class="cpn-typing-dot"></span>
        <span class="cpn-typing-dot"></span>
        <span class="cpn-typing-dot"></span>
      </div>
    `;
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function hideTyping() {
    typing = false;
    const t = document.getElementById('cpn-typing-current');
    if (t) t.remove();
  }

  function showLeadConfirm() {
    const form = document.getElementById('cpn-form');
    const confirm = document.createElement('div');
    confirm.className = 'cpn-lead-confirm';
    confirm.textContent = '✓ Datos guardados — Te contactaremos pronto';
    form.parentNode.insertBefore(confirm, form);
  }

  // ────────────────────────────────────────────────────────────────────
  // LÓGICA
  // ────────────────────────────────────────────────────────────────────
  async function callAssistant(msgs) {
    try {
      const res = await fetch(CHAT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs })
      });
      const data = await res.json();
      return data.text || 'No pude procesar tu mensaje.';
    } catch (err) {
      console.error(err);
      return 'Error de conexión. Inténtalo de nuevo.';
    }
  }

  async function startConversation() {
    showTyping();
    const initial = [{
      role: 'user',
      content: 'Saluda al usuario brevemente en nombre de ContaProNow y pregúntale qué quiere mejorar en su negocio.'
    }];
    const reply = await callAssistant(initial);
    hideTyping();
    history = [...initial, { role: 'assistant', content: reply }];
    renderMessage('bot', cleanText(reply));
    renderQuickOptions([
      'Tengo muchas tareas manuales',
      'Quiero automatizar facturas',
      'Necesito mejorar mi web',
      'Pierdo leads y contactos'
    ]);
    detectLead(reply);
  }

  function cleanText(text) {
    return text.replace(/\[LEAD_CAPTURED:[^\]]+\]/g, '').trim();
  }

  function detectLead(rawText) {
    const m = rawText.match(/\[LEAD_CAPTURED:([^\]]+)\]/);
    if (m && !leadDone) {
      const params = {};
      m[1].split(',').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k && v) params[k.trim()] = v.trim();
      });
      if (params.email && params.email.includes('@')) {
        leadDone = true;
        sendLead(params);
        setTimeout(showLeadConfirm, 600);
      }
    }
  }

  async function sendLead(lead) {
    try {
      await fetch(LEAD_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:  lead.nombre,
          email:   lead.email,
          interes: lead.interes || 'No especificado'
        })
      });
    } catch (err) {
      console.error('Error enviando lead:', err);
    }
  }

  async function processUser(text) {
    if (!text.trim()) return;
    removeQuickOptions();
    renderMessage('user', text);

    const newHistory = [...history, { role: 'user', content: text }];
    history = newHistory;
    showTyping();

    const reply = await callAssistant(newHistory);
    hideTyping();

    history = [...newHistory, { role: 'assistant', content: reply }];
    renderMessage('bot', cleanText(reply));
    detectLead(reply);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('cpn-input');
    const text = input.value;
    input.value = '';
    processUser(text);
  }

  // ────────────────────────────────────────────────────────────────────
  // ARRANQUE
  // ────────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
