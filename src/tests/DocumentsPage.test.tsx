import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App.tsx';
import type { PdfDocumentDTO } from '../types/index.ts';

describe('Interface de Upload e Gerenciamento de PDFs (src/tests/DocumentsPage.test.tsx)', () => {
  const originalFetch = globalThis.fetch;

  const mockAuthenticatedUser = {
    user: {
      id: 'user-auth-1',
      name: 'Helena Martins',
      email: 'helena@questforge.dev',
      avatarUrl: null,
      createdAt: '2026-10-09T10:00:00.000Z',
      updatedAt: '2026-10-09T10:00:00.000Z',
    },
    session: {
      id: 'session-auth-1',
      userId: 'user-auth-1',
      expiresAt: '2026-10-16T10:00:00.000Z',
      createdAt: '2026-10-09T10:00:00.000Z',
      lastUsedAt: '2026-10-09T10:00:00.000Z',
    },
  };

  const sampleCompletedDoc: PdfDocumentDTO = {
    id: 'doc-101',
    userId: 'user-auth-1',
    examId: null,
    originalName: 'prova-cebraspe-2025.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 524288,
    checksumSha256: 'a3f5c8d9e1b20485769102938475610293847561029384756102938475610293',
    status: 'COMPLETED',
    pageCount: 14,
    extractedCharCount: 28450,
    requiresOcr: false,
    errorMessage: null,
    processedAt: '2026-10-09T11:00:05.000Z',
    createdAt: '2026-10-09T11:00:00.000Z',
    updatedAt: '2026-10-09T11:00:05.000Z',
  };

  const sampleNeedsOcrDoc: PdfDocumentDTO = {
    id: 'doc-102',
    userId: 'user-auth-1',
    examId: null,
    originalName: 'apostila-escaneada.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2097152,
    checksumSha256: 'b4e6d7c8f9a10293847561029384756102938475610293847561029384756102',
    status: 'NEEDS_OCR',
    pageCount: 8,
    extractedCharCount: 0,
    requiresOcr: true,
    errorMessage: null,
    processedAt: '2026-10-09T11:10:02.000Z',
    createdAt: '2026-10-09T11:10:00.000Z',
    updatedAt: '2026-10-09T11:10:02.000Z',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('deve bloquear acesso não autenticado a /documents e exibir opções de login e cadastro', async () => {
    const requestedUrls: string[] = [];

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes('/api/auth/me')) {
        return {
          status: 401,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Unauthorized', message: 'Não autenticado.' }),
        } as Response;
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/documents']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', {
        name: /Autenticação necessária para gerenciar Documentos PDF/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ir para o Login/i })).toHaveAttribute(
      'href',
      '/login'
    );
    expect(requestedUrls.some((u) => u.includes('/api/documents'))).toBe(false);
  });

  it('deve exibir erro HTTP 503 sem mascarar falha como lista vazia e recuperar ao clicar em "Tentar novamente"', async () => {
    let shouldFail = true;

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }

      if (url.includes('/api/documents')) {
        if (shouldFail) {
          return {
            status: 503,
            ok: false,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: 'ServiceUnavailable',
              message:
                'Não foi possível processar a operação de documentos PDF no momento.',
            }),
          } as Response;
        }

        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            items: [],
            total: 0,
            currentPage: 1,
            totalPages: 1,
            limit: 10,
          }),
        } as Response;
      }

      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/documents']}>
        <AppRoutes />
      </MemoryRouter>
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      /Não foi possível processar a operação de documentos PDF no momento/i
    );
    expect(
      screen.queryByText(/Nenhum documento PDF encontrado/i)
    ).not.toBeInTheDocument();

    shouldFail = false;
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));

    expect(
      await screen.findByRole('heading', { name: /Nenhum documento PDF encontrado/i })
    ).toBeInTheDocument();
  });

  it('deve listar documentos PDF paginados, distinguir COMPLETED de NEEDS_OCR e filtrar por status', async () => {
    const requestedDocUrls: string[] = [];

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }

      if (url.includes('/api/documents')) {
        requestedDocUrls.push(url);
        const isNeedsOcrFilter = url.includes('status=NEEDS_OCR');
        const isPage2 = url.includes('page=2');

        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            items: isNeedsOcrFilter
              ? [sampleNeedsOcrDoc]
              : isPage2
                ? [sampleNeedsOcrDoc]
                : [sampleCompletedDoc, sampleNeedsOcrDoc],
            total: isNeedsOcrFilter ? 1 : 12,
            currentPage: isPage2 ? 2 : 1,
            totalPages: isNeedsOcrFilter ? 1 : 2,
            limit: 10,
          }),
        } as Response;
      }

      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/documents']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('prova-cebraspe-2025.pdf')).toBeInTheDocument();
    expect(screen.getByText('apostila-escaneada.pdf')).toBeInTheDocument();
    expect(
      screen.getByText(
        /PDF escaneado ou com densidade de texto digital insuficiente/i
      )
    ).toBeInTheDocument();
    expect(requestedDocUrls).toHaveLength(1);

    // Selecionar filtro no select sem submeter ainda não dispara nova requisição
    fireEvent.change(screen.getByLabelText(/Filtrar por status de processamento/i), {
      target: { value: 'NEEDS_OCR' },
    });
    expect(requestedDocUrls).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Aplicar filtro/i }));

    await waitFor(() => {
      expect(requestedDocUrls).toHaveLength(2);
    });
    expect(requestedDocUrls[1]).toContain('status=NEEDS_OCR');
    expect(requestedDocUrls[1]).toContain('page=1');

    // Limpa o filtro e navega para a página 2
    fireEvent.click(screen.getByRole('button', { name: /Limpar filtro/i }));
    await waitFor(() => {
      expect(requestedDocUrls).toHaveLength(3);
    });

    fireEvent.click(screen.getByRole('button', { name: /Próxima página/i }));
    await waitFor(() => {
      expect(requestedDocUrls).toHaveLength(4);
    });
    expect(requestedDocUrls[3]).toContain('page=2');
  });

  it('deve validar arquivo no cliente (extensão, MIME e tamanho <= 20 MB) antes do upload e enviar POST /api/documents com CSRF quando válido', async () => {
    let uploadCallCount = 0;

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }

      if (url === '/api/documents' && init?.method === 'POST') {
        uploadCallCount += 1;
        const headers = init.headers as Record<string, string>;
        expect(headers['X-Requested-With']).toBe('QuestForge-Client');
        expect(init.credentials).toBe('include');
        expect(init.body).toBeInstanceOf(FormData);

        return {
          status: 201,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            document: sampleCompletedDoc,
          }),
        } as Response;
      }

      if (url.includes('/api/documents')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            items: uploadCallCount > 0 ? [sampleCompletedDoc] : [],
            total: uploadCallCount > 0 ? 1 : 0,
            currentPage: 1,
            totalPages: 1,
            limit: 10,
          }),
        } as Response;
      }

      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/documents']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', { name: /Enviar Novo Documento PDF/i })
    ).toBeInTheDocument();

    // 1. Submeter sem selecionar arquivo -> erro no cliente
    fireEvent.click(screen.getByRole('button', { name: /Enviar PDF/i }));
    expect(
      await screen.findByText(/Selecione um arquivo PDF antes de iniciar o envio/i)
    ).toBeInTheDocument();
    expect(uploadCallCount).toBe(0);

    const fileInput = screen.getByLabelText(/Arquivo PDF \(prova ou apostila\)/i);

    // 2. Selecionar arquivo com extensão inválida (.txt) -> erro imediato no cliente
    const invalidExtFile = new File(['conteudo texto'], 'notas.txt', {
      type: 'text/plain',
    });
    fireEvent.change(fileInput, { target: { files: [invalidExtFile] } });
    expect(
      await screen.findByText(
        /Formato inválido: selecione exclusivamente um arquivo com extensão \.pdf/i
      )
    ).toBeInTheDocument();

    // 3. Selecionar arquivo PDF vazio (0 bytes) -> erro no cliente
    const emptyPdfFile = new File([], 'vazio.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(fileInput, { target: { files: [emptyPdfFile] } });
    expect(
      await screen.findByText(/O arquivo PDF selecionado está vazio \(0 bytes\)/i)
    ).toBeInTheDocument();

    // 4. Selecionar arquivo PDF acima de 20 MB -> erro no cliente sem enviar requisição
    const oversizedPdfFile = new File(['%PDF-1.7'], 'gigante.pdf', {
      type: 'application/pdf',
    });
    Object.defineProperty(oversizedPdfFile, 'size', {
      value: 21 * 1024 * 1024,
    });
    fireEvent.change(fileInput, { target: { files: [oversizedPdfFile] } });
    expect(
      await screen.findByText(
        /O arquivo PDF selecionado excede o tamanho máximo permitido de 20\.0 MB/i
      )
    ).toBeInTheDocument();
    expect(uploadCallCount).toBe(0);

    // 5. Selecionar arquivo PDF válido e submeter -> envia POST /api/documents e mostra resultado
    const validPdfFile = new File(
      ['%PDF-1.7\nConteudo de prova\n%%EOF'],
      'prova-cebraspe-2025.pdf',
      { type: 'application/pdf' }
    );
    fireEvent.change(fileInput, { target: { files: [validPdfFile] } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar PDF/i }));

    expect(
      await screen.findByText(/Upload concluído para "prova-cebraspe-2025\.pdf"/i)
    ).toBeInTheDocument();
    expect(uploadCallCount).toBe(1);
    expect(
      screen.getByText(sampleCompletedDoc.checksumSha256)
    ).toBeInTheDocument();
  });

  it('deve consultar detalhes (GET /api/documents/:id), exigir confirmação antes de excluir (DELETE /api/documents/:id) e tratar expiração de sessão (401)', async () => {
    let docsList = [sampleCompletedDoc];
    let sessionExpired = false;

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        if (sessionExpired) {
          return {
            status: 401,
            ok: false,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ error: 'Unauthorized', message: 'Sessão expirada.' }),
          } as Response;
        }
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }

      if (url.includes('/api/documents/doc-101') && (!init?.method || init.method === 'GET')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            document: sampleCompletedDoc,
          }),
        } as Response;
      }

      if (url.includes('/api/documents/doc-101') && init?.method === 'DELETE') {
        const headers = init.headers as Record<string, string>;
        expect(headers['X-Requested-With']).toBe('QuestForge-Client');
        docsList = [];
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            message: 'Documento PDF excluído com sucesso.',
          }),
        } as Response;
      }

      if (url.includes('/api/documents')) {
        if (sessionExpired) {
          return {
            status: 401,
            ok: false,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ error: 'Unauthorized', message: 'Sessão expirada.' }),
          } as Response;
        }
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            items: docsList,
            total: docsList.length,
            currentPage: 1,
            totalPages: 1,
            limit: 10,
          }),
        } as Response;
      }

      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/documents']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('prova-cebraspe-2025.pdf')).toBeInTheDocument();

    // 1. Clica em "Ver detalhes" -> consulta GET /api/documents/doc-101 e exibe painel
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes/i }));
    expect(
      await screen.findByText(sampleCompletedDoc.checksumSha256)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Não — Texto digital extraído nativamente/i)
    ).toBeInTheDocument();

    // 2. Clica em "Excluir" -> solicita confirmação inline
    fireEvent.click(screen.getByRole('button', { name: /^Excluir$/i }));
    expect(screen.getByText(/Confirmar exclusão permanente\?/i)).toBeInTheDocument();

    // 3. Confirma a exclusão -> chama DELETE /api/documents/doc-101, fecha painel de detalhes e atualiza lista
    fireEvent.click(screen.getByRole('button', { name: /Confirmar exclusão/i }));
    expect(
      await screen.findByText(/Documento PDF excluído com sucesso/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(sampleCompletedDoc.checksumSha256)
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Nenhum documento PDF encontrado/i })
    ).toBeInTheDocument();

    // 4. Simula expiração de sessão ao atualizar lista -> revalida /api/auth/me e mostra tela de acesso restrito
    sessionExpired = true;
    fireEvent.click(screen.getByRole('button', { name: /Atualizar lista/i }));
    expect(
      await screen.findByRole('heading', {
        name: /Autenticação necessária para gerenciar Documentos PDF/i,
      })
    ).toBeInTheDocument();
  });

  it('deve abrir a confirmação de exclusão, fechar ao clicar em "Cancelar", não chamar DELETE e manter o documento na listagem', async () => {
    let deleteCallCount = 0;

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }

      if (url.includes('/api/documents/') && init?.method === 'DELETE') {
        deleteCallCount += 1;
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ message: 'Documento PDF excluído com sucesso.' }),
        } as Response;
      }

      if (url.includes('/api/documents')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            items: [sampleCompletedDoc],
            total: 1,
            currentPage: 1,
            totalPages: 1,
            limit: 10,
          }),
        } as Response;
      }

      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/documents']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('prova-cebraspe-2025.pdf')).toBeInTheDocument();

    // 1. Abre a confirmação de exclusão
    fireEvent.click(screen.getByRole('button', { name: /^Excluir$/i }));
    expect(screen.getByText(/Confirmar exclusão permanente\?/i)).toBeInTheDocument();

    // 2. Clica em "Cancelar"
    fireEvent.click(screen.getByRole('button', { name: /^Cancelar$/i }));

    // 3. Confirma que a confirmação foi fechada, DELETE não foi chamado e o documento permanece na lista
    expect(
      screen.queryByText(/Confirmar exclusão permanente\?/i)
    ).not.toBeInTheDocument();
    expect(deleteCallCount).toBe(0);
    expect(screen.getByText('prova-cebraspe-2025.pdf')).toBeInTheDocument();
  });

  it('deve tratar falha HTTP 413 ou 503 em POST /api/documents exibindo alerta acessível, sem mensagem de sucesso e sem simular inclusão na listagem', async () => {
    let simulatedStatus: 413 | 503 = 413;

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockAuthenticatedUser,
        } as Response;
      }

      if (url === '/api/documents' && init?.method === 'POST') {
        if (simulatedStatus === 413) {
          return {
            status: 413,
            ok: false,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: 'PDF_TOO_LARGE',
              message: 'O arquivo PDF excede o tamanho máximo permitido de 20.0 MB.',
            }),
          } as Response;
        }

        return {
          status: 503,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            error: 'STORAGE_UNAVAILABLE',
            message:
              'Serviço de armazenamento privado temporariamente indisponível para upload.',
          }),
        } as Response;
      }

      if (url.includes('/api/documents')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            items: [],
            total: 0,
            currentPage: 1,
            totalPages: 1,
            limit: 10,
          }),
        } as Response;
      }

      throw new Error(`URL inesperada: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/documents']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', { name: /Nenhum documento PDF encontrado/i })
    ).toBeInTheDocument();

    const fileInput = screen.getByLabelText(/Arquivo PDF \(prova ou apostila\)/i);
    const validClientFile = new File(
      ['%PDF-1.7\nConteudo de prova\n%%EOF'],
      'simulado-rejeitado.pdf',
      { type: 'application/pdf' }
    );

    // 1. Falha HTTP 413 retornada pelo servidor
    fireEvent.change(fileInput, { target: { files: [validClientFile] } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar PDF/i }));

    const alert413 = await screen.findByRole('alert');
    expect(alert413).toHaveTextContent(
      /O arquivo PDF excede o tamanho máximo permitido de 20\.0 MB/i
    );
    expect(screen.queryByText(/Upload concluído/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Nenhum documento PDF encontrado/i })
    ).toBeInTheDocument();

    // 2. Falha HTTP 503 retornada pelo servidor
    simulatedStatus = 503;
    fireEvent.click(screen.getByRole('button', { name: /Enviar PDF/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Serviço de armazenamento privado temporariamente indisponível para upload/i
      );
    });
    expect(screen.queryByText(/Upload concluído/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Nenhum documento PDF encontrado/i })
    ).toBeInTheDocument();
  });
});
