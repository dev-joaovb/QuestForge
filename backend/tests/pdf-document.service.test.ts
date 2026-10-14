import { describe, it, expect, beforeEach } from 'vitest';
import type { PdfDocument } from '@prisma/client';
import {
  validatePdfFileInput,
  sanitizePdfOriginalName,
} from '../src/validators/pdf-document.validator.ts';
import {
  buildPrivatePdfObjectKey,
  MinioObjectStorageService,
  type IObjectStorageService,
  type PutPrivateObjectInput,
  type StoredPrivateObjectInfo,
} from '../src/services/storage.service.ts';
import {
  PdfJsTextExtractor,
  type PdfDocumentProxyLike,
  type PdfLoadingTaskLike,
  type PdfPageProxyLike,
} from '../src/utils/pdf-extractor.ts';
import type {
  CompletePdfExtractionInput,
  CreatePdfDocumentRecordInput,
  IPdfDocumentRepository,
} from '../src/repositories/pdf-document.repository.ts';
import { PdfDocumentService } from '../src/services/pdf-document.service.ts';
import { sanitizeLogMeta } from '../src/utils/logger.ts';

/**
 * Constrói um buffer PDF 1.4 binário real e válido (com cabeçalho %PDF-1.4, objetos, xref e %%EOF)
 * para exercitar tanto o validador de magic bytes quanto o extrator real `PdfJsTextExtractor`.
 */
export function buildRealPdfBuffer(options: { pageTexts: string[] }): Buffer {
  const objects: string[] = [];
  const pageCount = options.pageTexts.length;

  // Obj 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Obj 2: Pages
  const kidsRefs = options.pageTexts.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${kidsRefs}] /Count ${pageCount} >>\nendobj\n`
  );

  // Obj 3: Font
  objects.push(
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  );

  // Para cada página, cria Page obj (4 + i*2) e Content stream obj (5 + i*2)
  options.pageTexts.forEach((text, i) => {
    const pageObjNum = 4 + i * 2;
    const contentObjNum = 5 + i * 2;
    const escapedText = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const streamContent =
      escapedText.length > 0
        ? `BT /F1 12 Tf 50 700 Td (${escapedText}) Tj ET`
        : '';

    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'latin1')} >>\nstream\n${streamContent}\nendstream\nendobj\n`
    );
  });

  let pdfContent = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdfContent, 'latin1'));
    pdfContent += obj;
  }

  const xrefStart = Buffer.byteLength(pdfContent, 'latin1');
  const totalEntries = objects.length + 1;
  pdfContent += `xref\n0 ${totalEntries}\n0000000000 65535 f \n`;

  for (let idx = 1; idx < offsets.length; idx++) {
    const padded = String(offsets[idx]).padStart(10, '0');
    pdfContent += `${padded} 00000 n \n`;
  }

  pdfContent += `trailer\n<< /Size ${totalEntries} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdfContent, 'latin1');
}

class InMemoryObjectStorageService implements IObjectStorageService {
  public objects = new Map<string, Buffer>();
  public simulateStorageFailure = false;

  getDefaultBucket(): string {
    return 'questforge-documents';
  }

  async putPrivateObject(input: PutPrivateObjectInput): Promise<StoredPrivateObjectInfo> {
    if (this.simulateStorageFailure) {
      throw new Error('MinIO connection refused');
    }
    const bucket = input.bucket ?? this.getDefaultBucket();
    this.objects.set(`${bucket}:${input.objectKey}`, Buffer.from(input.buffer));
    return {
      bucket,
      objectKey: input.objectKey,
      etag: 'etag-test-1',
    };
  }

  async getPrivateObjectBuffer(objectKey: string, bucket?: string): Promise<Buffer> {
    if (this.simulateStorageFailure) {
      throw new Error('MinIO connection refused');
    }
    const targetBucket = bucket ?? this.getDefaultBucket();
    const found = this.objects.get(`${targetBucket}:${objectKey}`);
    if (!found) {
      throw new Error('Object not found');
    }
    return found;
  }

  async deletePrivateObject(objectKey: string, bucket?: string): Promise<void> {
    if (this.simulateStorageFailure) {
      throw new Error('MinIO connection refused');
    }
    const targetBucket = bucket ?? this.getDefaultBucket();
    // Idempotente como o S3/MinIO real
    this.objects.delete(`${targetBucket}:${objectKey}`);
  }

  async checkStorageHealth() {
    return {
      status: (this.simulateStorageFailure ? 'down' : 'up') as 'up' | 'down',
      bucket: this.getDefaultBucket(),
      message: 'In-memory test storage',
    };
  }
}

class InMemoryPdfDocumentRepository implements IPdfDocumentRepository {
  public records = new Map<string, PdfDocument>();
  public simulateDbFailureOnCreate = false;
  public simulateDbFailureOnDelete = false;

  async create(data: CreatePdfDocumentRecordInput): Promise<PdfDocument> {
    if (this.simulateDbFailureOnCreate) {
      throw new Error('PostgreSQL connection terminated');
    }
    const now = new Date();
    const id = data.id ?? `doc-${this.records.size + 1}`;
    const doc: PdfDocument = {
      id,
      userId: data.userId,
      examId: data.examId ?? null,
      originalName: data.originalName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      storageBucket: data.storageBucket,
      objectKey: data.objectKey,
      checksumSha256: data.checksumSha256,
      status: data.status ?? 'UPLOADED',
      pageCount: null,
      extractedText: null,
      extractedCharCount: null,
      requiresOcr: false,
      errorMessage: null,
      processedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(id, doc);
    return doc;
  }

  async findById(id: string): Promise<PdfDocument | null> {
    return this.records.get(id) ?? null;
  }

  async findManyByUser(userId: string): Promise<PdfDocument[]> {
    return Array.from(this.records.values()).filter((r) => r.userId === userId);
  }

  async markProcessing(id: string): Promise<PdfDocument> {
    const existing = this.records.get(id)!;
    const updated: PdfDocument = {
      ...existing,
      status: 'PROCESSING',
      errorMessage: null,
      updatedAt: new Date(),
    };
    this.records.set(id, updated);
    return updated;
  }

  async tryAcquireOcrProcessing(
    id: string,
    allowedStatuses: readonly PdfDocument['status'][] = ['NEEDS_OCR', 'FAILED']
  ): Promise<boolean> {
    const existing = this.records.get(id);
    if (!existing || !allowedStatuses.includes(existing.status)) {
      return false;
    }
    this.records.set(id, {
      ...existing,
      status: 'PROCESSING',
      errorMessage: null,
      updatedAt: new Date(),
    });
    return true;
  }

  async markExtractionCompleted(
    id: string,
    data: CompletePdfExtractionInput
  ): Promise<PdfDocument> {
    const existing = this.records.get(id)!;
    const updated: PdfDocument = {
      ...existing,
      status: data.status,
      pageCount: data.pageCount,
      extractedText: data.extractedText,
      extractedCharCount: data.extractedCharCount,
      requiresOcr: data.requiresOcr,
      errorMessage: null,
      processedAt: data.processedAt,
      updatedAt: new Date(),
    };
    this.records.set(id, updated);
    return updated;
  }

  async markFailed(
    id: string,
    sanitizedErrorMessage: string,
    processedAt: Date
  ): Promise<PdfDocument> {
    const existing = this.records.get(id)!;
    const updated: PdfDocument = {
      ...existing,
      status: 'FAILED',
      errorMessage: sanitizedErrorMessage,
      processedAt,
      updatedAt: new Date(),
    };
    this.records.set(id, updated);
    return updated;
  }

  async deleteById(id: string): Promise<void> {
    if (this.simulateDbFailureOnDelete) {
      throw new Error('PostgreSQL delete failed');
    }
    this.records.delete(id);
  }
}

describe('Etapa 3.1 — Validação, Armazenamento Privado e Extração Básica de PDF (backend/tests/pdf-document.service.test.ts)', () => {
  const USER_A = 'user-owner-a';
  const USER_B = 'user-other-b';

  let storage: InMemoryObjectStorageService;
  let repo: InMemoryPdfDocumentRepository;
  let extractor: PdfJsTextExtractor;
  let service: PdfDocumentService;

  beforeEach(() => {
    storage = new InMemoryObjectStorageService();
    repo = new InMemoryPdfDocumentRepository();
    extractor = new PdfJsTextExtractor();
    service = new PdfDocumentService({
      pdfDocumentRepository: repo,
      storageService: storage,
      pdfTextExtractor: extractor,
      maxFileSizeBytes: 5 * 1024 * 1024, // 5 MB para testes
      maxPages: 5,
      extractionTimeoutMs: 10000,
    });
  });

  it('deve validar magic bytes (%PDF e %%EOF), tamanho máximo, MIME e sanitizar o nome do arquivo contra Path Traversal', () => {
    const validBuffer = buildRealPdfBuffer({
      pageTexts: ['Questao 1: Direito Constitucional e Controle de Constitucionalidade.'],
    });

    // 1. Sanitização de Path Traversal no nome original
    expect(sanitizePdfOriginalName('../../etc/passwd/prova_cebraspe_2025.pdf')).toBe(
      'prova_cebraspe_2025.pdf'
    );

    // 2. Rejeita arquivo HTML renomeado para .pdf com MIME application/pdf falsificado
    const fakePdfBuffer = Buffer.from('<html><body>Não sou um PDF</body></html>', 'utf-8');
    expect(() =>
      validatePdfFileInput({
        originalName: 'falso.pdf',
        mimeType: 'application/pdf',
        sizeBytes: fakePdfBuffer.byteLength,
        buffer: fakePdfBuffer,
      })
    ).toThrow(/cabeçalho %PDF válido/i);

    // 3. Rejeita PDF truncado sem marcador %%EOF
    const truncatedBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n', 'latin1');
    expect(() =>
      validatePdfFileInput({
        originalName: 'truncado.pdf',
        mimeType: 'application/pdf',
        sizeBytes: truncatedBuffer.byteLength,
        buffer: truncatedBuffer,
      })
    ).toThrow(/marcador %%EOF ausente/i);

    // 4. Rejeita arquivo que excede maxFileSizeBytes
    expect(() =>
      validatePdfFileInput(
        {
          originalName: 'grande.pdf',
          mimeType: 'application/pdf',
          sizeBytes: validBuffer.byteLength,
          buffer: validBuffer,
        },
        { maxFileSizeBytes: 50 }
      )
    ).toThrow(/excede o tamanho máximo permitido/i);

    // 5. Rejeita tentativa de Path Traversal na geração da objectKey privada do MinIO
    expect(() => buildPrivatePdfObjectKey('../hacker', 'doc-1')).toThrow(
      /Identificadores inválidos/i
    );
  });

  it('deve armazenar PDF privado, persistir extractedText no banco e omitir extractedText do DTO marcando COMPLETED e requiresOcr=false', async () => {
    const digitalPdf = buildRealPdfBuffer({
      pageTexts: [
        'Questao 01 - Assinale a alternativa correta sobre arvores binarias de busca balanceadas.',
        'Questao 02 - No modelo relacional, chaves estrangeiras garantem a integridade referencial.',
      ],
    });

    const result = await service.uploadAndProcessPdf(USER_A, {
      originalName: '../provas/caderno_prova_ti_2025.pdf',
      mimeType: 'application/pdf',
      sizeBytes: digitalPdf.byteLength,
      buffer: digitalPdf,
    });

    expect(result.userId).toBe(USER_A);
    expect(result.originalName).toBe('caderno_prova_ti_2025.pdf');
    expect(result.status).toBe('COMPLETED');
    expect(result.requiresOcr).toBe(false);
    expect(result.pageCount).toBe(2);
    expect(result.extractedCharCount).toBeGreaterThan(50);
    expect(result.errorMessage).toBeNull();
    // O DTO padrão de documento nunca expõe extractedText nem objectKey
    expect('extractedText' in result).toBe(false);
    expect('objectKey' in result).toBe(false);

    // O texto extraído permanece persistido no repositório/banco de dados para as próximas etapas
    const persisted = await repo.findById(result.id);
    expect(persisted?.extractedText).toContain('Questao 01');
    expect(persisted?.extractedText).toContain('Questao 02');

    // Confirma que o objeto foi armazenado no bucket privado com chave isolada por usuário
    expect(storage.objects.size).toBe(1);
    const storedKey = Array.from(storage.objects.keys())[0];
    expect(storedKey).toContain(`questforge-documents:users/${USER_A}/pdf/`);
  });

  it('deve identificar quando não há texto digital extraível (ex.: PDF escaneado) e deixar o documento em NEEDS_OCR (requiresOcr=true)', async () => {
    const scannedLikePdf = buildRealPdfBuffer({
      pageTexts: ['', ''], // 2 páginas válidas sem camada textual
    });

    const result = await service.uploadAndProcessPdf(USER_A, {
      originalName: 'prova_digitalizada_scanner.pdf',
      mimeType: 'application/pdf',
      sizeBytes: scannedLikePdf.byteLength,
      buffer: scannedLikePdf,
    });

    expect(result.status).toBe('NEEDS_OCR');
    expect(result.requiresOcr).toBe(true);
    expect(result.pageCount).toBe(2);
    expect(result.extractedCharCount).toBe(0);
    expect(result.errorMessage).toBeNull();
    expect('extractedText' in result).toBe(false);

    const persisted = await repo.findById(result.id);
    expect(persisted?.extractedText).toBeNull();
  });

  it('deve marcar o documento como FAILED com mensagem sanitizada quando exceder o limite de páginas configurado', async () => {
    // Configurado no beforeEach com maxPages: 5; enviamos um PDF com 6 páginas
    const sixPagesPdf = buildRealPdfBuffer({
      pageTexts: [
        'Pagina 1 com texto suficiente.',
        'Pagina 2 com texto suficiente.',
        'Pagina 3 com texto suficiente.',
        'Pagina 4 com texto suficiente.',
        'Pagina 5 com texto suficiente.',
        'Pagina 6 excedente.',
      ],
    });

    const result = await service.uploadAndProcessPdf(USER_A, {
      originalName: 'apostila_longa.pdf',
      mimeType: 'application/pdf',
      sizeBytes: sixPagesPdf.byteLength,
      buffer: sixPagesPdf,
    });

    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toContain('excedendo o limite máximo de 5 páginas');
    expect('extractedText' in result).toBe(false);

    const persisted = await repo.findById(result.id);
    expect(persisted?.extractedText).toBeNull();
  });

  it('deve garantir isolamento estrito entre usuários ao listar, consultar e excluir documentos PDF', async () => {
    const pdfBuffer = buildRealPdfBuffer({
      pageTexts: ['Documento privado exclusivo do Usuario A sobre Direito Administrativo.'],
    });

    const createdByA = await service.uploadAndProcessPdf(USER_A, {
      originalName: 'simulado_privado_a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: pdfBuffer.byteLength,
      buffer: pdfBuffer,
    });

    // Usuário B não vê os documentos do Usuário A na listagem
    const listB = await service.listUserDocuments(USER_B);
    expect(listB).toHaveLength(0);

    // Usuário B recebe 403 ao tentar consultar por ID
    await expect(
      service.getUserDocumentById(USER_B, createdByA.id)
    ).rejects.toMatchObject({
      code: 'DOCUMENT_FORBIDDEN',
      statusCode: 403,
    });

    // Usuário B recebe 403 ao tentar excluir documento do Usuário A
    await expect(
      service.deleteUserDocument(USER_B, createdByA.id)
    ).rejects.toMatchObject({
      code: 'DOCUMENT_FORBIDDEN',
      statusCode: 403,
    });

    // Usuário A consegue excluir seu próprio documento, removendo do banco e do MinIO
    await service.deleteUserDocument(USER_A, createdByA.id);
    expect(storage.objects.size).toBe(0);
    expect(await service.listUserDocuments(USER_A)).toHaveLength(0);
  });

  it('deve tratar falhas de MinIO e PostgreSQL honestamente, limpar objeto órfão se o banco falhar e nunca vazar texto/segredos nos logs', async () => {
    const pdfBuffer = buildRealPdfBuffer({
      pageTexts: ['Texto de teste para verificar falha de infraestrutura.'],
    });

    // 1. Se o MinIO não tiver credenciais reais configuradas, MinioObjectStorageService falha com 503 STORAGE_UNAVAILABLE
    const unconfiguredMinio = new MinioObjectStorageService({
      accessKey: 'SEU_USUARIO_MINIO',
      secretKey: 'SUA_SENHA_MINIO',
    });
    await expect(
      unconfiguredMinio.putPrivateObject({
        objectKey: 'users/user-1/pdf/doc-1.pdf',
        buffer: pdfBuffer,
        mimeType: 'application/pdf',
        sizeBytes: pdfBuffer.byteLength,
      })
    ).rejects.toMatchObject({
      code: 'STORAGE_UNAVAILABLE',
      statusCode: 503,
    });

    // 2. Se o PostgreSQL falhar ao criar o registro após o upload no MinIO, o objeto órfão no MinIO é removido
    repo.simulateDbFailureOnCreate = true;
    await expect(
      service.uploadAndProcessPdf(USER_A, {
        originalName: 'teste_rollback_minio.pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdfBuffer.byteLength,
        buffer: pdfBuffer,
      })
    ).rejects.toThrow(/PostgreSQL connection terminated/i);

    expect(storage.objects.size).toBe(0);

    // 3. Higienização de logs: nunca expõe texto extraído, buffers ou chaves do MinIO
    const sanitized = sanitizeLogMeta({
      documentId: 'doc-123',
      extractedText: 'Conteúdo integral confidencial da prova',
      fileBuffer: 'bytes',
      minio_secret_key: 'segredo-super-sensivel',
    });
    expect(sanitized).toEqual({
      documentId: 'doc-123',
      extractedText: '[REDACTED]',
      fileBuffer: '[REDACTED]',
      minio_secret_key: '[REDACTED]',
    });
  });

  it('deve interromper efetivamente a extração em caso de timeout, impedindo leitura de páginas seguintes e destruindo documento/worker antes de atualizar o banco', async () => {
    const requestedPages: number[] = [];
    const cleanedPages: number[] = [];
    let docDestroyedCount = 0;
    let taskDestroyedCount = 0;
    let statusUpdatedBeforeDestroy = false;

    const slowLoader = async (): Promise<PdfLoadingTaskLike> => {
      const docProxy: PdfDocumentProxyLike = {
        numPages: 3,
        async getPage(pageNumber: number): Promise<PdfPageProxyLike> {
          requestedPages.push(pageNumber);
          return {
            async getTextContent() {
              if (pageNumber === 2) {
                // Simula página 2 travada por 500 ms enquanto o timeout é de 40 ms
                await new Promise((resolve) => setTimeout(resolve, 500));
              }
              return {
                items: [{ str: `Conteúdo da página ${pageNumber} com texto longo.` }],
              };
            },
            cleanup() {
              cleanedPages.push(pageNumber);
            },
          };
        },
        async destroy() {
          docDestroyedCount += 1;
        },
      };

      return {
        promise: Promise.resolve(docProxy),
        async destroy() {
          taskDestroyedCount += 1;
        },
      };
    };

    const originalMarkFailed = repo.markFailed.bind(repo);
    repo.markFailed = async (id, msg, date) => {
      // Verifica se os recursos do PDF.js já foram destruídos ANTES de atualizar o banco
      if (taskDestroyedCount === 0 || docDestroyedCount === 0) {
        statusUpdatedBeforeDestroy = true;
      }
      return originalMarkFailed(id, msg, date);
    };

    const timedService = new PdfDocumentService({
      pdfDocumentRepository: repo,
      storageService: storage,
      pdfTextExtractor: new PdfJsTextExtractor(slowLoader),
      extractionTimeoutMs: 40,
    });

    const pdfBuffer = buildRealPdfBuffer({
      pageTexts: ['Pagina 1', 'Pagina 2', 'Pagina 3'],
    });

    const result = await timedService.uploadAndProcessPdf(USER_A, {
      originalName: 'prova_lenta_timeout.pdf',
      mimeType: 'application/pdf',
      sizeBytes: pdfBuffer.byteLength,
      buffer: pdfBuffer,
    });

    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toContain('excedeu o tempo limite de 40 ms');
    // Página 3 jamais deve ser requisitada pois o processamento foi abortado na página 2
    expect(requestedPages).toEqual([1, 2]);
    expect(cleanedPages).toContain(1);
    expect(cleanedPages).toContain(2);
    expect(docDestroyedCount).toBe(1);
    expect(taskDestroyedCount).toBe(1);
    expect(statusUpdatedBeforeDestroy).toBe(false);
  });

  it('deve aguardar e destruir idempotentemente o loadingTask mesmo quando o timeout dispara durante a inicialização (loadDocumentTask)', async () => {
    let lateTaskCreated = false;
    let lateTaskDestroyedCount = 0;
    let getPageCalled = false;

    const slowInitLoader = async (): Promise<PdfLoadingTaskLike> => {
      // Inicialização demora 70 ms, enquanto o timeout dispara em 20 ms
      await new Promise((resolve) => setTimeout(resolve, 70));
      lateTaskCreated = true;

      return {
        promise: Promise.resolve({
          numPages: 1,
          async getPage() {
            getPageCalled = true;
            return {
              async getTextContent() {
                return { items: [{ str: 'Texto que não deve ser lido' }] };
              },
              cleanup() {},
            };
          },
        }),
        async destroy() {
          lateTaskDestroyedCount += 1;
        },
      };
    };

    const initTimeoutExtractor = new PdfJsTextExtractor(slowInitLoader);

    await expect(
      initTimeoutExtractor.extractDigitalText(Buffer.from('%PDF-1.4\n%%EOF'), {
        timeoutMs: 20,
      })
    ).rejects.toMatchObject({
      code: 'PDF_EXTRACTION_TIMEOUT',
    });

    // O extrator deve ter aguardado a criação tardia do loadingTask e o destruído exatamente 1 vez
    expect(lateTaskCreated).toBe(true);
    expect(lateTaskDestroyedCount).toBe(1);
    expect(getPageCalled).toBe(false);
  });

  it('deve destruir loadingTask e documento tanto em erro de abertura (loadingTask.promise) quanto em erro durante extração de página', async () => {
    let openErrorTaskDestroyed = 0;

    // 1. Erro na abertura do documento (loadingTask.promise rejeita)
    const failingOpenLoader = async (): Promise<PdfLoadingTaskLike> => {
      const passwordErr = new Error('Password required');
      passwordErr.name = 'PasswordException';
      const rejectedPromise = Promise.reject(passwordErr);
      // Evita unhandledRejection antes do await
      rejectedPromise.catch(() => undefined);

      return {
        promise: rejectedPromise,
        async destroy() {
          openErrorTaskDestroyed += 1;
        },
      };
    };

    const openErrExtractor = new PdfJsTextExtractor(failingOpenLoader);
    await expect(
      openErrExtractor.extractDigitalText(Buffer.from('%PDF-1.4\n%%EOF'))
    ).rejects.toMatchObject({
      code: 'PDF_EXTRACTION_FAILED',
      message: 'O arquivo PDF está protegido por senha e não pode ser processado.',
    });
    expect(openErrorTaskDestroyed).toBe(1);

    // 2. Erro no meio da extração de uma página (page.getTextContent rejeita)
    let midErrorPageCleaned = 0;
    let midErrorDocDestroyed = 0;
    let midErrorTaskDestroyed = 0;

    const failingPageLoader = async (): Promise<PdfLoadingTaskLike> => ({
      promise: Promise.resolve({
        numPages: 2,
        async getPage() {
          return {
            async getTextContent() {
              throw new Error('Stream XRef corrompido na página 1');
            },
            cleanup() {
              midErrorPageCleaned += 1;
            },
          };
        },
        async destroy() {
          midErrorDocDestroyed += 1;
        },
      }),
      async destroy() {
        midErrorTaskDestroyed += 1;
      },
    });

    const midErrExtractor = new PdfJsTextExtractor(failingPageLoader);
    await expect(
      midErrExtractor.extractDigitalText(Buffer.from('%PDF-1.4\n%%EOF'))
    ).rejects.toMatchObject({
      code: 'PDF_EXTRACTION_FAILED',
    });

    expect(midErrorPageCleaned).toBe(1);
    expect(midErrorDocDestroyed).toBe(1);
    expect(midErrorTaskDestroyed).toBe(1);
  });

  it('deve preservar consistência na exclusão quando MinIO ou PostgreSQL falharem, permitindo retentativa idempotente', async () => {
    const pdfBuffer = buildRealPdfBuffer({
      pageTexts: ['Documento para teste de consistência de exclusão entre MinIO e PostgreSQL.'],
    });

    const created = await service.uploadAndProcessPdf(USER_A, {
      originalName: 'consistencia_exclusao.pdf',
      mimeType: 'application/pdf',
      sizeBytes: pdfBuffer.byteLength,
      buffer: pdfBuffer,
    });

    // Caso 1: MinIO falha durante a exclusão -> registro no banco NÃO é apagado (preserva objectKey)
    storage.simulateStorageFailure = true;
    await expect(
      service.deleteUserDocument(USER_A, created.id)
    ).rejects.toThrow(/MinIO connection refused/i);
    expect(await repo.findById(created.id)).not.toBeNull();
    expect(storage.objects.size).toBe(1);

    // Caso 2: MinIO funciona, mas PostgreSQL falha ao deletar -> erro é propagado (sem falso sucesso)
    storage.simulateStorageFailure = false;
    repo.simulateDbFailureOnDelete = true;
    await expect(
      service.deleteUserDocument(USER_A, created.id)
    ).rejects.toThrow(/PostgreSQL delete failed/i);
    expect(storage.objects.size).toBe(0);
    expect(await repo.findById(created.id)).not.toBeNull();

    // Caso 3: Nova tentativa após restabelecimento do PostgreSQL conclui a exclusão com sucesso
    repo.simulateDbFailureOnDelete = false;
    await service.deleteUserDocument(USER_A, created.id);
    expect(await repo.findById(created.id)).toBeNull();
  });

  describe('Sprint 4, Etapa 4.3 — Passo 2: Recuperação segura do texto do documento para IA', () => {
    it('deve recuperar com sucesso o texto e metadados contextuais de documento elegível (status COMPLETED e texto válido)', async () => {
      const now = new Date();
      await repo.create({
        id: 'doc-ai-eligible-1',
        userId: USER_A,
        examId: 'exam-concurso-2025',
        originalName: 'prova_cebraspe.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storageBucket: 'secret-bucket',
        objectKey: 'secret-key-123.pdf',
        checksumSha256: 'a'.repeat(64),
        status: 'COMPLETED',
      });

      // Atualiza com texto persistido e metadados
      const existing = await repo.findById('doc-ai-eligible-1');
      expect(existing).not.toBeNull();
      repo.records.set('doc-ai-eligible-1', {
        ...existing!,
        status: 'COMPLETED',
        pageCount: 3,
        extractedText: '1. (Cespe/2025) O princípio da legalidade é basilar ao Estado de Direito.\n( ) Certo ( ) Errado',
        extractedCharCount: 91,
        requiresOcr: false,
        processedAt: now,
      });

      const result = await service.getDocumentTextForAiExtraction(USER_A, 'doc-ai-eligible-1');

      expect(result).toEqual({
        id: 'doc-ai-eligible-1',
        userId: USER_A,
        examId: 'exam-concurso-2025',
        originalName: 'prova_cebraspe.pdf',
        extractedText: '1. (Cespe/2025) O princípio da legalidade é basilar ao Estado de Direito.\n( ) Certo ( ) Errado',
        extractedCharCount: 91,
        pageCount: 3,
        status: 'COMPLETED',
      });

      // Garante que chaves internas de storage não foram expostas
      expect((result as unknown as Record<string, unknown>).objectKey).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).storageBucket).toBeUndefined();

      // Confirma que o alias getExtractedTextForDocument produz o mesmo resultado
      const aliasResult = await service.getExtractedTextForDocument(USER_A, 'doc-ai-eligible-1');
      expect(aliasResult).toEqual(result);
    });

    it('deve rejeitar com DOCUMENT_NOT_FOUND (404) quando o documento não existir', async () => {
      await expect(
        service.getDocumentTextForAiExtraction(USER_A, 'doc-inexistente')
      ).rejects.toMatchObject({
        code: 'DOCUMENT_NOT_FOUND',
        statusCode: 404,
      });
    });

    it('deve rejeitar com DOCUMENT_NOT_FOUND (404) quando documentId for vazio ou em branco', async () => {
      await expect(
        service.getDocumentTextForAiExtraction(USER_A, '   ')
      ).rejects.toMatchObject({
        code: 'DOCUMENT_NOT_FOUND',
        statusCode: 404,
      });
    });

    it('deve rejeitar com DOCUMENT_FORBIDDEN (403) quando actorUserId não for informado ou for vazio', async () => {
      await expect(
        service.getDocumentTextForAiExtraction('', 'doc-1')
      ).rejects.toMatchObject({
        code: 'DOCUMENT_FORBIDDEN',
        statusCode: 403,
      });

      await expect(
        service.getDocumentTextForAiExtraction('   ', 'doc-1')
      ).rejects.toMatchObject({
        code: 'DOCUMENT_FORBIDDEN',
        statusCode: 403,
      });
    });

    it('deve rejeitar com DOCUMENT_FORBIDDEN (403) quando outro usuário tentar acessar o texto do documento', async () => {
      await repo.create({
        id: 'doc-owner-a-only',
        userId: USER_A,
        originalName: 'prova_privada.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storageBucket: 'bucket',
        objectKey: 'key',
        checksumSha256: 'b'.repeat(64),
        status: 'COMPLETED',
      });

      await expect(
        service.getDocumentTextForAiExtraction(USER_B, 'doc-owner-a-only')
      ).rejects.toMatchObject({
        code: 'DOCUMENT_FORBIDDEN',
        statusCode: 403,
      });
    });

    it('deve rejeitar com DOCUMENT_ALREADY_PROCESSING (409) quando o documento estiver em processamento', async () => {
      await repo.create({
        id: 'doc-in-processing',
        userId: USER_A,
        originalName: 'processando.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storageBucket: 'bucket',
        objectKey: 'key-proc',
        checksumSha256: 'c'.repeat(64),
        status: 'PROCESSING',
      });

      await expect(
        service.getDocumentTextForAiExtraction(USER_A, 'doc-in-processing')
      ).rejects.toMatchObject({
        code: 'DOCUMENT_ALREADY_PROCESSING',
        statusCode: 409,
      });

      // Também para UPLOADED
      const existing = await repo.findById('doc-in-processing');
      repo.records.set('doc-in-processing', { ...existing!, status: 'UPLOADED' });

      await expect(
        service.getDocumentTextForAiExtraction(USER_A, 'doc-in-processing')
      ).rejects.toMatchObject({
        code: 'DOCUMENT_ALREADY_PROCESSING',
        statusCode: 409,
      });
    });

    it('deve rejeitar com DOCUMENT_NEEDS_OCR (422) quando o status for NEEDS_OCR', async () => {
      await repo.create({
        id: 'doc-scanned',
        userId: USER_A,
        originalName: 'escanear.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storageBucket: 'bucket',
        objectKey: 'key-scanned',
        checksumSha256: 'd'.repeat(64),
        status: 'NEEDS_OCR',
      });

      await expect(
        service.getDocumentTextForAiExtraction(USER_A, 'doc-scanned')
      ).rejects.toMatchObject({
        code: 'DOCUMENT_NEEDS_OCR',
        statusCode: 422,
      });
    });

    it('deve rejeitar com DOCUMENT_NEEDS_OCR (422) quando requiresOcr for true mesmo com status COMPLETED', async () => {
      await repo.create({
        id: 'doc-hybrid-ocr',
        userId: USER_A,
        originalName: 'hibrido.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storageBucket: 'bucket',
        objectKey: 'key-hybrid',
        checksumSha256: 'e'.repeat(64),
        status: 'COMPLETED',
      });
      const existing = await repo.findById('doc-hybrid-ocr');
      repo.records.set('doc-hybrid-ocr', {
        ...existing!,
        requiresOcr: true,
        extractedText: 'Texto parcial da primeira pagina apenas',
      });

      await expect(
        service.getDocumentTextForAiExtraction(USER_A, 'doc-hybrid-ocr')
      ).rejects.toMatchObject({
        code: 'DOCUMENT_NEEDS_OCR',
        statusCode: 422,
      });
    });

    it('deve rejeitar com PDF_EXTRACTION_FAILED (422) quando o status for FAILED', async () => {
      await repo.create({
        id: 'doc-failed',
        userId: USER_A,
        originalName: 'com_erro.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storageBucket: 'bucket',
        objectKey: 'key-failed',
        checksumSha256: 'f'.repeat(64),
        status: 'FAILED',
      });

      await expect(
        service.getDocumentTextForAiExtraction(USER_A, 'doc-failed')
      ).rejects.toMatchObject({
        code: 'PDF_EXTRACTION_FAILED',
        statusCode: 422,
      });
    });

    it('deve rejeitar com DOCUMENT_NO_TEXT (422) quando extractedText for null ou string vazia', async () => {
      await repo.create({
        id: 'doc-empty-text',
        userId: USER_A,
        originalName: 'vazio.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storageBucket: 'bucket',
        objectKey: 'key-empty',
        checksumSha256: '0'.repeat(64),
        status: 'COMPLETED',
      });
      const existing = await repo.findById('doc-empty-text');
      repo.records.set('doc-empty-text', {
        ...existing!,
        extractedText: null,
      });

      await expect(
        service.getDocumentTextForAiExtraction(USER_A, 'doc-empty-text')
      ).rejects.toMatchObject({
        code: 'DOCUMENT_NO_TEXT',
        statusCode: 422,
      });

      // String vazia ""
      repo.records.set('doc-empty-text', {
        ...existing!,
        extractedText: '',
      });

      await expect(
        service.getDocumentTextForAiExtraction(USER_A, 'doc-empty-text')
      ).rejects.toMatchObject({
        code: 'DOCUMENT_NO_TEXT',
        statusCode: 422,
      });
    });

    it('deve rejeitar com DOCUMENT_NO_TEXT (422) quando extractedText contiver apenas caracteres de espaco em branco', async () => {
      await repo.create({
        id: 'doc-whitespace-only',
        userId: USER_A,
        originalName: 'espacos.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storageBucket: 'bucket',
        objectKey: 'key-ws',
        checksumSha256: '1'.repeat(64),
        status: 'COMPLETED',
      });
      const existing = await repo.findById('doc-whitespace-only');
      repo.records.set('doc-whitespace-only', {
        ...existing!,
        extractedText: '   \n\t  \r\n   ',
      });

      await expect(
        service.getDocumentTextForAiExtraction(USER_A, 'doc-whitespace-only')
      ).rejects.toMatchObject({
        code: 'DOCUMENT_NO_TEXT',
        statusCode: 422,
      });
    });

    it('deve preencher extractedCharCount com fallback no tamanho da string quando extração anterior não tiver persistido charCount', async () => {
      await repo.create({
        id: 'doc-fallback-chars',
        userId: USER_A,
        originalName: 'fallback.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storageBucket: 'bucket',
        objectKey: 'key-fb',
        checksumSha256: '2'.repeat(64),
        status: 'COMPLETED',
      });
      const existing = await repo.findById('doc-fallback-chars');
      const text = 'Texto sem contagem explícita gravada no banco';
      repo.records.set('doc-fallback-chars', {
        ...existing!,
        extractedText: text,
        extractedCharCount: null,
      });

      const res = await service.getDocumentTextForAiExtraction(USER_A, 'doc-fallback-chars');
      expect(res.extractedCharCount).toBe(text.length);
    });
  });
});
