-- =====================================================================
-- Seed: Gangas Gonzales — Tenerife
-- Comercio local (bazar/ferretería/hogar). Demo ContaProNow.
-- =====================================================================
-- IMPORTANTE: actualiza los campos marcados con TODO antes de la demo

-- Generar IDs deterministas para poder referenciarlos
do $$
declare
  v_business_id uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
begin

-- Negocio
insert into va_businesses (
  id, account_id, name, slug, sector,
  description, address, phone_display, website, whatsapp_display,
  transfer_whatsapp,
  google_calendar_id,
  booking_provider,
  slot_duration_min, advance_booking_days, min_notice_hours,
  primary_language, secondary_language, timezone,
  active,
  gdpr_notice,
  inactive_message
) values (
  v_business_id,
  '00000000-0000-0000-0000-000000000001',  -- account ContaProNow
  'Gangas Gonzales',
  'gangas-gonzales',
  'comercio',
  -- description: el agente la usa para responder preguntas generales
  E'Bazar y tienda de hogar en Tenerife. Vendemos artículos del hogar, decoración, ferretería básica, electrodomésticos pequeños, ropa de cama, menaje y mucho más a precios muy competitivos. Somos conocidos por nuestras grandes ofertas y variedad de producto.',
  -- TODO: confirmar dirección exacta con el dueño
  'Calle TODO 00, Santa Cruz de Tenerife, 38001',
  -- TODO: confirmar teléfono real del negocio
  '+34 922 000 000',
  -- TODO: confirmar web si tiene
  null,
  -- TODO: confirmar WhatsApp del negocio
  '+34 600 000 000',
  -- transfer_whatsapp: número del dueño para recibir resúmenes post-llamada
  -- TODO: sustituir por el WhatsApp real de Gonzales
  '+34 600 000 000',
  -- google_calendar_id: crear calendario "Gangas Gonzales — reservas" en contapronoww@gmail.com
  -- compartirlo con el service account, copiar el ID aquí
  -- TODO: 'xxxxxxxxxx@group.calendar.google.com'
  'TODO_CALENDAR_ID@group.calendar.google.com',
  -- booking_provider: 'none' porque es comercio; si quisiera citas lo cambiamos
  'none',
  30, 7, 1,
  'es', 'en', 'Atlantic/Canary',
  true,
  'Esta llamada puede ser grabada para fines de gestión y calidad. Sus datos serán tratados conforme al Reglamento General de Protección de Datos.',
  'En este momento Gangas Gonzales no puede atenderle. Puede visitarnos durante nuestro horario de atención o enviarnos un mensaje por WhatsApp.'
)
on conflict (slug) do update set
  description    = excluded.description,
  updated_at     = now();

-- Horarios (Gangas Gonzales — horario tipo comercio canario)
-- TODO: confirmar horario real con el dueño
-- 0=domingo, 1=lunes, ..., 6=sábado
delete from va_business_hours where business_id = v_business_id;

insert into va_business_hours (business_id, day_of_week, open_time, close_time, lunch_start, lunch_end)
values
  (v_business_id, 0, null,  null,  null,  null),   -- domingo: cerrado
  (v_business_id, 1, '09:00', '20:00', '14:00', '16:00'), -- lunes
  (v_business_id, 2, '09:00', '20:00', '14:00', '16:00'), -- martes
  (v_business_id, 3, '09:00', '20:00', '14:00', '16:00'), -- miércoles
  (v_business_id, 4, '09:00', '20:00', '14:00', '16:00'), -- jueves
  (v_business_id, 5, '09:00', '20:00', '14:00', '16:00'), -- viernes
  (v_business_id, 6, '09:00', '14:00', null,  null);      -- sábado: solo mañana

-- Servicios / información (para que el agente sepa qué hay)
-- booking_provider='none' → bookable=false en todos, el agente da info y transfiere
delete from va_services where business_id = v_business_id;

insert into va_services (business_id, name, description, price_range, bookable, sort_order)
values
  (v_business_id, 'Artículos del hogar',
   'Menaje de cocina, utensilios, almacenaje, organización del hogar',
   'desde 1€', false, 1),
  (v_business_id, 'Decoración',
   'Cuadros, textiles, velas, adornos y artículos de decoración variados',
   'desde 2€', false, 2),
  (v_business_id, 'Ferretería básica',
   'Herramientas de mano, tornillería, clavos, cinta adhesiva, pintura básica',
   'desde 0,50€', false, 3),
  (v_business_id, 'Electrodomésticos pequeños',
   'Tostadoras, hervidores, batidoras, planchas y pequeño electro',
   'desde 8€', false, 4),
  (v_business_id, 'Ropa de cama y baño',
   'Sábanas, fundas, toallas, mantas, cojines',
   'desde 5€', false, 5),
  (v_business_id, 'Juguetes y artículos infantiles',
   'Juguetes económicos, material escolar, mochilas',
   'desde 1€', false, 6),
  (v_business_id, 'Limpieza y droguería',
   'Productos de limpieza del hogar, detergentes, fregonas, cubos',
   'desde 0,80€', false, 7),
  (v_business_id, 'Ofertas y liquidaciones',
   'Artículos de temporada a precios reducidos, liquidaciones de stock',
   'precios especiales', false, 8);

end $$;
