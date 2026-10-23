-- =====================================================================
-- Notificaciones push (Web Push) en celular/computadora + recordatorios de
-- próxima cita. Idempotente. Copiar TODO en el SQL Editor de Supabase y Run.
--
--  push_suscripciones      → un renglón por dispositivo/navegador de cada usuario.
--  *.recordatorio_para     → "fecha hora" a la que ya se envió el recordatorio de
--                            la cita; si la cita se mueve, se vuelve a avisar.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS push_suscripciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  -- true = en la pantalla de bloqueo no se muestran datos del paciente.
  discreta BOOLEAN NOT NULL DEFAULT false,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_suscripciones_user ON push_suscripciones (user_id);

-- Solo el backend (service role) la lee y escribe.
ALTER TABLE push_suscripciones ENABLE ROW LEVEL SECURITY;

ALTER TABLE consultas       ADD COLUMN IF NOT EXISTS recordatorio_para TEXT;
ALTER TABLE agenda_cirugias ADD COLUMN IF NOT EXISTS recordatorio_para TEXT;

COMMIT;

NOTIFY pgrst, 'reload schema';
