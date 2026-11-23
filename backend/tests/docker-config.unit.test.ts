import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Infraestrutura Docker & Documentação — Testes de Configuração', () => {
  const rootDir = path.resolve(import.meta.dirname, '../..');
  const composePath = path.join(rootDir, 'docker-compose.yml');

  it('deve configurar os serviços e a rede externa do PostgreSQL compartilhado', () => {
    expect(fs.existsSync(composePath)).toBe(true);

    const content = fs.readFileSync(composePath, 'utf-8');

    for (const service of ['minio', 'ollama', 'backend', 'frontend']) {
      expect(content).toMatch(new RegExp(`^  ${service}:`, 'm'));
    }

    expect(content).toMatch(/^  questforge-net:/m);
    expect(content).toMatch(/^  postgres-shared-net:/m);
    expect(content).toContain('external: true');
    expect(content).toContain('POSTGRES_DOCKER_NETWORK');
    expect(content).toContain('DATABASE_URL: ${DATABASE_URL_DOCKER:');
    expect(content).toContain('OLLAMA_BASE_URL: http://ollama:11434');
    expect(content).toContain('MINIO_ENDPOINT: minio');
    expect(content).toContain('service_healthy');
    expect(content).toContain('healthcheck:');
  });

  it('deve parametrizar credenciais e segredos sem valores fixos', () => {
    const content = fs.readFileSync(composePath, 'utf-8');

    expect(content).toContain('${DATABASE_URL_DOCKER:');
    expect(content).toContain('${SESSION_SECRET:');
    expect(content).toContain('${MINIO_ACCESS_KEY');
    expect(content).toContain('${MINIO_SECRET_KEY');

    expect(content).not.toMatch(/^\s*POSTGRES_PASSWORD:\s*[^$\s]/m);
    expect(content).not.toMatch(/^\s*SESSION_SECRET:\s*[^$\s]/m);
    expect(content).not.toMatch(/^\s*MINIO_ROOT_PASSWORD:\s*[^$\s]/m);
  });

  it('deve possuir Dockerfiles para backend e frontend', () => {
    expect(fs.existsSync(path.join(rootDir, 'docker/Dockerfile.backend'))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'docker/Dockerfile.frontend'))).toBe(true);
  });
});
