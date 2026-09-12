const errorTranslations: Record<string, string> = {
  'new row violates row-level security policy': 'No tienes permisos para realizar esta acción',
  'insert or update on table "lentes_x_consulta" violates foreign key constraint': 'El lente seleccionado no existe',
  'new row violates row-level security policy for table "lentes_x_consulta":': 'No tienes permisos para asignar lentes',
  'null value in column "nombre_completo" violates not-null constraint': 'El nombre del paciente es obligatorio',
  'null value in column "paciente_id" violates not-null constraint': 'El paciente es obligatorio',
  'null value in column "doctor_id" violates not-null constraint': 'El doctor es obligatorio',
  'null value in column "fecha" violates not-null constraint': 'La fecha es obligatoria',
  'null value in column "hora_inicio" violates not-null constraint': 'La hora de inicio es obligatoria',
  'null value in column "tipo_consulta" violates not-null constraint': 'El tipo de consulta es obligatorio',
  'null value in column "tipo_visita" violates not-null constraint': 'El tipo de visita es obligatorio',
  'invalid input value for enum tipo_consulta': 'Tipo de consulta no válido',
  'invalid input value for enum tipo_visita': 'Tipo de visita no válido',
  'insert or update on table "consultas" violates foreign key constraint "consultas_paciente_id_fkey"': 'El paciente seleccionado no existe',
  'insert or update on table "consultas" violates foreign key constraint "consultas_doctor_id_fkey"': 'El doctor seleccionado no existe',
  'duplicate key value violates unique constraint': 'Ya existe un registro con esos datos',
  'insert or update on table "lentes" violates foreign key constraint': 'La categoría o proveedor seleccionado no existe',
  'invalid input syntax for type uuid': 'ID no válido',
  'null value in column': 'Faltan campos obligatorios',
  'Unable to validate email address: invalid format': 'El formato del correo electrónico no es válido',
  'A user with this email address has already been registered': 'Ya existe un usuario con este correo electrónico',
  'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres',
  'New password should be different from the old password': 'La nueva contraseña debe ser diferente a la anterior',
  'User not found': 'Usuario no encontrado',
  'Missing user ID': 'Falta el ID del usuario',
  'duplicate key value violates unique constraint "doctores_cedula_profesional_key"': 'Ya existe un doctor con esta cédula profesional',
  'duplicate key value violates unique constraint "aseguranzas_nombre_key"': 'Ya existe una aseguranza con este nombre',
  'duplicate key value violates unique constraint "categorias_lentes_nombre_key"': 'Ya existe una categoría con este nombre',
  'duplicate key value violates unique constraint "proveedores_nombre_key"': 'Ya existe un proveedor con este nombre',
  'insert or update on table "agenda_cirugias" violates foreign key constraint "agenda_cirugias_paciente_id_fkey"': 'El paciente seleccionado no existe',
  'insert or update on table "agenda_cirugias" violates foreign key constraint "agenda_cirugias_doctor_id_fkey"': 'El doctor seleccionado no existe',
  'invalid input value for enum agenda_cirugia_estado': 'Estado de cirugía no válido',
};

function translateError(msg: string): string {
  for (const [key, val] of Object.entries(errorTranslations)) {
    if (msg.includes(key)) return val;
  }
  return 'Error interno del servidor';
}

export { errorTranslations, translateError };
