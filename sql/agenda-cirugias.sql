-- Migración: Crear tabla agenda_cirugias para el módulo de Agenda de Cirugías
-- Ejecutar en Supabase SQL Editor o como migración

CREATE TYPE agenda_cirugia_estado AS ENUM ('agendada', 'aplazada', 'completada', 'cancelada');

CREATE TABLE agenda_cirugias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES pacientes(id) ON DELETE SET NULL,
  nombre_paciente TEXT NOT NULL,
  expediente TEXT,
  fecha DATE,
  hora TIME,
  jornada TEXT,
  diagnostico TEXT,
  procedimiento TEXT,
  ojo TEXT,
  lio TEXT,
  marca_lio TEXT,
  tiempo_estimado TEXT,
  tiempo_estancia TEXT,
  doctor_id UUID REFERENCES doctores(id) ON DELETE SET NULL,
  estado agenda_cirugia_estado NOT NULL DEFAULT 'agendada',
  procedencia TEXT,
  motivo_aplazamiento TEXT,
  notas TEXT,
  notificado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agenda_cirugias_fecha ON agenda_cirugias(fecha);
CREATE INDEX idx_agenda_cirugias_doctor_id ON agenda_cirugias(doctor_id);
CREATE INDEX idx_agenda_cirugias_estado ON agenda_cirugias(estado);
CREATE INDEX idx_agenda_cirugias_notificado ON agenda_cirugias(notificado, fecha, hora);

ALTER TABLE agenda_cirugias ENABLE ROW LEVEL SECURITY;

-- Admin ve todo
CREATE POLICY agenda_cirugias_admin_all ON agenda_cirugias
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = auth.uid() AND usuarios.rol = 'admin'
    )
  );

-- Doctores solo ven sus cirugías asignadas
CREATE POLICY agenda_cirugias_doctor_own ON agenda_cirugias
  USING (
    doctor_id IN (
      SELECT doctores.id FROM doctores
      WHERE doctores.usuario_id = auth.uid()
    )
  );

-- Recepcionistas ven todo
CREATE POLICY agenda_cirugias_recepcionista_all ON agenda_cirugias
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = auth.uid() AND usuarios.rol = 'recepcionista'
    )
  );
