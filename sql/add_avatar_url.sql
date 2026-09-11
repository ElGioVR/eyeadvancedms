-- Migración: Agregar columna avatar_url a la tabla usuarios
-- Fecha: 2026-09-11
-- Descripción: Almacena la URL del avatar/foto de perfil del usuario en Supabase Storage

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar_url TEXT;
