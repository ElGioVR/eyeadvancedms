import { DataSource } from 'typeorm';
import { Usuario } from '../entities/Usuario.entity';
import { Doctor } from '../entities/Doctor.entity';
import { Paciente } from '../entities/Paciente.entity';
import { Consulta } from '../entities/Consulta.entity';
import { Cobro } from '../entities/Cobro.entity';
import { Aseguranza } from '../entities/Aseguranza.entity';
import { CategoriaLente } from '../entities/CategoriaLente.entity';
import { Proveedor } from '../entities/Proveedor.entity';
import { Lente } from '../entities/Lente.entity';
import { LenteXConsulta } from '../entities/LenteXConsulta.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: process.env.NODE_ENV !== 'development',
  },
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: [
    Usuario,
    Doctor,
    Paciente,
    Consulta,
    Cobro,
    Aseguranza,
    CategoriaLente,
    Proveedor,
    Lente,
    LenteXConsulta,
  ],
  migrations: ['src/migrations/*.ts'],
  subscribers: [],
});
