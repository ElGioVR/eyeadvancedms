import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Consulta } from './Consulta.entity';
import { Lente } from './Lente.entity';

export enum OjoPaciente {
  DERECHO = 'DERECHO',
  IZQUIERDO = 'IZQUIERDO',
  AMBOS = 'AMBOS',
}

@Entity('lentes_x_consulta')
export class LenteXConsulta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  consulta_id: string;

  @Column({ type: 'uuid' })
  lente_id: string;

  @Column({ type: 'enum', enum: OjoPaciente })
  ojo: OjoPaciente;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  grado_aplicado: number;

  @Column({ type: 'int', default: 1 })
  cantidad: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => Consulta, (consulta) => consulta.lentes)
  @JoinColumn({ name: 'consulta_id' })
  consulta: Consulta;

  @ManyToOne(() => Lente, (lente) => lente.consultas)
  @JoinColumn({ name: 'lente_id' })
  lente: Lente;
}
