import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'auth_refresh_token' })
@Index('UQ_auth_refresh_token_hash', ['tokenHash'], { unique: true })
@Index('IDX_auth_refresh_token_family', ['familyId'])
@Index('IDX_auth_refresh_token_expiry', ['expiresAt'])
export class AuthRefreshToken {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  @Column({ name: 'customer_id', type: 'integer', nullable: true })
  customerId!: number | null;

  @Column({ name: 'employee_id', type: 'integer', nullable: true })
  employeeId!: number | null;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'replaced_by_token_id', type: 'uuid', nullable: true })
  replacedByTokenId!: string | null;
}
