# Design

> Este documento fija la **dirección estratégica** de diseño (fase 0). Los tokens exactos (OKLCH final, escala de spacing, sombras, motion) se formalizan en `./design/system.md` y `./design/tokens.css` en Fase 3, sobre esta base ya aprobada.

## Anti-referencias explícitas

- Cualquier landing SaaS morada o azul-genérico-SaaS.
- Cualquier página con blob gradients o glows oscuros decorativos.
- Cualquier plantilla Framer/Webflow reconocible de 2024-2026.
- Fondo crema/beige/parchment ("--paper", "--sand", "--bone") como default de marca "cálida" — es el cliché de IA de 2026, no restraint.
- Editorial-typographic genérico (serif display itálica + mono labels + reglas separadoras) salvo que el brief lo pida explícitamente — no es el caso aquí.
- Fintech-navy-y-dorado — ContaProNow toca lo administrativo/financiero, así que es la trampa de segundo orden más probable; se evita a propósito (ver dirección de color).

## Referencias positivas

- **Linear** — jerarquía tipográfica, no paleta.
- **Ramp** — restraint de color (un acento, usado con disciplina), no el verde en sí (ver nota de color más abajo).
- **Vercel marketing** — ritmo de spacing, un solo idea dominante por sección.
- **Attio** — disciplina de motion, nada gratuito.
- **Vitalist** — tinted neutrals reales, no grises puros.

## Dirección de color (propuesta — pendiente tu aprobación)

De las tres opciones que diste (ocre profundo / verde salvia oscuro / azul océano casi negro), propongo **ocre profundo** como primario, por descarte razonado:

- **Verde salvia** colisiona directamente con Ramp, que está en tus referencias positivas — usarlo léeria como "queremos parecernos a Ramp" en vez de tener voz propia.
- **Azul océano casi negro** cae en la trampa de segundo orden que el propio detector anti-slop nombra explícitamente: "fintech que no es navy-and-gold → terminal-native dark mode" es un reflejo, pero *navy para una marca que toca facturación/administración* es exactamente el reflejo de primer orden que hay que evitar. Demasiado obvio para el rubro.
- **Ocre profundo** conecta con la identidad volcánica real de Tenerife (tierra, Teide, arquitectura canaria tradicional) en vez de con la postal turística "azul Atlántico" — es específico, no genérico-costero — y no colisiona con ninguna referencia nombrada.

Estrategia de color: **Committed** (un color satura 30-60% de superficies clave: hero, CTAs, separadores de sección) sobre fondo blanco puro — no Restrained-tímido, no Drenched-total. El ocre lleva la identidad; el blanco lleva la claridad que necesita una audiencia de 40-60 años que decide rápido.

Un segundo color (verde salvia oscuro, en dosis bajas — badges de estado, no identidad) se reserva como acento secundario, no como protagonista, precisamente para poder usarlo sin colisionar con Ramp.

## Dirección de tipografía (propuesta — pendiente tu aprobación)

Instrument Serif y Fraunces (tus ejemplos) están en la reflex-reject list del propio detector — son el default de entrenamiento más repetido en landings de IA ahora mismo. PP Neue Montreal y Söhne son de pago.

Tres palabras físicas de la marca: **grabado en piedra, cuaderno de cuentas encuadernado, señalética portuaria.**

Propuesta:
- **Display: Bodoni Moda** (serif de alto contraste, con soporte de optical sizing). No es un reflejo habitual en landings SaaS; evoca placa grabada / documento formal / autoridad — encaja con "certeza" Belfort sin caer en editorial-magazine genérico.
- **Body: Switzer** (Fontshare, gratuita, autohospedable, <10kb el subset necesario). Es el pariente libre de Söhne que pedías — grotesca suiza limpia, técnica, premium — sin el coste de licencia ni el cliché de Inter.

Contraste de ejes: serif de alto contraste (display) + sans grotesca neutra (body) — cumple la regla de "parear en eje de contraste, no dos familias similares".

## Diales Taste-Skill

- `DESIGN_VARIANCE=7` — distintivo pero comercial, no experimental al límite.
- `MOTION_INTENSITY=3` — motion sobrio; un buen page-load orquestado antes que micro-interacciones dispersas.
- `VISUAL_DENSITY=5` — densidad media; ni dashboard denso ni landing vacía de una sola frase.

## Nota de identidad existente

El sitio actual usa azul corporativo (#004080) e Inter en todo — ambos explícitamente en la lista de cosas a evitar en el rediseño (azul-SaaS-genérico, Inter-para-todo). No hay "identity-preservation" que defender aquí: este documento reemplaza esa dirección visual a propósito, por encargo explícito.
