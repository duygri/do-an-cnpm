import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = await this.deriveKey(password, salt);

    return [
      'scrypt',
      COST,
      BLOCK_SIZE,
      PARALLELIZATION,
      salt.toString('base64url'),
      derivedKey.toString('base64url'),
    ].join('$');
  }

  async verify(password: string, storedHash: string | null): Promise<boolean> {
    if (!storedHash) {
      await this.deriveKey(password, Buffer.alloc(16));
      return false;
    }

    const [
      algorithm,
      cost,
      blockSize,
      parallelization,
      saltText,
      hashText,
      extra,
    ] = storedHash.split('$');

    if (
      algorithm !== 'scrypt' ||
      Number(cost) !== COST ||
      Number(blockSize) !== BLOCK_SIZE ||
      Number(parallelization) !== PARALLELIZATION ||
      !saltText ||
      !hashText ||
      extra !== undefined
    ) {
      return false;
    }

    const salt = Buffer.from(saltText, 'base64url');
    const expectedKey = Buffer.from(hashText, 'base64url');

    if (salt.length !== 16 || expectedKey.length !== KEY_LENGTH) {
      return false;
    }

    const actualKey = await this.deriveKey(password, salt);
    return timingSafeEqual(actualKey, expectedKey);
  }

  private deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(
        password,
        salt,
        KEY_LENGTH,
        {
          N: COST,
          r: BLOCK_SIZE,
          p: PARALLELIZATION,
          maxmem: MAX_MEMORY,
        },
        (error, derivedKey) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(derivedKey);
        },
      );
    });
  }
}
