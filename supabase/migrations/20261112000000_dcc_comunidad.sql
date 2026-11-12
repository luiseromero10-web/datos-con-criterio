-- Datos con Criterio · comunidad: comentarios, feedback y eventos de uso agregados.
--
-- Todos los objetos llevan el prefijo dcc_ y viven en el esquema public del proyecto compartido (romi-app). No se toca
-- ningún objeto de ROMI ni de Lector.
--
-- Aislamiento (la única puerta de entrada es la Edge Function dcc-comunidad, con la clave secreta):
--   * RLS activado y una política que NIEGA todo a anon y authenticated (así no aparece el aviso «RLS sin políticas»);
--   * sin privilegios de tabla para anon ni authenticated;
--   * funciones SECURITY INVOKER con search_path vacío, ejecutables solo por service_role.
--
-- Privacidad: no se guarda ninguna IP. El límite de envíos usa un hash con sal diaria que calcula la función.
-- El día se cuenta en hora de Colombia.

-- ───────────────────────── comentarios ─────────────────────────
create table public.dcc_comentarios (
  id          uuid primary key default gen_random_uuid(),
  hilo        text not null check (hilo ~ '^(app|articulo):[a-z0-9-]{1,80}$'),
  nombre      text not null check (char_length(nombre) between 2 and 60),
  cuerpo      text not null check (char_length(cuerpo) between 3 and 2000),
  respuesta_a uuid references public.dcc_comentarios (id) on delete cascade,
  estado      text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  app_origen  text not null check (app_origen ~ '^[a-z0-9-]{1,30}$'),
  creado      timestamptz not null default now()
);

-- lectura pública: solo los aprobados de un hilo, del más reciente al más antiguo
create index dcc_comentarios_hilo_idx on public.dcc_comentarios (hilo, creado desc) where estado = 'aprobado';
-- índice de la clave foránea de las respuestas
create index dcc_comentarios_respuesta_idx on public.dcc_comentarios (respuesta_a);

-- ───────────────────────── feedback (privado) ─────────────────────────
create table public.dcc_feedback (
  id             uuid primary key default gen_random_uuid(),
  app            text not null check (app ~ '^[a-z0-9-]{1,30}$'),
  ruta           text not null check (ruta ~ '^/[A-Za-z0-9/_.-]{0,120}$'),
  tipo           text not null check (tipo in ('error', 'idea', 'dato', 'otro')),
  mensaje        text not null check (char_length(mensaje) between 3 and 3000),
  contacto       text check (contacto is null or char_length(contacto) between 3 and 120),
  consentimiento boolean not null default false,
  creado         timestamptz not null default now(),
  -- solo se guarda un contacto si la persona lo autorizó expresamente
  constraint dcc_feedback_contacto_con_consentimiento check (contacto is null or consentimiento)
);

-- ───────────────────────── eventos de uso, agregados por día ─────────────────────────
create table public.dcc_eventos_dia (
  fecha     date   not null,
  app       text   not null check (app ~ '^[a-z0-9-]{1,30}$'),
  evento    text   not null check (evento ~ '^[a-z][a-z0-9_]{0,39}$'),
  propiedad text   not null default '' check (propiedad ~ '^[A-Za-z0-9_-]{0,40}$'),
  conteo    bigint not null default 0 check (conteo >= 0),
  primary key (fecha, app, evento, propiedad)
);

-- ───────────────────────── límite de envíos por día ─────────────────────────
create table public.dcc_limites (
  clave text not null check (char_length(clave) between 8 and 80),
  dia   date not null,
  n     int  not null default 0 check (n >= 0),
  primary key (clave, dia)
);

-- ───────────────────────── permisos: cerrado para el público ─────────────────────────
alter table public.dcc_comentarios enable row level security;
alter table public.dcc_feedback    enable row level security;
alter table public.dcc_eventos_dia enable row level security;
alter table public.dcc_limites     enable row level security;

revoke all on table public.dcc_comentarios, public.dcc_feedback, public.dcc_eventos_dia, public.dcc_limites from anon, authenticated;
grant select, insert, update, delete on table public.dcc_comentarios, public.dcc_feedback, public.dcc_eventos_dia, public.dcc_limites to service_role;

create policy dcc_sin_acceso on public.dcc_comentarios for all to anon, authenticated using (false) with check (false);
create policy dcc_sin_acceso on public.dcc_feedback    for all to anon, authenticated using (false) with check (false);
create policy dcc_sin_acceso on public.dcc_eventos_dia for all to anon, authenticated using (false) with check (false);
create policy dcc_sin_acceso on public.dcc_limites     for all to anon, authenticated using (false) with check (false);

-- ───────────────────────── funciones (solo service_role) ─────────────────────────

-- Suma un lote de eventos al conteo del día. Agrupa antes de insertar: el mismo par evento+propiedad puede venir repetido.
create function public.dcc_sumar_eventos(p_app text, p_eventos jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.dcc_eventos_dia as d (fecha, app, evento, propiedad, conteo)
  select (now() at time zone 'America/Bogota')::date, p_app, e.evento, e.propiedad, sum(e.n)
  from jsonb_to_recordset(p_eventos) as e (evento text, propiedad text, n bigint)
  group by e.evento, e.propiedad
  on conflict (fecha, app, evento, propiedad) do update set conteo = d.conteo + excluded.conteo;
$$;

-- Toma un cupo del día para una clave (hash, no IP). Devuelve true mientras no se supere el máximo. Limpia días viejos.
create function public.dcc_tomar_cupo(p_clave text, p_maximo int)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  hoy date := (now() at time zone 'America/Bogota')::date;
  usados int;
begin
  delete from public.dcc_limites where dia < hoy - 2;
  insert into public.dcc_limites as l (clave, dia, n) values (p_clave, hoy, 1)
  on conflict (clave, dia) do update set n = l.n + 1
  returning l.n into usados;
  return usados <= p_maximo;
end;
$$;

-- Número de comentarios aprobados por hilo (para las listas de artículos).
create function public.dcc_contar_comentarios(p_hilos text[])
returns table (hilo text, n bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.hilo, count(*)
  from public.dcc_comentarios c
  where c.estado = 'aprobado' and c.hilo = any (p_hilos)
  group by c.hilo;
$$;

revoke all on function public.dcc_sumar_eventos(text, jsonb)   from public, anon, authenticated;
revoke all on function public.dcc_tomar_cupo(text, int)        from public, anon, authenticated;
revoke all on function public.dcc_contar_comentarios(text[])   from public, anon, authenticated;
grant execute on function public.dcc_sumar_eventos(text, jsonb)  to service_role;
grant execute on function public.dcc_tomar_cupo(text, int)       to service_role;
grant execute on function public.dcc_contar_comentarios(text[])  to service_role;
