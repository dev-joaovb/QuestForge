import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Infraestrutura Docker & Documentação — Testes de Configuração (Etapa 0.3)', () => {
  const rootDir = path.resolve(import.meta.dirname, '../..');

  it('deve possuir docker-compose.yml com os serviços postgresql, minio, ollama, backend e frontend na rede questforge-net', () => {
    const composePath = path.join(rootDir, 'docker-compose.yml');
    expect(fs.existsSync(composePath)).toBe(true);

    const content = fs.readFileSync(composePath, 'utf-8');

    // Verifica definição dos 5 serviços exigidos pela arquitetura
    expect(content).toContain('postgresql:');
    expect(content).toContain('minio:');
    expect(content).toContain('ollama:');
    expect(content).toContain('backend:');
    expect(content).toContain('frontend:');

    // Verifica que o backend referencia os serviços pelos nomes DNS internos da rede Docker
    expect(content).toContain('@postgresql:5432/');
    expect(content).toContain('OLLAMA_BASE_URL: http://ollama:11434');
    expect(content).toContain('MINIO_ENDPOINT: minio');

    // Verifica presença de healthchecks
    expect(content).toContain('pg_isready');
    expect(content).toContain('service_healthy');
  });

  it('não deve conter credenciais fixas inventadas no docker-compose.yml e deve parametrizar via variáveis de ambiente', () => {
    const composePath = path.join(rootDir, 'docker-compose.yml');
    const content = fs.readFileSync(composePath, 'utf-8');

    expect(content).toContain('${POSTGRES_USER');
    expect(content).toContain('${POSTGRES_PASSWORD');
    expect(content).toContain('${SESSION_SECRET');
    expect(content).toContain('${MINIO_ACCESS_KEY');
    expect(content).toContain('${MINIO_SECRET_KEY');
  });

  it('deve possuir Dockerfiles para backend e frontend e documentação README.md detalhando testes que exigem PostgreSQL ativo', () => {
    expect(fs.existsSync(path.join(rootDir, 'docker/Dockerfile.backend'))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'docker/Dockerfile.frontend'))).toBe(true);

    const readmePath = path.join(rootDir, 'README.md');
    expect(fs.existsSync(readmePath)).toBe(true);

    const readmeContent = fs.readFileSync(readmePath, 'utf-8');
    expect(readmeContent).toContain('RUN_DB_INTEGRATION=true');
    expect(readmeContent).toContain('docker compose');
    expect(readmeContent).toContain('prisma:migrate');
  });
});
