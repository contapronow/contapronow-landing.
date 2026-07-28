# Spec: Dashboard de cliente ContaProNow

**Fecha:** 2026-07-28  
**Estado:** Aprobado — pendiente de implementación  
**Proyecto:** web-contapronow  
**Scope:** Panel web para clientes del bot WhatsApp + panel operativo + vista agencia

---

## 1. Contexto

ContaProNow vende bots WhatsApp a negocios (primera vertical: clínicas dentales). Los clientes no tienen visibilidad de lo que hace el bot. El objetivo de este dashboard es:

1. **Retener clientes** — ver las métricas les demuestra el ROI mensual del bot.
2. **Reducir soporte** — el panel operativo permite al personal gestionar pacientes escalados sin llamar a Abián.
3. **Escalar la agencia** — el panel admin permite a Abián gestionar toda la cartera desde un solo sitio.

---

## 2. Arquitectura

### Ubicación
Carpeta `/app/` dentro de `web-contapronow`, servida como archivos estáticos por Vercel. Misma URL base: `contapronow.com/app/`.

### Stack
- HTML + Vanilla JS (consistente con el resto del proyecto)
- `supabase-js` v2 bundleado localmente en `/assets/js/supabase.min.js` — sin CDN, respeta CSP actual
- SVG generado con JS inline para el gráfico de conversaciones — sin librerías de charting externas
- Variables CSS del sistema de marca Laurisilva v2 desde `assets/css/styles.css`
- Bloque `<style>` por página para ajustes específicos del app

### Auth
Supabase Auth con **magic link** (OTP por email). Flujo:
1. Cliente entra email en `login.html`
2. Supabase envía enlace de acceso
3. Clic en enlace → redirige a `dashboard.html`
4. `supabase.auth.getSession()` en cada página protegida — si no hay sesión, redirige a login

### Seguridad — Row Level Security (RLS)
Activar RLS en Supabase para que cada clínica solo lea sus datos. Políticas necesarias:

```sql
-- messages
CREATE POLICY "clinic_own_messages" ON messages
  FOR SELECT USING (
    clinic_id = (SELECT id FROM clinics WHERE auth_user_id = auth.uid())
  );

-- appointments
CREATE POLICY "clinic_own_appointments" ON appointments
  FOR SELECT USING (
    clinic_id = (SELECT id FROM clinics WHERE auth_user_id = auth.uid())
  );

-- conversation_states
CREATE POLICY "clinic_own_states" ON conversation_states
  FOR SELECT USING (
    clinic_id = (SELECT id FROM clinics WHERE auth_user_id = auth.uid())
  );

-- clinics (solo su propia fila)
CREATE POLICY "clinic_own_row" ON clinics
  FOR SELECT USING (auth_user_id = auth.uid());
```

---

## 3. Cambios en Supabase

### Nuevas columnas en `clinics`
```sql
ALTER TABLE clinics 
  ADD COLUMN auth_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN is_admin BOOLEAN DEFAULT false,
  ADD COLUMN coste_hora_recepcion DECIMAL DEFAULT 12.00;
```

`is_admin = true` solo en la fila de Abián para acceder a `admin.html`.

### Sin nuevas tablas
Los datos necesarios ya existen: `messages`, `appointments`, `conversation_states`. Las métricas se calculan en el frontend con queries a estas tablas.

---

## 4. Páginas

### `app/login.html`
- Logo ContaProNow centrado
- Campo email + botón "Acceder"
- Texto: "Te enviaremos un enlace de acceso a tu correo"
- Supabase `signInWithOtp({ email })` al submit
- Estado de confirmación: "Revisa tu correo — enlace enviado"
- Branding: fondo `--bg`, botón `--brand`

---

### `app/dashboard.html` — Métricas del cliente

**Header:** nombre de la clínica + logo ContaProNow pequeño arriba a la derecha

**Selector de período:** Hoy / Esta semana / Este mes (tabs o toggle)

**5 tarjetas de métricas** (grid 2×3 en móvil, 5 en línea en desktop):

| Tarjeta | Icono | Dato | Fuente |
|---|---|---|---|
| Conversaciones | 💬 | COUNT DISTINCT patient_phone | `messages` en período |
| Nuevos pacientes | 👤 | Primeras apariciones patient_phone | `messages` |
| Citas agendadas | 📅 | COUNT | `appointments` en período |
| Horas ahorradas | ⏱ | conv_resueltas × 0.25h | conv. donde is_locked = false |
| Dinero ahorrado | 💶 | horas × coste_hora_recepcion | calculado |

*Conv. resueltas = conversaciones donde el paciente NO fue escalado (is_locked nunca llegó a true en ese período).*

**Gráfico:** barras verticales SVG, conversaciones por día últimos 30 días. Color `--brand`. Sin eje Y numérico — solo barras proporcionales con tooltip al hover.

**Lista de últimos leads:** tabla compacta con `patient_phone` (anonimizado: `+34 6** *** **3`), fecha, y si se agendó cita.

---

### `app/operaciones.html` — Panel operativo

**Para el personal de la clínica.**

**Lista de conversaciones** con columnas:
- Paciente (teléfono anonimizado)
- Último mensaje (texto truncado)
- Hace cuánto (relativo: "hace 3 min")
- Estado: chip `Activo` (verde) / `Esperando` (naranja — escalado)

**Filtros:** Todos / Esperando atención / Activos

**Para conversaciones escaladas (`is_locked = true`):**
- Chip naranja destacado
- Botón "**Retomar bot**" → POST a `https://n8n-production-f6b85.up.railway.app/webhook/unlock-patient` con `clinic_id` + `patient_phone`
- Feedback visual: botón cambia a "✓ Bot retomado" por 3s, luego el chip pasa a Activo

**Vista de hilo:** clic en cualquier fila abre panel lateral con todos los mensajes de esa conversación en formato chat (burbujas inbound/outbound).

---

### `app/admin.html` — Vista agencia (solo Abián)

**Protección:** si `clinics.is_admin ≠ true` para el usuario auth, redirige a dashboard.

**Tabla de clientes:**
| Columna | Valor |
|---|---|
| Clínica | nombre + slug |
| Conversaciones (mes) | count |
| Citas (mes) | count |
| Último mensaje | hace cuánto |
| Estado bot | 🟢 activo / 🟡 inactivo >24h / 🔴 sin actividad >48h |

**Resumen global:** total conversaciones, total citas, total dinero ahorrado a clientes (suma de todas las clínicas) — para usar en propuestas comerciales.

---

## 5. Branding

Sistema **Laurisilva v2** del proyecto:

```
Fondo:       --bg (#F2EBE0)
Superficies: --surface (#FBF8F1)
Texto:       --text (#1A1210)
Primario:    --brand (#2A3A28)
Hover:       --brand-2 (#3E5340)
Acento/alerta: --accent (#B85838)
Éxito:       --success (#12b76a)
Tipografía display: Fraunces (serif)
Tipografía cuerpo:  Inter
Radios:      --radius-sm (12px) / --radius-md (18px)
Sombras:     --shadow-sm / --shadow-md
```

Las tarjetas de métricas usan `--surface` con `--shadow-sm` y `--radius-md`. El valor numérico grande en `Fraunces`. La etiqueta en `Inter` con `--text-muted`.

---

## 6. Cambios en `vercel.json`

Añadir el dominio Supabase al header `Content-Security-Policy` o `connect-src` para permitir las llamadas a la API:

```json
"connect-src 'self' https://tvkdhjxatkehuryvnjmu.supabase.co https://n8n-production-f6b85.up.railway.app"
```

---

## 7. Orden de construcción

1. **Supabase setup** (15 min)
   - Añadir columnas a `clinics`
   - Activar RLS + crear 4 políticas
   - Crear usuario auth para Dentilux (invite por email)

2. **`login.html`** (30 min)
   - Formulario + magic link
   - Test con email real

3. **`dashboard.html`** (2-3h)
   - Auth guard
   - 5 tarjetas con datos reales
   - Gráfico SVG

4. **`operaciones.html`** (1-1.5h)
   - Lista conversaciones
   - Botón unlock integrado

5. **`admin.html`** (1h)
   - Protección is_admin
   - Tabla multi-clínica

6. **Vercel + CSP** (15 min)
   - Actualizar `vercel.json`
   - Deploy y test en producción

**Total estimado: 6-8 horas de trabajo.**

---

## 8. Fuera de scope (esta iteración)

- Notificaciones push cuando hay paciente escalado
- Exportar métricas a PDF
- Gestión de facturación/suscripciones
- Multi-sector (dental vs otros sectores) — se añade cuando haya segundo cliente
