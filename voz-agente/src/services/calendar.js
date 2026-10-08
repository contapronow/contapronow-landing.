import { google } from 'googleapis';
import { config } from '../config.js';

let authClient = null;

function getAuthClient() {
  if (authClient) return authClient;

  let credentials;
  if (config.google.serviceAccountJson) {
    credentials = JSON.parse(config.google.serviceAccountJson);
  } else {
    // Fallback a GOOGLE_APPLICATION_CREDENTIALS (fichero local en dev)
    credentials = undefined; // googleapis lo carga automáticamente
  }

  authClient = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return authClient;
}

const calendar = () => google.calendar({ version: 'v3', auth: getAuthClient() });

/**
 * Devuelve los slots libres en el calendario de un negocio.
 * @param {string} calendarId
 * @param {Date} dayStart  — inicio del día a buscar
 * @param {Date} dayEnd    — fin del día a buscar
 * @param {number} slotMinutes — duración de cada slot
 */
export async function getAvailableSlots(calendarId, dayStart, dayEnd, slotMinutes = 30) {
  const cal = calendar();
  const { data } = await cal.freebusy.query({
    requestBody: {
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      timeZone: config.timezone,
      items: [{ id: calendarId }],
    },
  });

  const busy = (data.calendars[calendarId]?.busy ?? []).map((b) => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }));

  const slots = [];
  let cursor = new Date(dayStart);
  while (cursor < dayEnd) {
    const slotEnd = new Date(cursor.getTime() + slotMinutes * 60_000);
    if (slotEnd > dayEnd) break;
    const overlaps = busy.some((b) => cursor < b.end && slotEnd > b.start);
    if (!overlaps) {
      slots.push({
        start: cursor.toISOString(),
        end: slotEnd.toISOString(),
        label: formatTimeCanary(cursor),
      });
    }
    cursor = slotEnd;
  }
  return slots;
}

/**
 * Crea un evento en el calendario del negocio.
 */
export async function createCalendarEvent({ calendarId, title, start, end, description, attendeeName }) {
  const cal = calendar();
  const { data } = await cal.events.insert({
    calendarId,
    requestBody: {
      summary: title,
      description,
      start: { dateTime: start, timeZone: config.timezone },
      end:   { dateTime: end,   timeZone: config.timezone },
      status: 'confirmed',
      extendedProperties: {
        private: { source: 'voz-agente', attendeeName: attendeeName ?? '' },
      },
    },
  });
  return data; // contiene data.id = google_event_id
}

function formatTimeCanary(date) {
  return date.toLocaleTimeString('es-ES', {
    timeZone: 'Atlantic/Canary',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
