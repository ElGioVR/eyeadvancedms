import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Consulta } from './Consulta.entity';
import { Paciente } from './Paciente.entity';
import { Aseguranza } from './Aseguranza.entity';

export enum MetodoPago {
  EFECTIVO = 'EFECTIVO',
  TARJETA = 'TARJETA',
  TRANSFERENCIA = 'TRANSFERENCIA',
  NO_APLICA = 'NO_APLICA',
}

export enum Moneda {
  PESOS = 'PESOS',
  DOLARES = 'DOLARES',
}

@Entity('cobros')
export class Cobro {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  consulta_id: string;

  @Column({ type: 'uuid' })
  paciente_id: string;

  @Column({ type: 'uuid', nullable: true })
  aseguranza_id: string;

  @Column({ type: 'enum', enum: MetodoPago, default: MetodoPago.NO_APLICA })
  metodo_pago: MetodoPago;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  monto: number;

  @Column({ type: 'enum', enum: Moneda, default: Moneda.PESOS })
  moneda: Moneda;

  @Column({ type: 'boolean', default: false })
  pagado: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  fecha_pago: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  folio: string;

  @Column({ type: 'text', nullable: true })
  notas: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToOne(() => Consulta, (consulta) => consulta.cobro)
  @JoinColumn({ name: 'consulta_id' })
  consulta: Consulta;

  @ManyToOne(() => Paciente)
  @JoinColumn({ name: 'paciente_id' })
  paciente: Paciente;

  @ManyToOne(() => Aseguranza, (aseguranza) => aseguranza.cobros)
  @JoinColumn({ name: 'aseguranza_id' })
  aseguranza: Aseguranza;
}
