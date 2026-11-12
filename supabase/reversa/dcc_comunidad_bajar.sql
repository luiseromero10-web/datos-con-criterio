-- Reversa de supabase/migrations/20261112000000_dcc_comunidad.sql.
--
-- Borra SOLO objetos dcc_ y los datos que contengan (comentarios, feedback y conteos). No toca nada de ROMI ni de Lector.
-- Úsese únicamente para deshacer la migración; no está en la carpeta de migraciones para que nunca se aplique sola.
-- Antes de ejecutarla, exporte lo que quiera conservar (comentarios aprobados, feedback).
drop function if exists public.dcc_sumar_eventos(text, jsonb);
drop function if exists public.dcc_tomar_cupo(text, int);
drop function if exists public.dcc_contar_comentarios(text[]);
drop table if exists public.dcc_comentarios;   -- elimina también sus índices y su política
drop table if exists public.dcc_feedback;
drop table if exists public.dcc_eventos_dia;
drop table if exists public.dcc_limites;
