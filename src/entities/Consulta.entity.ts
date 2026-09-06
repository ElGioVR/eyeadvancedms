import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Paciente } from './Paciente.entity';
import { Doctor } from './Doctor.entity';
import { Cobro } from './Cobro.entity';
import { LenteXConsulta } from './LenteXConsulta.entity';

export enum TipoConsulta {
  CONSULTA = 'CONSULTA',
  ESTUDIO = 'ESTUDIO',
  REVISION = 'REVISION',
  PROCEDIMIENTO = 'PROCEDIMIENTO',
}

export enum TipoVisita {
  PRIMERA_VEZ = 'PRIMERA_VEZ',
  SUBSECUENTE = 'SUBSECUENTE',
}

@Entity('consultas')
export class Consulta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  paciente_id: string;

  @Column({ type: 'uuid' })
  doctor_id: string;

  @Column({ type: 'date' })
  fecha: Date;

  @Column({ type: 'time' })
  hora_inicio: string;

  @Column({ type: 'time', nullable: true })
  hora_fin: string;

  @Column({ type: 'enum', enum: TipoConsulta })
  tipo_consulta: TipoConsulta;

  @Column({ type: 'enum', enum: TipoVisita })
  tipo_visita: TipoVisita;

  @Column({ type: 'varchar', length: 20, nullable: true, unique: true })
  folio: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  diagnostico: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  estudio_1: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  estudio_2: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  estudio_3: string;

  @Column({ type: 'text', nullable: true })
  procedimiento: string;

  @Column({ type: 'text', nullable: true })
  notas: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @ManyToOne(() => Paciente, (paciente) => paciente.consultas)
  @JoinColumn({ name: 'paciente_id' })
  paciente: Paciente;

  @ManyToOne(() => Doctor, (doctor) => doctor.consultas)
  @JoinColumn({ name: 'doctor_id' })
  doctor: Doctor;

  @OneToOne(() => Cobro, (cobro) => cobro.consulta)
  cobro: Cobro;

  @OneToMany(() => LenteXConsulta, (lenteXConsulta) => lenteXConsulta.consulta)
  lentes: LenteXConsulta[];
}
