# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Static marketing website for **ContaProNow** (contapronow.com), a Spanish digital-infrastructure/automation agency for freelancers and small businesses. No build system, no package manager, no framework — plain HTML/CSS/JS deployed as static files on Vercel, plus one serverless function.

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
- **`assets/js/chatbot.js`** injects a self-contained chat widget (bubble + window, all styles injected via a `<style>` tag at runtime — not in `styles.css`) used for lead capture. It is included on the three service pages and `index.html`.
  - Conversation turns are sent to `/api/chat` (see below) along with a hardcoded Spanish `SYSTEM_PROMPT` describing ContaProNow's services and a strict output contract: once the assistant has both name and email, it must append a `[LEAD_CAPTURED:nombre=...,email=...,interes=...]` tag to its final message.
  - The client parses that tag out of the response (`detectLead`/`cleanText`), and on match POSTs the lead to an **n8n webhook** (`N8N_WEBHOOK_URL`, currently a Railway-hosted n8n instance) which handles downstream lead storage/notification. This webhook URL is hardcoded in the JS — updating it requires editing `assets/js/chatbot.js` directly.
- **`api/chat.js`** is a Vercel serverless function acting as a secure proxy to OpenAI (`gpt-4o-mini`) so the API key never reaches the client. Expects `OPENAI_API_KEY` as a Vercel environment variable. Handles CORS (`*`) and only accepts `POST`/`OPTIONS`.
- **`vercel.json`** only configures security response headers (CSP-adjacent headers like `X-Frame-Options`, `Strict-Transport-Security`, etc.) applied to all routes — there's no routing/build config beyond that.
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

## Pendientes conocidos
- DNS apex: en GoDaddy añadir A record apuntando a 76.76.21.21 (Vercel)
- Verificar que el chatbot de n8n sigue funcionando tras cualquier cambio en api/
