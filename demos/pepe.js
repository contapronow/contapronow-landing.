/**
 * Demo Piso Barato · Pepe
 *
 * Tres piezas independientes, cada una en su bloque:
 *   1. Chatbot embebido que habla con /api/chat-pepe.js
 *   2. CTAs de cierre (WhatsApp + reenvío) y firma con datos
 *   3. Cositas de UI: barra de progreso y reveal on scroll
 *
 * Se carga con `defer` — el DOM está garantizado. Nada de DOMContentLoaded.
 *
 * CSP del sitio: script-src 'self'. Este archivo es local. Nada inline.
 */

/* ═══════════════════ CONFIG · edita solo estas líneas ═══════════════════ */
const CONFIG = {
  whatsapp:    '+34 634 75 30 21',
  email:       'info@contapronow.com',
  email2:      'contapronoww@gmail.com',
  web:         'contapronow.com',
  zona:        'Tenerife, Islas Canarias',
  vozDemoUrl:  'https://voz-agente-tools.fly.dev/prueba/b2747521b552953661ff682ede84347e',
  // URL pública de esta landing — usada en el CTA de reenvío por WhatsApp.
  // Si al desplegar se sube a otra ruta, cambiar aquí también.
  landingUrl:  'https://contapronow.com/demos/pepe',
};
/* ═════════════════════════════════════════════════════════════════════════ */

/* ── 1. Chatbot embebido ─────────────────────────────────────────────── */

const log      = document.getElementById('clog');
const form     = document.getElementById('cinput');
const input    = document.getElementById('cmsg');
const sendBtn  = document.getElementById('csend');
const chipsBox = document.getElementById('chips');
const captBox  = document.getElementById('captured');

/** Historial en memoria. El servidor mete el system prompt; nosotros no. */
const history = [
  { role: 'assistant', content: 'Hola, soy Sara, del equipo de Piso Barato Inmobiliaria. Estoy 24 horas al día para atender lo que necesites. ¿Buscas piso, alquiler, o quieres información sobre hipoteca?' },
];

/**
 * Regex de la etiqueta que emite el LLM cuando tiene los tres datos.
 * Formato: [LEAD_CAPTURED:nombre=X,telefono=Y,zona=Z]
 * La captura es tolerante con espacios y comas dentro de los valores porque
 * el modelo a veces escribe "La Laguna" con espacio y no queremos que rompa.
 */
const LEAD_RE = /\[LEAD_CAPTURED:nombre=([^,\]]+),telefono=([^,\]]+),zona=([^\]]+)\]/i;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function addMsg(role, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'you' : role === 'system' ? 'sys' : 'bot');
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

function addTyping() {
  const t = document.createElement('div');
  t.className = 'typing';
  t.setAttribute('aria-label', 'Sara está escribiendo');
  t.innerHTML = '<span></span><span></span><span></span>';
  log.appendChild(t);
  log.scrollTop = log.scrollHeight;
  return t;
}

/** Cuando el LLM captura los datos, mostramos un bloque visual y desactivamos
 *  la captura (no queremos que insista si el usuario sigue charlando). */
function showCaptured({ nombre, telefono, zona }) {
  captBox.hidden = false;
  captBox.innerHTML =
    '<b>· Datos recibidos ·</b><br>' +
    'Nombre: ' + esc(nombre.trim()) + '<br>' +
    'Teléfono: ' + esc(telefono.trim()) + '<br>' +
    'Zona: ' + esc(zona.trim()) + '<br>' +
    '<span style="opacity:.75;display:block;margin-top:8px">En producción: se manda al comercial de guardia por WhatsApp con el nombre y el teléfono, junto con el resumen de lo que pidió. Cero clics.</span>';
}

async function enviarAlServidor() {
  const t = addTyping();
  sendBtn.disabled = true;
  input.disabled = true;

  try {
    const res = await fetch('/api/chat-pepe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    const data = await res.json().catch(() => ({}));
    t.remove();

    if (!res.ok || typeof data.text !== 'string') {
      addMsg('system', 'Hubo un fallo temporal. Prueba a escribir otra vez.');
      return;
    }

    // Extraer la etiqueta ANTES de mostrar el texto — así el usuario nunca la ve.
    const m = data.text.match(LEAD_RE);
    const visible = data.text.replace(LEAD_RE, '').trim();
    if (visible) addMsg('assistant', visible);
    history.push({ role: 'assistant', content: visible });

    if (m) showCaptured({ nombre: m[1], telefono: m[2], zona: m[3] });
  } catch (err) {
    t.remove();
    addMsg('system', 'Sin conexión. Vuelve a intentarlo en un rato.');
  } finally {
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

function enviar(texto) {
  const t = texto.trim();
  if (!t) return;
  addMsg('user', t);
  history.push({ role: 'user', content: t });
  input.value = '';
  enviarAlServidor();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  enviar(input.value);
});

// Los chips son atajos: rellenan el input y lo mandan directo. Escondemos la
// tira una vez usada — que la primera pregunta sea la fácil, después ya se
// escribe libre.
chipsBox.addEventListener('click', (e) => {
  const btn = e.target.closest('button.chip');
  if (!btn) return;
  enviar(btn.dataset.q || btn.textContent);
  chipsBox.style.display = 'none';
});

/* ── 2. CTAs de cierre y firma ────────────────────────────────────────── */

const tel = CONFIG.whatsapp.replace(/[^0-9]/g, '');

// Solo CTA de reenvío. El CTA de "hablamos" se quitó a propósito: Abián se lo
// dice a Pepe verbalmente por WhatsApp cuando le mande el enlace, así la
// landing no repite lo que ya está en el mensaje. Menos ruido, más señal.
const msgRe = 'Oye, mira esta demo que me pasó Abián de ContaProNow. Es una inmobiliaria y va con IA. Piensa que puede encajarte: ' + CONFIG.landingUrl;

document.getElementById('acts').innerHTML =
  '<a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=' +
    encodeURIComponent(msgRe) + '">Pasarle esto a alguien del sector</a>';

document.getElementById('sig').innerHTML =
  'ContaProNow · Infraestructura digital local<br>' +
  '<a href="https://wa.me/' + tel + '">' + CONFIG.whatsapp + '</a><br>' +
  '<a href="mailto:' + CONFIG.email + '">' + CONFIG.email + '</a><br>' +
  '<a href="mailto:' + CONFIG.email2 + '">' + CONFIG.email2 + '</a><br>' +
  '<a href="https://' + CONFIG.web + '">' + CONFIG.web + '</a><br>' +
  CONFIG.zona;

/* ── 3. UI: barra de progreso + reveal on scroll ──────────────────────── */

// Progreso via transform:scaleX — cero layout thrash.
const bar = document.getElementById('bar');
addEventListener('scroll', () => {
  const h = document.body.scrollHeight - innerHeight;
  const pct = h > 0 ? Math.max(0, Math.min(1, scrollY / h)) : 0;
  bar.style.transform = 'scaleX(' + pct + ')';
}, { passive: true });

// Reveal on scroll — sube opacidad y traslada un pelín. IntersectionObserver
// para no reventar la CPU con handlers de scroll.
document.querySelectorAll('.sec .col > *, #hero > div > *').forEach((el) => el.classList.add('rev'));
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }
}, { threshold: 0.08, rootMargin: '0px 0px -40px' });
document.querySelectorAll('.rev').forEach((el, i) => {
  el.style.transitionDelay = Math.min((i % 6) * 45, 220) + 'ms';
  io.observe(el);
});

// Salvavidas: si algo se queda sin dispararse (Safari raro, o el usuario abre
// la página ya con scroll en medio), sacamos todos los reveal después de 2.5s.
setTimeout(() => {
  document.querySelectorAll('.rev:not(.in)').forEach((el) => el.classList.add('in'));
}, 2500);
