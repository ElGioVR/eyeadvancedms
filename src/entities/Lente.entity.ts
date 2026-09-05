import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { CategoriaLente } from './CategoriaLente.entity';
import { Proveedor } from './Proveedor.entity';
import { LenteXConsulta } from './LenteXConsulta.entity';

export enum EstadoLente {
  DISPONIBLE = 'DISPONIBLE',
  OCUPADO = 'OCUPADO',
  DANADO = 'DANADO',
  VENCIDO = 'VENCIDO',
}

@Entity('lentes')
export class Lente {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  categoria_id: string;

  @Column({ type: 'varchar', length: 255 })
  marca: string;

  @Column({ type: 'varchar', length: 255 })
  modelo: string;

  @Column({ type: 'varchar', length: 100, unique: true, nullable: true })
  codigo_barras: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  grado_esferico: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  grado_cilindrico: number;

  @Column({ type: 'int', nullable: true })
  eje: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  color: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  material: string;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ type: 'int', default: 5 })
  stock_minimo: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  precio_compra: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  precio_venta: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lote: string;

  @Column({ type: 'date', nullable: true })
  fecha_caducidad: Date;

  @Column({ type: 'uuid', nullable: true })
  proveedor_id: string;

  @Column({ type: 'enum', enum: EstadoLente, default: EstadoLente.DISPONIBLE })
  estado: EstadoLente;

  @Column({ type: 'text', nullable: true })
  notas: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @ManyToOne(() => CategoriaLente, (categoria) => categoria.lentes)
  @JoinColumn({ name: 'categoria_id' })
  categoria: CategoriaLente;

  @ManyToOne(() => Proveedor, (proveedor) => proveedor.lentes)
  @JoinColumn({ name: 'proveedor_id' })
  proveedor: Proveedor;

  @OneToMany(() => LenteXConsulta, (lenteXConsulta) => lenteXConsulta.lente)
  consultas: LenteXConsulta[];
}
