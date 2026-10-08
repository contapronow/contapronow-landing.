# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Static marketing website for **ContaProNow** (contapronow.com), a Spanish digital-infrastructure/automation agency for freelancers and small businesses. No build system, no package manager, no framework — plain HTML/CSS/JS deployed as static files on Vercel, plus two serverless functions (`api/chat.js`, `api/lead.js`).

## Commands

There is no build, lint, or test tooling in this repo (no `package.json`). To preview locally, just serve the directory with any static file server, e.g.:

```
python3 -m http.server 8000
```

Deployment is via Vercel (static site + `/api` serverless functions), triggered by pushes to `main`.

## Architecture

- **Pages are standalone HTML files at the repo root** (`index.html`, `automatizacion-facturas.html`, `automatizacion-atencion-captacion.html`, `web-captacion-estructura-digital.html`, plus legal pages `aviso-legal.html` / `privacidad.html`). There is no templating — shared markup (header, footer, chatbot widget) is duplicated across each page, so structural changes usually need to be applied to every page individually. Check `sitemap.xml` when adding/removing a page.
- **`assets/css/styles.css`** is a single shared stylesheet for all pages. Individual pages may add a `<style id="premium-overrides">` block in their `<head>` for page-specific visual tweaks rather than touching the shared CSS.
- **`assets/js/main.js`** drives on-page interactivity (nav toggle, smooth scroll, header scroll state, hero title/parallax animation, scroll-reveal via `IntersectionObserver`, audience slider, contact form validation, process timeline animation). It's a single IIFE with one `init()` that wires up each feature; each feature is a self-contained `setupX()` function that no-ops if its DOM isn't present on the page. Respects `prefers-reduced-motion`.
- **`assets/js/chatbot.js`** injects a self-contained chat widget (bubble + window, all styles injected via a `<style>` tag at runtime — not in `styles.css`) used for lead capture. It is included on `index.html` and the three service pages.
  - Conversation turns are sent to `/api/chat`. The Spanish `SYSTEM_PROMPT` lives **server-side** in `api/chat.js` (the client never sends it). Output contract: once the assistant has both name and email, it appends a `[LEAD_CAPTURED:nombre=...,email=...,interes=...]` tag to its final message.
  - The client parses that tag out of the response (`detectLead`/`cleanText`) and POSTs the lead to **`/api/lead`** (same origin), which validates it and forwards it server-side to the n8n webhook (Railway). The n8n URL lives only in `api/lead.js`.
- **`api/chat.js`** — Vercel serverless proxy to OpenAI (`gpt-4o-mini`); needs `OPENAI_API_KEY` in Vercel env. CORS restricted to contapronow.com + `*.vercel.app` previews, input validation, best-effort in-memory rate limit (20/min/IP), ignores any client `system` message.
- **`api/lead.js`** — Vercel serverless proxy for leads → n8n. Validates nombre/email/interes, rate limit 10/min/IP.
- **`vercel.json`** only configures security response headers (strict CSP with `script-src 'self'` and `connect-src 'self'`, HSTS, X-Frame-Options, COOP, etc.). Inline `<script>` is blocked by the CSP — JSON-LD blocks are fine because they are not executed. Any new external script/connection needs a CSP update.
- **Hero visual (`.ops-board`)**: every hero shows a coded "operativa del día" board (HTML/CSS in Laurisilva tokens) instead of a raster mockup. It must stay honest: example events only, no invented result metrics, with the "Ejemplo…" caption.
- **Contact form** (`index.html#contacto`, `setupContactForm` in `main.js`) does not post anywhere: it builds a message and opens WhatsApp (`wa.me`). Nothing is stored on the site.
- **`assets/img/og-image.png`** (1200×630) is the social preview for all pages; regenerate it if the brand or headline changes.
- **`assets/icons/`** and **`assets/img/`** hold SVG icons (including per-integration brand icons like `n8n.svg`, `make.svg`, `openai.svg`, `notion.svg`, `stripe.svg`) and raster/photo assets respectively.

## Content/editing notes

- All site copy is in Spanish; keep new copy consistent with that (this is a Spain-targeted business — `areaServed: "España"` in the JSON-LD, `+34` phone prefix).
- `index.html` embeds a `ProfessionalService` JSON-LD block in `<head>` — keep it in sync with real contact/service info if that copy changes.
- When editing a page's structure, check whether the same header/nav/footer/chatbot markup exists on other HTML files and needs the same change.

## Reglas críticas
- NUNCA hacer merge a main sin branch preview en Vercel validado primero
- Stack: HTML/CSS/JS vanilla únicamente. NO introducir frameworks ni build steps
- Cambios visuales: siempre crear feature branch primero
- Copy: lenguaje de certeza estilo Belfort en todas las páginas de servicio
- Nav: "Sobre nosotros" (no "About" ni otro texto)
- Un solo objetivo de conversión: mensaje de WhatsApp

## Sistema de marca (Laurisilva v2)
- Al cambiar CSS o JS, sube el `?v=` de `styles.css`, `boot.js`, `main.js` y `chatbot.js` en TODAS las páginas (Safari sirve copias antiguas en caché si no).
- Tokens en `:root` de `styles.css`: Arena (fondo), Tinta (texto), Laurisilva (marca), Sage, Teide (solo resaltar 1-2 palabras / alertas), Basalto, Bruma.
- Cero gradientes, cero blobs/cuadrículas decorativas. Fraunces (display) + Inter (texto) + JetBrains Mono (etiquetas).
- Solo se elevan con hover los elementos clicables. Texto pequeño en Sage no pasa AA sobre fondos claros: usar `--brand-2`.
- Prueba social: nunca inventar cifras, testimonios ni clientes.

## Pendientes conocidos
- DNS: el dominio lo gestiona Cloudflare (no GoDaddy). El apex `contapronow.com` redirige 308 a `www` y funciona; Vercel recomienda (opcional) cambiar el A `@ → 76.76.21.21` por el CNAME que muestra en Settings → Domains.
- Verificar que el chatbot (`/api/chat`) y la captura de leads (`/api/lead` → n8n) siguen funcionando tras cualquier cambio en `api/`.
