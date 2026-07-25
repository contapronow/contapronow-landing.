import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { config } from '../config.js';

export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  { auth: { persistSession: false } }
);

// ── Businesses ────────────────────────────────────────────────────────────────

/**
 * Carga la configuración completa de un negocio por su vapi_assistant_id.
 * Incluye horarios y servicios en la misma llamada.
 */
export async function getBusinessByAssistantId(vapiAssistantId) {
  const { data, error } = await supabase
    .from('va_businesses')
    .select(`
      *,
      va_business_hours(*),
      va_services(*)
    `)
    .eq('vapi_assistant_id', vapiAssistantId)
    .single();
  if (error) throw error;
  return data;
}

export async function getBusinessById(businessId) {
  const { data, error } = await supabase
    .from('va_businesses')
    .select(`*, va_business_hours(*), va_services(*)`)
    .eq('id', businessId)
    .single();
  if (error) throw error;
  return data;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

/**
 * Incrementa el contador de peticiones de una IP en la ventana actual (por minuto).
 * Devuelve el count actualizado.
 */
export async function incrementRateLimit(ip) {
  const ipHash = createHash('sha256').update(ip).digest('hex');
  const now = new Date();
  // Ventana: minuto exacto en UTC
  const windowKey = `${now.toISOString().slice(0, 16)}`; // "2024-01-15T10:05"

  const { data, error } = await supabase.rpc('va_upsert_rate_limit', {
    p_ip_hash: ipHash,
    p_window_key: windowKey,
  });
  if (error) throw error;
  return data;
}

// ── Calls ─────────────────────────────────────────────────────────────────────

export async function upsertCall(payload) {
  const { data, error } = await supabase
    .from('va_calls')
    .upsert(payload, { onConflict: 'vapi_call_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Bookings ──────────────────────────────────────────────────────────────────

/**
 * Comprueba idempotencia antes de crear una reserva.
 * Si ya existe (misma vapi_call_id + business_id + start_time), devuelve la existente.
 */
export async function findExistingBooking(vapiCallId, businessId, startTime) {
  const { data } = await supabase
    .from('va_bookings')
    .select('*')
    .eq('vapi_call_id', vapiCallId)
    .eq('business_id', businessId)
    .eq('start_time', startTime)
    .maybeSingle();
  return data;
}

export async function createBooking(payload) {
  const { data, error } = await supabase
    .from('va_bookings')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}
