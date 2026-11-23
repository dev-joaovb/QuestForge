import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.ts';

describe('QuestForge — Isolamento HTTP da API', () => {
  it('não deve disponibilizar a Landing Page na rota raiz', async () => {
    const response = await request(createApp()).get('/');

    expect(response.status).toBe(404);
    expect(response.text).not.toContain('/@vite/client');
    expect(response.text).not.toContain('/src/main.tsx');
    expect(response.text).not.toContain('<div id="root"></div>');
  });

  it('não deve disponibilizar o cliente de desenvolvimento do Vite', async () => {
    const response = await request(createApp()).get('/@vite/client');

    expect(response.status).toBe(404);
    expect(response.text).not.toContain('injectIntoGlobalHook');
  });

  it('deve preservar o endpoint de liveness da API', async () => {
    const response = await request(createApp()).get('/api/live');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('alive');
  });
});
