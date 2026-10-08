-- Función de upsert atómica para rate limiting
-- Llamada por el microservicio: incrementa el contador por (ip_hash, window_key)
-- Devuelve el count resultante

create or replace function va_upsert_rate_limit(p_ip_hash text, p_window_key text)
returns integer language plpgsql as $$
declare
  v_count integer;
begin
  insert into va_rate_limits (ip_hash, window_key, count)
  values (p_ip_hash, p_window_key, 1)
  on conflict (ip_hash, window_key)
  do update set count = va_rate_limits.count + 1
  returning count into v_count;
  return v_count;
end;
$$;
