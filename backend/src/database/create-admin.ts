import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { isEmail } from 'class-validator';
import { DataSource } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { PasswordService } from '../auth/password.service';
import dataSource from './data-source';

function ask(question: string): Promise<string> {
  const readline = createInterface({ input: stdin, output: stdout });
  return new Promise((resolve) => {
    readline.question(question, (answer) => {
      readline.close();
      resolve(answer);
    });
  });
}

function askSecret(question: string): Promise<string> {
  if (!stdin.isTTY) {
    throw new Error('Run this command in an interactive PowerShell terminal.');
  }

  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = '';

    const finish = (error?: Error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');

      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };

    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          finish(new Error('Admin creation cancelled.'));
          return;
        }

        if (character === '\r' || character === '\n') {
          finish();
          return;
        }

        if (character === '\u007f' || character === '\b') {
          value = Array.from(value).slice(0, -1).join('');
          stdout.write('\b \b');
          continue;
        }

        if (character >= ' ') {
          value += character;
          stdout.write('*');
        }
      }
    };

    stdin.on('data', onData);
  });
}

async function createAdmin(source: DataSource): Promise<void> {
  const name = (await ask('Admin name: ')).trim();
  const email = (await ask('Admin email: ')).trim().toLowerCase();

  if (!name || name.length > 120) {
    throw new Error('Name must contain 1 to 120 characters.');
  }

  if (!isEmail(email) || email.length > 254) {
    throw new Error('Enter a valid email address.');
  }

  const password = await askSecret('Admin password (12+ characters): ');

  if (password.length < 12 || password.length > 128) {
    throw new Error('Password must contain 12 to 128 characters.');
  }

  const repository = source.getRepository(Employee);
  const existing = await repository.findOneBy({ email });

  if (existing) {
    throw new Error('An employee with that email already exists.');
  }

  const passwordService = new PasswordService();
  const employee = repository.create({
    name,
    email,
    phone: null,
    passwordHash: await passwordService.hash(password),
    position: 'admin',
    status: 'active',
  });

  const savedEmployee = await repository.save(employee);
  stdout.write(
    `Admin created: ${savedEmployee.email} (ID ${savedEmployee.employeeId})\n`,
  );
}

async function bootstrap(): Promise<void> {
  await dataSource.initialize();

  try {
    await dataSource.runMigrations();
    await createAdmin(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

void bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Admin creation failed.';
  console.error(message);
  process.exitCode = 1;
});
