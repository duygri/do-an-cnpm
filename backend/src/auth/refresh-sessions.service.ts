import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { Employee } from '../employees/entities/employee.entity';
import { AccessTokenPayload } from './auth.types';
import {
  ACCESS_TOKEN_LIFETIME_SECONDS,
  REFRESH_TOKEN_LIFETIME_MS,
} from './auth-token.constants';
import { AuthActor } from './auth-cookie';
import { AuthRefreshToken } from './entities/auth-refresh-token.entity';
import { JwtService } from '@nestjs/jwt';

export interface SessionTokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

@Injectable()
export class RefreshSessionsService {
  constructor(
    @InjectRepository(AuthRefreshToken)
    private readonly refreshTokens: Repository<AuthRefreshToken>,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
  ) {}

  async createSession(
    actor: AuthActor,
    principalId: number,
  ): Promise<SessionTokenPair> {
    const refreshToken = this.newRefreshToken();
    const now = new Date();
    const row = this.refreshTokens.create({
      id: randomUUID(),
      familyId: randomUUID(),
      customerId: actor === 'customer' ? principalId : null,
      employeeId: actor === 'employee' ? principalId : null,
      tokenHash: this.hash(refreshToken),
      createdAt: now,
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS),
      consumedAt: null,
      revokedAt: null,
      replacedByTokenId: null,
    });
    const accessToken = await this.createAccessToken(actor, principalId);

    await this.refreshTokens.save(row);
    return { accessToken, refreshToken };
  }

  async rotate(
    actor: AuthActor,
    refreshToken: string,
  ): Promise<{ tokens: SessionTokenPair; response: RefreshResponse }> {
    const tokenHash = this.hash(refreshToken);
    const nextRefreshToken = this.newRefreshToken();
    const queryRunner = this.dataSource.createQueryRunner();
    let tokenPair: SessionTokenPair | undefined;

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const tokenRepository =
        queryRunner.manager.getRepository(AuthRefreshToken);
      const row = await tokenRepository.findOne({
        where: { tokenHash },
        lock: { mode: 'pessimistic_write' },
      });

      if (!row) {
        await queryRunner.commitTransaction();
        throw new UnauthorizedException('Refresh token is invalid.');
      }

      const now = new Date();
      const ownerMatches =
        (actor === 'customer' &&
          row.customerId !== null &&
          row.employeeId === null) ||
        (actor === 'employee' &&
          row.employeeId !== null &&
          row.customerId === null);
      const isUsable =
        ownerMatches &&
        row.consumedAt === null &&
        row.revokedAt === null &&
        row.expiresAt.getTime() > now.getTime();

      if (!isUsable) {
        await tokenRepository.update(
          { familyId: row.familyId },
          { revokedAt: now },
        );
        await queryRunner.commitTransaction();
        throw new UnauthorizedException(
          'Refresh token is invalid or has been reused.',
        );
      }

      const principalId =
        actor === 'customer' ? row.customerId! : row.employeeId!;
      const actorIsValid =
        actor === 'customer'
          ? Boolean(
              await queryRunner.manager.findOneBy(Customer, {
                customerId: principalId,
              }),
            )
          : (
              await queryRunner.manager.findOneBy(Employee, {
                employeeId: principalId,
              })
            )?.status === 'active';

      if (!actorIsValid) {
        await tokenRepository.update(
          { familyId: row.familyId },
          { revokedAt: now },
        );
        await queryRunner.commitTransaction();
        throw new UnauthorizedException('The account is no longer available.');
      }

      const replacement = tokenRepository.create({
        id: randomUUID(),
        familyId: row.familyId,
        customerId: row.customerId,
        employeeId: row.employeeId,
        tokenHash: this.hash(nextRefreshToken),
        createdAt: now,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS),
        consumedAt: null,
        revokedAt: null,
        replacedByTokenId: null,
      });
      const accessToken = await this.createAccessToken(actor, principalId);
      await tokenRepository.save(replacement);
      row.consumedAt = now;
      row.replacedByTokenId = replacement.id;
      await tokenRepository.save(row);
      tokenPair = { accessToken, refreshToken: nextRefreshToken };
      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive)
        await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    if (!tokenPair)
      throw new UnauthorizedException('Refresh token is invalid.');
    return {
      tokens: tokenPair,
      response: {
        access_token: tokenPair.accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_LIFETIME_SECONDS,
      },
    };
  }

  async revokeCurrentFamily(
    actor: AuthActor,
    refreshToken: string | null,
  ): Promise<void> {
    if (!refreshToken) return;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const repository = queryRunner.manager.getRepository(AuthRefreshToken);
      const row = await repository.findOne({
        where: { tokenHash: this.hash(refreshToken) },
        lock: { mode: 'pessimistic_write' },
      });
      const ownerMatches =
        (actor === 'customer' &&
          row?.customerId !== null &&
          row?.employeeId === null) ||
        (actor === 'employee' &&
          row?.employeeId !== null &&
          row?.customerId === null);

      if (row && ownerMatches) {
        await repository.update(
          { familyId: row.familyId },
          { revokedAt: new Date() },
        );
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive)
        await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async removeInactiveFamilies(): Promise<void> {
    await this.dataSource.query(`
      DELETE FROM "auth_refresh_token" token
      WHERE token."expires_at" < NOW() - INTERVAL '30 days'
        AND NOT EXISTS (
          SELECT 1
          FROM "auth_refresh_token" active
          WHERE active."family_id" = token."family_id"
            AND active."expires_at" > NOW()
            AND active."consumed_at" IS NULL
            AND active."revoked_at" IS NULL
        )
    `);
  }

  private newRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private createAccessToken(
    actor: AuthActor,
    principalId: number,
  ): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: String(principalId),
      actorType: actor,
    };
    return this.jwt.signAsync(payload);
  }
}
