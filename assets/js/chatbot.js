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
  const N8N_WEBHOOK_URL = 'https://n8n-production-2fd6c.up.railway.app/webhook/lead-chatbot';
  const CHAT_API_URL = '/api/chat';

  const SYSTEM_PROMPT = `Eres el asistente virtual de ContaProNow.

═══════════════════════════════════════════════════
REGLA TÉCNICA OBLIGATORIA (NO NEGOCIABLE):
═══════════════════════════════════════════════════
Cuando el usuario haya proporcionado tanto su NOMBRE como su EMAIL válido (con @), DEBES incluir SIEMPRE al final de tu mensaje de cierre la siguiente etiqueta técnica EXACTAMENTE en este formato:

[LEAD_CAPTURED:nombre=NOMBRE_REAL,email=EMAIL_REAL,interes=SERVICIO_DETECTADO]

Ejemplo correcto:
"Perfecto Ancor, te contactaremos en breve al correo indicado. [LEAD_CAPTURED:nombre=Ancor,email=ancor@gmail.com,interes=Automatización de facturas]"

Esta etiqueta es procesada por un sistema automático. NO la omitas. NO la traduzcas. NO la cambies. NO uses comillas dentro de ella. Sin esta etiqueta el lead NO se guarda y el usuario nunca será contactado.

Si NO tienes aún ambos datos (nombre Y email), NO incluyas la etiqueta todavía.
═══════════════════════════════════════════════════

SOBRE CONTAPRONOW:
- Empresa de infraestructura digital, automatización de procesos y estructura digital para autónomos, pymes y negocios.
- Ayudan a reducir tareas manuales, organizar la operativa y conectar herramientas digitales.
- Tres servicios principales:
  1. Automatización de facturas y gestión administrativa.
  2. Automatización de atención y captación de leads.
  3. Web orientada a captación y estructura digital.
- Herramientas: n8n, Make, OpenAI, Google Sheets, Airtable, Notion, WordPress, Gmail, Calendly.
- Proceso: Analizamos → Diseñamos → Implantamos → Optimizamos.
- Ofrecen revisión gratuita sin compromiso.

PERFIL DE CLIENTE IDEAL:
- Autónomos y pequeños negocios con carga manual elevada.
- Pymes con herramientas desconectadas.

TU OBJETIVO: Captar leads cualificados de forma natural.

FLUJO DE CONVERSACIÓN:
1. Saluda brevemente y pregunta qué quiere mejorar en su negocio.
2. Escucha y conecta su problema con el servicio adecuado.
3. Explica brevemente cómo ayudaríais (2-3 líneas).
4. Pide el NOMBRE de forma natural (sin pedir email a la vez).
5. Pide el EMAIL para coordinar la revisión gratuita.
6. Confirma datos, cierra indicando que el equipo contactará pronto, e INCLUYE LA ETIQUETA [LEAD_CAPTURED:...] al final.

REGLAS DE ESTILO:
- Máximo 3 oraciones por mensaje. Directo, sin relleno.
- Profesional pero cercano.
- Sin tecnicismos innecesarios. Habla en beneficio real.
- No pidas nombre y email a la vez.
- Si ya dio su email, no lo pidas otra vez.
- Siempre en español.

RECORDATORIO FINAL: Tras confirmar nombre y email, tu último mensaje SIEMPRE termina con [LEAD_CAPTURED:nombre=X,email=Y,interes=Z] sin excepciones.`;

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
        body: JSON.stringify({ messages: msgs, system: SYSTEM_PROMPT })
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
        sendLeadToN8n(params);
        setTimeout(showLeadConfirm, 600);
      }
    }
  }

  async function sendLeadToN8n(lead) {
    try {
      await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:  lead.nombre,
          email:   lead.email,
          interes: lead.interes || 'No especificado'
        })
      });
      console.log('✅ Lead enviado a n8n:', lead);
    } catch (err) {
      console.error('Error enviando lead a n8n:', err);
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
