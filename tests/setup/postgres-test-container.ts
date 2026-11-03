import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export async function startTestPostgres(): Promise<StartedPostgreSqlContainer> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();

  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
    stdio: 'inherit',
  });

  return container;
}
