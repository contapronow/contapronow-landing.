/**
 * Rutas de tool calling de Vapi.
 * Vapi llama a estas rutas con HMAC firmado cuando el LLM necesita datos reales.
 *
 * Patrón:  POST /tools/:toolName
 * Body:    { message: { call: { id, assistantId, customer: { number } }, toolCallList: [...] } }
 * Timeout: el microservicio debe responder en <800ms (Vapi timeout: 900ms)
 */

import { verifyVapiSignature } from '../services/hmac.js';
import {
  getBusinessByAssistantId,
  incrementRateLimit,
  findExistingBooking,
  createBooking,
} from '../services/supabase.js';
import { getAvailableSlots, createCalendarEvent } from '../services/calendar.js';
import { encryptPhone } from '../services/phone-crypto.js';
import { config } from '../config.js';

// Frases de cortesía para fallos (el agente las dice en voz alta)
const CORTESIA = {
  info: 'Lo siento, en este momento tengo dificultades para acceder a la información. ¿Puedo ayudarle con algo más o prefiere que le transfiera con alguien del equipo?',
  availability: 'Disculpe, ahora mismo no puedo consultar la disponibilidad. Le recomiendo llamarnos directamente o enviarnos un mensaje por WhatsApp para confirmar su cita.',
  booking: 'Lo siento, ha habido un problema al registrar su cita. Por favor, llámenos directamente y le atendemos enseguida.',
};

async function toolsRoutes(fastify) {
  // Middleware: validar HMAC + rate limit en todas las rutas de tools
  fastify.addHook('preHandler', async (req, reply) => {
    // Rate limit por IP
    try {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.ip;
      const count = await incrementRateLimit(ip);
      if (count > config.rateLimit.maxPerMinute) {
        return reply.code(429).send({ error: 'Too Many Requests' });
      }
    } catch (err) {
      req.log.warn({ err }, 'rate limit check failed — allowing request');
    }

    // HMAC
    const sig = req.headers['x-vapi-signature'];
    const raw = req.rawBody;
    if (!verifyVapiSignature(raw, sig)) {
      req.log.warn({ sig }, 'invalid HMAC signature');
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // ── get-info ───────────────────────────────────────────────────────────────
  // El agente llama esto cuando el usuario pregunta por horario, servicios, dirección, etc.
  fastify.post('/tools/get-info', async (req, reply) => {
    const { call, toolCallList } = req.body?.message ?? {};
    const toolCallId = toolCallList?.[0]?.id;
    const args = toolCallList?.[0]?.function?.arguments ?? {};

    if (!call?.assistantId) {
      return reply.send(toolResult(toolCallId, { status: 'error', message: CORTESIA.info }));
    }

    try {
      const business = await withTimeout(
        getBusinessByAssistantId(call.assistantId),
        700
      );

      if (!business.active) {
        return reply.send(toolResult(toolCallId, {
          status: 'inactive',
          message: business.inactive_message,
        }));
      }

      const { query_type } = args; // "hours" | "services" | "address" | "general"
      let result = {};

      if (!query_type || query_type === 'general') {
        result = buildFullInfo(business);
      } else if (query_type === 'hours') {
        result = { hours: buildHoursText(business.va_business_hours, business.timezone) };
      } else if (query_type === 'services') {
        result = { services: buildServicesText(business.va_services) };
      } else if (query_type === 'address') {
        result = { address: business.address, phone: business.phone_display };
      }

      return reply.send(toolResult(toolCallId, { status: 'ok', ...result }));
    } catch (err) {
      req.log.error({ err }, 'get-info error');
      return reply.send(toolResult(toolCallId, { status: 'error', message: CORTESIA.info }));
    }
  });

  // ── check-availability ─────────────────────────────────────────────────────
  // El agente llama esto cuando el usuario quiere reservar y necesita ver huecos.
  fastify.post('/tools/check-availability', async (req, reply) => {
    const { call, toolCallList } = req.body?.message ?? {};
    const toolCallId = toolCallList?.[0]?.id;
    const args = toolCallList?.[0]?.function?.arguments ?? {};

    if (!call?.assistantId) {
      return reply.send(toolResult(toolCallId, { status: 'error', message: CORTESIA.availability }));
    }

    try {
      const business = await withTimeout(
        getBusinessByAssistantId(call.assistantId),
        400
      );

      if (business.booking_provider === 'none') {
        return reply.send(toolResult(toolCallId, {
          status: 'no_booking',
          message: 'Este negocio no gestiona citas por teléfono. Puede pasarse directamente por el local.',
        }));
      }

      // args.date: "2024-01-20" (el LLM lo extrae de la conversación)
      const targetDate = args.date ? new Date(args.date) : getNextWorkday(business);
      const tz = business.timezone ?? 'Atlantic/Canary';

      // Construir dayStart y dayEnd en Atlantic/Canary
      const dayStart = toTzDate(targetDate, '09:00', tz);
      const dayEnd   = toTzDate(targetDate, '20:00', tz);

      const slots = await withTimeout(
        getAvailableSlots(
          business.google_calendar_id,
          dayStart,
          dayEnd,
          business.slot_duration_min
        ),
        650
      );

      // Filtrar slots que no respetan min_notice_hours
      const minNoticeMs = (business.min_notice_hours ?? 2) * 3_600_000;
      const available = slots.filter(
        (s) => new Date(s.start).getTime() - Date.now() >= minNoticeMs
      );

      return reply.send(toolResult(toolCallId, {
        status: 'ok',
        date: targetDate.toLocaleDateString('es-ES', { timeZone: tz }),
        available_slots: available.slice(0, 6), // máx 6 slots para no saturar al LLM
        total_available: available.length,
      }));
    } catch (err) {
      req.log.error({ err }, 'check-availability error');
      return reply.send(toolResult(toolCallId, { status: 'error', message: CORTESIA.availability }));
    }
  });

  // ── book ───────────────────────────────────────────────────────────────────
  // El agente llama esto cuando el usuario confirma una cita.
  fastify.post('/tools/book', async (req, reply) => {
    const { call, toolCallList } = req.body?.message ?? {};
    const toolCallId = toolCallList?.[0]?.id;
    const args = toolCallList?.[0]?.function?.arguments ?? {};

    if (!call?.assistantId) {
      return reply.send(toolResult(toolCallId, { status: 'error', message: CORTESIA.booking }));
    }

    try {
      const business = await withTimeout(
        getBusinessByAssistantId(call.assistantId),
        300
      );

      const { start_time, end_time, client_name, service_name, client_notes } = args;

      // Idempotencia: evitar doble-reserva
      const existing = await findExistingBooking(call.id, business.id, start_time);
      if (existing) {
        return reply.send(toolResult(toolCallId, {
          status: 'already_booked',
          booking_id: existing.id,
          message: `Su cita para ${formatDt(start_time, business.timezone)} ya estaba registrada. ¡Hasta entonces!`,
        }));
      }

      // Crear evento en Google Calendar
      let googleEvent = null;
      if (business.booking_provider === 'google_calendar' && business.google_calendar_id) {
        googleEvent = await withTimeout(
          createCalendarEvent({
            calendarId: business.google_calendar_id,
            title: `Cita — ${client_name ?? 'Cliente'} — ${service_name ?? 'Servicio'}`,
            start: start_time,
            end: end_time ?? addMinutes(start_time, business.slot_duration_min),
            description: client_notes ?? '',
            attendeeName: client_name,
          }),
          600
        );
      }

      // Cifrar teléfono antes de guardar
      const callerPhone = call?.customer?.number;
      let phoneEncrypted = null;
      let phoneIv = null;
      if (callerPhone) {
        const enc = encryptPhone(callerPhone);
        phoneEncrypted = enc.ciphertext + ':' + enc.tag; // tag incluido en ciphertext
        phoneIv = enc.iv;
      }

      // Guardar en Supabase
      const booking = await createBooking({
        business_id:            business.id,
        vapi_call_id:           call.id,
        service_name:           service_name ?? '',
        start_time,
        end_time:               end_time ?? addMinutes(start_time, business.slot_duration_min),
        client_name:            client_name ?? '',
        client_phone_encrypted: phoneEncrypted,
        client_phone_iv:        phoneIv,
        client_notes:           client_notes ?? '',
        google_event_id:        googleEvent?.id ?? null,
        google_calendar_id:     business.google_calendar_id,
        status:                 'confirmed',
      });

      return reply.send(toolResult(toolCallId, {
        status: 'confirmed',
        booking_id: booking.id,
        message: `Perfecto, ${client_name ? client_name + ', ' : ''}su cita queda confirmada para el ${formatDt(start_time, business.timezone)}. Le esperamos en ${business.address}. ¿Hay algo más en lo que pueda ayudarle?`,
      }));
    } catch (err) {
      req.log.error({ err }, 'book error');
      return reply.send(toolResult(toolCallId, { status: 'error', message: CORTESIA.booking }));
    }
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function toolResult(toolCallId, result) {
  return {
    results: [{
      toolCallId,
      result: JSON.stringify(result),
    }],
  };
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    ),
  ]);
}

function buildFullInfo(business) {
  return {
    name: business.name,
    description: business.description,
    address: business.address,
    phone: business.phone_display,
    whatsapp: business.whatsapp_display,
    hours: buildHoursText(business.va_business_hours, business.timezone),
    services: buildServicesText(business.va_services),
  };
}

function buildHoursText(hours, tz) {
  if (!hours?.length) return 'Consultar horario llamando al negocio.';
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return hours
    .sort((a, b) => a.day_of_week - b.day_of_week)
    .map((h) => {
      if (!h.open_time) return `${days[h.day_of_week]}: Cerrado`;
      let line = `${days[h.day_of_week]}: ${h.open_time.slice(0, 5)}–${h.close_time.slice(0, 5)}`;
      if (h.lunch_start) line += ` (pausa ${h.lunch_start.slice(0, 5)}–${h.lunch_end.slice(0, 5)})`;
      return line;
    })
    .join(', ');
}

function buildServicesText(services) {
  if (!services?.length) return 'Consultar servicios disponibles.';
  return services
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => `${s.name}${s.price_range ? ' (' + s.price_range + ')' : ''}`)
    .join(', ');
}

function formatDt(isoString, tz) {
  return new Date(isoString).toLocaleString('es-ES', {
    timeZone: tz ?? 'Atlantic/Canary',
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function addMinutes(isoString, minutes) {
  return new Date(new Date(isoString).getTime() + minutes * 60_000).toISOString();
}

function getNextWorkday(business) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

function toTzDate(date, timeStr, tz) {
  // Obtener la fecha local en la timezone del negocio ("YYYY-MM-DD")
  const dateStr = new Date(date).toLocaleDateString('en-CA', { timeZone: tz });
  // Tratar timeStr como si fuera UTC (naive)
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  // ¿Qué hora local muestra naive en la tz del negocio?
  const localIso = naive.toLocaleString('sv-SE', { timeZone: tz }).replace(' ', 'T');
  // Diferencia = cuánto hay que corregir para que el local sea exactamente timeStr
  const diffMs = naive.getTime() - new Date(`${localIso}Z`).getTime();
  return new Date(naive.getTime() + diffMs);
}

export default toolsRoutes;
