# Fase 2 — Auditoría estática de código

Fecha: 2026-07-15 · Rama: `audit/2026-07-15-fullscan`

## CRÍTICO

### C1. Endpoint /api/chat es un proxy abierto a OpenAI (sin validar) + system prompt NO es server-side
- **Archivos**: `api/chat.js`, `assets/js/chatbot.js:17`
- **Qué pasa**: `api/chat.js` recibe `{ messages, system }` del body del cliente y reenvía `system` tal cual a OpenAI (líneas 22-28), sin validarlo. El "system prompt" real vive en el cliente (`chatbot.js:17`, `SYSTEM_PROMPT`), visible en el JS servido — es decir, ya está expuesto, y además el servidor confía ciegamente en lo que el cliente le mande.
- **Impacto**: cualquiera puede hacer `POST` directo a `/api/chat` (CORS `*`, sin auth, sin rate limiting) con su propio `system` y `messages`, usando tu API key de OpenAI como proxy gratuito para lo que quiera. Riesgo de coste económico directo sobre tu cuenta de OpenAI, no solo de seguridad.
- **Relacionado**: `N8N_WEBHOOK_URL` (`chatbot.js:14`) también es invocable directamente por cualquiera sin firma/autenticación — permite inyectar leads falsos al pipeline.
- **⚠️ Esto toca chat/webhook/system prompt — no propongo ni aplico ningún cambio aquí. Necesito tu decisión antes de tocar `api/chat.js` o `chatbot.js`.**

### C2. `og:image` roto en las 4 páginas principales (404 en vivo)
- **Archivos**: `index.html:15`, `automatizacion-facturas.html:15`, `automatizacion-atencion-captacion.html:15`, `web-captacion-estructura-digital.html:15`, y el JSON-LD de `index.html` (campo `"image"`)
- **Qué pasa**: todas apuntan a `https://www.contapronow.com/assets/img/og-image.png`, archivo que no existe en el repo. Verificado en vivo: `curl` devuelve **404**.
- **Impacto**: cualquier enlace compartido por WhatsApp/redes sociales no muestra imagen de previsualización — golpea directamente el único objetivo de conversión del sitio (mensaje de WhatsApp), ya que reduce el CTR de los enlaces compartidos.
- **Fix**: crear `assets/img/og-image.png` (1200×630 recomendado) y ya está referenciado correctamente en todas partes — solo falta el archivo.

## ALTO

### A1. (heredado de Fase 1) Anchor roto `#sobre-mi` vs `#sobre-nosotros`
Nav de las 3 páginas de servicio apunta a `/index.html#sobre-mi`; el id real es `#sobre-nosotros` (`index.html:678`). Confirmado en vivo con agent-browser.

### A2. (heredado de Fase 1) Páginas legales huérfanas
`aviso-legal.html` / `privacidad.html` sin header/nav/footer/CSS/favicon — rompen la identidad visual y no ofrecen vuelta al sitio.

### A3. Schema.org sin localización real (quick win SEO local)
- **Archivo**: `index.html:26-45` (JSON-LD `ProfessionalService`)
- **Qué pasa**: `address.addressRegion` vale `"España"` (debería ser una región/provincia, no el país — es un uso incorrecto del campo). No hay `addressLocality` ni coordenadas `geo`.
- **Impacto**: tu cliente objetivo entra por búsqueda local de Google (Tenerife). Sin `addressLocality: "Santa Cruz de Tenerife"` (o la localidad real) y sin `geo`, Google tiene menos señales para el paquete local / Maps. Es uno de los quick wins de mayor ROI para tu caso de uso.
- **Nota**: necesito la localidad/dirección real para rellenarlo correctamente — no voy a inventar datos de contacto.

## MEDIO

### M1. LCP de portada no usa WebP/AVIF pese a tener ya un WebP más ligero sin usar
- **Archivo**: `index.html:294` usa `hero-dashboard.png` (985 KB). Ya existe `assets/img/hero.webp` (685 KB) en el repo pero **no está referenciado en ningún HTML** — parece un asset huérfano de una iteración anterior.
- **Sugerencia**: confirmar cuál es la imagen hero vigente y servirla en WebP/AVIF con `<picture>` + fallback PNG.

### M2. ~11 MB de imágenes huérfanas en el repo
No referenciadas en ningún HTML: `hero.webp`, `sobre-mi.webp`, `sobre-mi.jpg` (**4.4 MB**, sospechosamente pesado), `hero-operativa.jpg` (1.6 MB), `servicio-captacion-leads.png`, `operativa-conectada.png`, `servicio-facturas.png`, `servicio-web.png` (~1.1-1.2 MB cada una). No afectan al rendimiento en producción (no se descargan), pero inflan el repo/despliegue. Confirmar si son necesarias antes de borrarlas.

### M3. Falta cabecera Content-Security-Policy
`vercel.json` tiene X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy y HSTS, pero no CSP. Dado que el sitio carga Google Fonts, llama a `/api/chat` y a un webhook externo de n8n, una CSP añadiría una capa extra de defensa (aunque no se detectó ninguna inyección XSS explotable — el chat widget usa `textContent`, no `innerHTML`, para pintar mensajes).

### M4. 6 pesos de fuente Inter cargados (400–900)
Podría reducirse a 3-4 pesos realmente usados para aligerar la descarga de fuente.

### M5. Meta description larga en una página
`web-captacion-estructura-digital.html`: 171 caracteres — Google la truncará en el snippet (límite práctico ~155-160).

## BAJO

- **B1**: 7 archivos de imagen de 1 byte sin usar (`servicio-captacion.jpg`, `galeria-web.jpg`, `galeria-atencion.jpg`, `proceso-manual.jpg`, `servicio-web.jpg`, `servicio-facturas.jpg`, `galeria-facturas.jpg`) — limpieza de repo.
- **B2**: Copy con lenguaje ligeramente tibio en `automatizacion-facturas.html:261` ("podrían estar mejor resueltos") y `:479` ("suele consumir demasiado tiempo") — describen el problema del cliente, no una promesa de ContaProNow, así que el impacto es bajo, pero se puede endurecer para mantener el estilo Belfort.
- **B3**: Sin `twitter:card` (OG normalmente cubre la mayoría de previews, impacto mínimo).
- **B4**: `--text-muted: #667085` sobre fondo blanco da ~4.97:1 (pasa AA por poco margen); revisar visualmente su uso sobre `--bg-alt` (#eef3f8), donde el margen se reduce aún más.
- **B5**: Páginas legales sin meta description/canonical/OG (bajo impacto, ya excluidas del sitemap a propósito).

## Limpio / sin hallazgos
- Estructura de headings correcta (1 solo `h1` por página, sin saltos de nivel).
- Botones interactivos con `aria-label` donde corresponde; iconos decorativos con `alt=""` + `aria-hidden="true"`.
- Sin resets globales de `outline` que rompan el foco por teclado.
- JS diferido correctamente (`defer` en `main.js` y `chatbot.js`).
- Fuentes con `preconnect` + `display=swap` ya aplicado.
- robots.txt y sitemap.xml correctos y coherentes entre sí.
- Meta title/description/canonical/OG/robots presentes y consistentes en las 4 páginas principales (salvo `og:image` roto, ver C2).
