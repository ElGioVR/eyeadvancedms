import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Consulta } from './Consulta.entity';

export enum SexoPaciente {
  MASCULINO = 'MASCULINO',
  FEMENINO = 'FEMENINO',
  OTRO = 'OTRO',
}

@Entity('pacientes')
export class Paciente {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  nombre_completo: string;

  @Column({ type: 'enum', enum: SexoPaciente })
  sexo: SexoPaciente;

  @Column({ type: 'date' })
  fecha_nacimiento: Date;

  @Column({ type: 'int', nullable: true })
  edad: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string;

  @Column({ type: 'text', nullable: true })
  direccion: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contacto_emergencia: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  tel_emergencia: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => Consulta, (consulta) => consulta.paciente)
  consultas: Consulta[];
}
