import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'employee' })
@Index('UQ_employee_email', ['email'], { unique: true })
export class Employee {
  @PrimaryGeneratedColumn({ name: 'employee_id', type: 'integer' })
  employeeId!: number;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 80 })
  position!: string;

  @Column({ type: 'varchar', length: 30, default: 'active' })
  status!: string;
}
