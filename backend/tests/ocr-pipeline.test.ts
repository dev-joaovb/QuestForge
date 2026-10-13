import { describe, it, expect, beforeEach } from 'vitest';
import type { PdfDocument } from '@prisma/client';
import {
  PdfJsTextExtractor,
  type PdfDocumentProxyLike,
  type PdfLoadingTaskLike,
  type PdfPageProxyLike,
} from '../src/utils/pdf-extractor.ts';
import {
  ConfigurableOcrService,
  UnconfiguredOcrService,
} from '../src/services/ocr.service.ts';
import { PdfDocumentService } from '../src/services/pdf-document.service.ts';
import type {
  CompletePdfExtractionInput,
  CreatePdfDocumentRecordInput,
  IPdfDocumentRepository,
} from '../src/repositories/pdf-document.repository.ts';
import type {
  IObjectStorageService,
  PutPrivateObjectInput,
  StoredPrivateObjectInfo,
} from '../src/services/storage.service.ts';
import { buildRealPdfBuffer } from './pdf-document.service.test.ts';

class InMemoryTestStorage implements IObjectStorageService {
  public objects = new Map<string, Buffer>();

  getDefaultBucket(): string {
    return 'questforge-documents';
  }

  async putPrivateObject(input: PutPrivateObjectInput): Promise<StoredPrivateObjectInfo> {
    const bucket = input.bucket ?? this.getDefaultBucket();
    this.objects.set(`${bucket}:${input.objectKey}`, Buffer.from(input.buffer));
    return {
      bucket,
      objectKey: input.objectKey,
      etag: 'etag-ocr-test',
    };
  }

  async getPrivateObjectBuffer(objectKey: string, bucket?: string): Promise<Buffer> {
    const targetBucket = bucket ?? this.getDefaultBucket();
    const found = this.objects.get(`${targetBucket}:${objectKey}`);
    if (!found) {
      throw new Error('Object not found in test storage');
    }
    return found;
  }

  async deletePrivateObject(objectKey: string, bucket?: string): Promise<void> {
    const targetBucket = bucket ?? this.getDefaultBucket();
    this.objects.delete(`${targetBucket}:${objectKey}`);
  }

  async checkStorageHealth() {
    return {
      status: 'up' as const,
      bucket: this.getDefaultBucket(),
      message: 'In-memory test storage',
    };
  }
}

class InMemoryTestPdfRepository implements IPdfDocumentRepository {
  public records = new Map<string, PdfDocument>();

  async create(data: CreatePdfDocumentRecordInput): Promise<PdfDocument> {
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
    this.records.delete(id);
  }
}

describe('Etapa 3.3 — Preparação do Pipeline de OCR e Classificação de PDFs (backend/tests/ocr-pipeline.test.ts)', () => {
  const USER_A = 'user-owner-a';
  const USER_B = 'user-other-b';

  let storage: InMemoryTestStorage;
  let repo: InMemoryTestPdfRepository;
  let extractor: PdfJsTextExtractor;

  beforeEach(() => {
    storage = new InMemoryTestStorage();
    repo = new InMemoryTestPdfRepository();
    extractor = new PdfJsTextExtractor();
  });

  it('deve classificar corretamente PDF com texto digital (DIGITAL_TEXT) e PDF digitalizado que requer OCR (SCANNED_NEEDS_OCR)', async () => {
    // 1. PDF com texto digital utilizável (página 1 com texto e página 2 sem texto)
    const hybridDigitalPdf = buildRealPdfBuffer({
      pageTexts: [
        'Questao 01 - Direito Constitucional: O controle concentrado de constitucionalidade e exercido pelo STF.',
        '',
      ],
    });

    const digitalResult = await extractor.extractDigitalText(hybridDigitalPdf);
    expect(digitalResult.classification).toBe('DIGITAL_TEXT');
    expect(digitalResult.requiresOcr).toBe(false);
    expect(digitalResult.pageCount).toBe(2);
    expect(digitalResult.extractedCharCount).toBeGreaterThan(50);
    expect(digitalResult.extractedText).toContain('Questao 01');
    // Identifica que apenas a página 2 não continha camada de texto digital suficiente
    expect(digitalResult.pagesNeedingOcr).toEqual([2]);

    // 2. PDF digitalizado (todas as páginas sem camada de texto digital utilizável)
    const scannedPdf = buildRealPdfBuffer({
      pageTexts: ['', '   '],
    });

    const scannedResult = await extractor.extractDigitalText(scannedPdf);
    expect(scannedResult.classification).toBe('SCANNED_NEEDS_OCR');
    expect(scannedResult.requiresOcr).toBe(true);
    expect(scannedResult.pageCount).toBe(2);
    expect(scannedResult.extractedCharCount).toBe(0);
    expect(scannedResult.extractedText).toBeNull();
    expect(scannedResult.pagesNeedingOcr).toEqual([1, 2]);
  });

  it('deve diferenciar PDF vazio (0 bytes), sem páginas válidas, corrompido ou protegido por senha', async () => {
    // 1. Buffer vazio (0 bytes) -> PDF_VALIDATION_ERROR
    await expect(extractor.extractDigitalText(Buffer.alloc(0))).rejects.toMatchObject({
      code: 'PDF_VALIDATION_ERROR',
      statusCode: 400,
    });

    // 2. PDF com 0 páginas -> PDF_VALIDATION_ERROR
    const zeroPagesExtractor = new PdfJsTextExtractor(async () => ({
      promise: Promise.resolve({
        numPages: 0,
        async getPage() {
          throw new Error('Should not be called');
        },
      }),
      async destroy() {},
    }));

    await expect(
      zeroPagesExtractor.extractDigitalText(Buffer.from('%PDF-1.4\n%%EOF'))
    ).rejects.toMatchObject({
      code: 'PDF_VALIDATION_ERROR',
      message: 'O documento PDF não possui páginas válidas.',
    });

    // 3. PDF corrompido na estrutura interna -> PDF_EXTRACTION_FAILED
    const corruptedPdfExtractor = new PdfJsTextExtractor(async () => {
      const rejected = Promise.reject(new Error('InvalidPDFException: bad XRef entry'));
      rejected.catch(() => undefined);
      return {
        promise: rejected,
        async destroy() {},
      };
    });

    await expect(
      corruptedPdfExtractor.extractDigitalText(Buffer.from('%PDF-1.4\ncorrompido\n%%EOF'))
    ).rejects.toMatchObject({
      code: 'PDF_EXTRACTION_FAILED',
      message: 'Não foi possível interpretar a estrutura interna do arquivo PDF.',
    });

    // 4. PDF protegido por senha -> PDF_EXTRACTION_FAILED com diagnóstico explícito de senha
    const passwordPdfExtractor = new PdfJsTextExtractor(async () => {
      const err = new Error('No password given');
      err.name = 'PasswordException';
      const rejected = Promise.reject(err);
      rejected.catch(() => undefined);
      return {
        promise: rejected,
        async destroy() {},
      };
    });

    await expect(
      passwordPdfExtractor.extractDigitalText(Buffer.from('%PDF-1.4\nencrypted\n%%EOF'))
    ).rejects.toMatchObject({
      code: 'PDF_EXTRACTION_FAILED',
      message: 'O arquivo PDF está protegido por senha e não pode ser processado.',
    });
  });

  it('deve informar claramente OCR_UNAVAILABLE (503) quando o OCR não estiver configurado, preservando o PDF original e o status NEEDS_OCR sem falso sucesso', async () => {
    const defaultService = new PdfDocumentService({
      pdfDocumentRepository: repo,
      storageService: storage,
      pdfTextExtractor: extractor,
      ocrService: new UnconfiguredOcrService(),
    });

    expect(defaultService.getOcrServiceStatus().available).toBe(false);

    const scannedPdf = buildRealPdfBuffer({
      pageTexts: ['', ''],
    });

    const uploaded = await defaultService.uploadAndProcessPdf(USER_A, {
      originalName: 'prova_digitalizada.pdf',
      mimeType: 'application/pdf',
      sizeBytes: scannedPdf.byteLength,
      buffer: scannedPdf,
    });

    expect(uploaded.status).toBe('NEEDS_OCR');
    expect(uploaded.requiresOcr).toBe(true);

    // Tentativa de acionar o OCR sem provedor configurado deve falhar com 503 OCR_UNAVAILABLE
    await expect(
      defaultService.processDocumentOcr(USER_A, uploaded.id)
    ).rejects.toMatchObject({
      code: 'OCR_UNAVAILABLE',
      statusCode: 503,
    });

    // O documento original não pode ser destruído nem marcado como COMPLETED
    const afterFailedAttempt = await repo.findById(uploaded.id);
    expect(afterFailedAttempt).not.toBeNull();
    expect(afterFailedAttempt?.status).toBe('NEEDS_OCR');
    expect(afterFailedAttempt?.requiresOcr).toBe(true);
    expect(afterFailedAttempt?.extractedText).toBeNull();
    expect(storage.objects.size).toBe(1);
  });

  it('deve processar páginas uma por vez via IOcrService, limpar recursos de cada página, persistir extractedText no banco e omiti-lo do DTO HTTP', async () => {
    let currentActivePages = 0;
    let maxConcurrentActivePages = 0;
    const processedPageNumbers: number[] = [];

    // Simula um adaptador de OCR de teste acoplado à abstração ConfigurableOcrService
    const testOcrService = new ConfigurableOcrService({
      providerName: 'test-ocr-adapter',
      recognizer: async (page) => {
        currentActivePages += 1;
        maxConcurrentActivePages = Math.max(maxConcurrentActivePages, currentActivePages);
        processedPageNumbers.push(page.pageNumber);

        // Verifica que o buffer temporário da página não está vazio durante o reconhecimento
        expect(page.contentBuffer.byteLength).toBeGreaterThan(0);

        await new Promise((resolve) => setTimeout(resolve, 5));
        currentActivePages -= 1;

        return {
          pageNumber: page.pageNumber,
          text: `Texto reconhecido via OCR na página ${page.pageNumber}: Questão de Arquitetura de Computadores.`,
          confidence: 0.96,
        };
      },
    });

    const serviceWithOcr = new PdfDocumentService({
      pdfDocumentRepository: repo,
      storageService: storage,
      pdfTextExtractor: extractor,
      ocrService: testOcrService,
    });

    const scannedPdf = buildRealPdfBuffer({
      pageTexts: ['', ''],
    });

    const uploaded = await serviceWithOcr.uploadAndProcessPdf(USER_A, {
      originalName: 'caderno_escaneado_2025.pdf',
      mimeType: 'application/pdf',
      sizeBytes: scannedPdf.byteLength,
      buffer: scannedPdf,
    });

    expect(uploaded.status).toBe('NEEDS_OCR');
    expect(uploaded.requiresOcr).toBe(true);

    // Isolamento por usuário: USER_B não pode acionar OCR no documento de USER_A
    await expect(
      serviceWithOcr.processDocumentOcr(USER_B, uploaded.id)
    ).rejects.toMatchObject({
      code: 'DOCUMENT_FORBIDDEN',
      statusCode: 403,
    });

    // Proprietário (USER_A) aciona o pipeline de OCR
    const ocrCompletedDto = await serviceWithOcr.processDocumentOcr(USER_A, uploaded.id);

    expect(ocrCompletedDto.status).toBe('COMPLETED');
    expect(ocrCompletedDto.requiresOcr).toBe(false);
    expect(ocrCompletedDto.pageCount).toBe(2);
    expect(ocrCompletedDto.extractedCharCount).toBeGreaterThan(80);
    expect(processedPageNumbers).toEqual([1, 2]);
    // Garante que apenas 1 página esteve carregada por vez
    expect(maxConcurrentActivePages).toBe(1);

    // Resposta pública/DTO não expõe extractedText nem chaves internas do MinIO
    expect('extractedText' in ocrCompletedDto).toBe(false);
    expect('objectKey' in ocrCompletedDto).toBe(false);
    expect('storageBucket' in ocrCompletedDto).toBe(false);

    // O texto integral extraído permanece persistido no armazenamento interno (repositório/banco)
    const persisted = await repo.findById(uploaded.id);
    expect(persisted?.status).toBe('COMPLETED');
    expect(persisted?.requiresOcr).toBe(false);
    expect(persisted?.extractedText).toContain('[Página 1]');
    expect(persisted?.extractedText).toContain('[Página 2]');
    expect(persisted?.extractedText).toContain('Questão de Arquitetura de Computadores');
  });

  it('deve tratar falhas, retorno vazio e timeout no OCR limpando recursos PDF.js, preservando o PDF original e sem marcar COMPLETED falsamente', async () => {
    const cleanedPages: number[] = [];
    let docDestroyedCount = 0;
    let taskDestroyedCount = 0;

    const trackedLoader = async (): Promise<PdfLoadingTaskLike> => {
      const docProxy: PdfDocumentProxyLike = {
        numPages: 3,
        async getPage(pageNumber: number): Promise<PdfPageProxyLike> {
          return {
            async getTextContent() {
              return { items: [] };
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

    const slowOcrService = new ConfigurableOcrService({
      providerName: 'slow-ocr-adapter',
      timeoutMs: 35,
      recognizer: async (page) => {
        if (page.pageNumber === 2) {
          // Simula travamento na página 2 excedendo o timeout de 35 ms
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        return {
          pageNumber: page.pageNumber,
          text: `Texto página ${page.pageNumber}`,
        };
      },
    });

    const serviceWithSlowOcr = new PdfDocumentService({
      pdfDocumentRepository: repo,
      storageService: storage,
      pdfTextExtractor: new PdfJsTextExtractor(trackedLoader),
      ocrService: slowOcrService,
      extractionTimeoutMs: 35,
    });

    const scannedPdf = buildRealPdfBuffer({
      pageTexts: ['', '', ''],
    });

    const uploaded = await serviceWithSlowOcr.uploadAndProcessPdf(USER_A, {
      originalName: 'escaneado_timeout_ocr.pdf',
      mimeType: 'application/pdf',
      sizeBytes: scannedPdf.byteLength,
      buffer: scannedPdf,
    });

    expect(uploaded.status).toBe('NEEDS_OCR');

    // Reset contadores da fase de upload para medir exclusivamente a fase de OCR
    cleanedPages.length = 0;
    docDestroyedCount = 0;
    taskDestroyedCount = 0;

    const failedOcrDto = await serviceWithSlowOcr.processDocumentOcr(USER_A, uploaded.id);

    expect(failedOcrDto.status).toBe('FAILED');
    expect(failedOcrDto.requiresOcr).toBe(true);
    expect(failedOcrDto.errorMessage).toMatch(/excedeu o tempo limite/i);

    // Confirma que a página 3 não foi processada, as páginas 1 e 2 sofreram cleanup e o documento/worker foi destruído
    expect(cleanedPages).toEqual([1, 2]);
    expect(docDestroyedCount).toBe(1);
    expect(taskDestroyedCount).toBe(1);

    // O PDF original continua preservado no MinIO e o banco não contém falso sucesso
    expect(storage.objects.size).toBe(1);
    const persisted = await repo.findById(uploaded.id);
    expect(persisted?.status).toBe('FAILED');
    expect(persisted?.extractedText).toBeNull();
  });

  it('deve impedir concorrência no OCR: em duas chamadas simultâneas, apenas uma adquire PROCESSING e executa OCR enquanto a outra falha com 409 DOCUMENT_ALREADY_PROCESSING sem alterar o estado final', async () => {
    let recognizerInvocations = 0;
    let storageReads = 0;

    // Barreira explícita de sincronização (sem temporizadores arbitrários)
    let notifyFirstPageEntered!: () => void;
    const firstPageEnteredPromise = new Promise<void>((resolve) => {
      notifyFirstPageEntered = resolve;
    });

    let releaseOcrBarrier!: () => void;
    const ocrBarrierPromise = new Promise<void>((resolve) => {
      releaseOcrBarrier = resolve;
    });

    const originalGetBuffer = storage.getPrivateObjectBuffer.bind(storage);
    storage.getPrivateObjectBuffer = async (objectKey: string, bucket?: string) => {
      storageReads += 1;
      return originalGetBuffer(objectKey, bucket);
    };

    const barrierOcrService = new ConfigurableOcrService({
      providerName: 'barrier-ocr-adapter',
      recognizer: async (page) => {
        recognizerInvocations += 1;
        notifyFirstPageEntered();
        await ocrBarrierPromise;
        return {
          pageNumber: page.pageNumber,
          text: `Texto concorrente seguro na página ${page.pageNumber}: Direito Tributário.`,
          confidence: 0.98,
        };
      },
    });

    const service = new PdfDocumentService({
      pdfDocumentRepository: repo,
      storageService: storage,
      pdfTextExtractor: extractor,
      ocrService: barrierOcrService,
    });

    const scannedPdf = buildRealPdfBuffer({
      pageTexts: [''],
    });

    const uploaded = await service.uploadAndProcessPdf(USER_A, {
      originalName: 'concorrencia_ocr.pdf',
      mimeType: 'application/pdf',
      sizeBytes: scannedPdf.byteLength,
      buffer: scannedPdf,
    });

    expect(uploaded.status).toBe('NEEDS_OCR');

    // Dispara a Requisição 1 (vencedora) e aguarda determinísticamente até ela entrar no reconhecedor OCR
    const winnerPromise = service.processDocumentOcr(USER_A, uploaded.id);
    await firstPageEnteredPromise;

    // Confirma que o documento já está em PROCESSING no repositório
    const duringProcessing = await repo.findById(uploaded.id);
    expect(duringProcessing?.status).toBe('PROCESSING');

    // Dispara a Requisição 2 (concorrente/perdedora) enquanto a Requisição 1 está em andamento
    const loserPromise = service.processDocumentOcr(USER_A, uploaded.id);

    await expect(loserPromise).rejects.toMatchObject({
      code: 'DOCUMENT_ALREADY_PROCESSING',
      statusCode: 409,
    });

    // A requisição perdedora não leu do MinIO nem invocou o motor de OCR
    expect(storageReads).toBe(1);
    expect(recognizerInvocations).toBe(1);

    // Libera a barreira para a requisição vencedora concluir
    releaseOcrBarrier();
    const winnerResult = await winnerPromise;

    expect(winnerResult.status).toBe('COMPLETED');
    expect(winnerResult.requiresOcr).toBe(false);
    expect(recognizerInvocations).toBe(1);
    expect(storageReads).toBe(1);

    const finalPersisted = await repo.findById(uploaded.id);
    expect(finalPersisted?.status).toBe('COMPLETED');
    expect(finalPersisted?.extractedText).toContain('Direito Tributário');
  });

  it('deve rejeitar nova aquisição se o documento já estiver em PROCESSING e preservar a política de erro (FAILED) se a requisição vencedora falhar', async () => {
    let recognizerCalls = 0;

    let notifyEntered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      notifyEntered = resolve;
    });

    let rejectWinningOcr!: (err: Error) => void;
    const winningOcrGate = new Promise<void>((_, reject) => {
      rejectWinningOcr = reject;
    });

    const failingOcrService = new ConfigurableOcrService({
      providerName: 'failing-winner-ocr',
      recognizer: async () => {
        recognizerCalls += 1;
        notifyEntered();
        await winningOcrGate;
        return { pageNumber: 1, text: 'Inalcançável' };
      },
    });

    const service = new PdfDocumentService({
      pdfDocumentRepository: repo,
      storageService: storage,
      pdfTextExtractor: extractor,
      ocrService: failingOcrService,
    });

    const scannedPdf = buildRealPdfBuffer({
      pageTexts: [''],
    });

    const uploaded = await service.uploadAndProcessPdf(USER_A, {
      originalName: 'falha_vencedora_ocr.pdf',
      mimeType: 'application/pdf',
      sizeBytes: scannedPdf.byteLength,
      buffer: scannedPdf,
    });

    // 1. Documento explicitamente em PROCESSING não pode ser adquirido
    await repo.markProcessing(uploaded.id);
    await expect(
      service.processDocumentOcr(USER_A, uploaded.id)
    ).rejects.toMatchObject({
      code: 'DOCUMENT_ALREADY_PROCESSING',
      statusCode: 409,
    });
    expect(recognizerCalls).toBe(0);

    // 2. Restaura para NEEDS_OCR, inicia requisição vencedora e rejeita chamada concorrente com 409
    await repo.markExtractionCompleted(uploaded.id, {
      status: 'NEEDS_OCR',
      pageCount: 1,
      extractedText: null,
      extractedCharCount: 0,
      requiresOcr: true,
      processedAt: new Date(),
    });

    const winnerPromise = service.processDocumentOcr(USER_A, uploaded.id);
    await enteredPromise;

    await expect(
      service.processDocumentOcr(USER_A, uploaded.id)
    ).rejects.toMatchObject({
      code: 'DOCUMENT_ALREADY_PROCESSING',
      statusCode: 409,
    });

    // 3. Simula falha no motor OCR durante a requisição vencedora -> segue política de erro (FAILED)
    rejectWinningOcr(new Error('Falha interna no motor de reconhecimento óptico'));
    const failedDto = await winnerPromise;

    expect(failedDto.status).toBe('FAILED');
    expect(failedDto.errorMessage).toMatch(/Falha durante a extração de texto via OCR/i);
    expect(recognizerCalls).toBe(1);

    const persistedAfterFailure = await repo.findById(uploaded.id);
    expect(persistedAfterFailure?.status).toBe('FAILED');
    expect(storage.objects.size).toBe(1);
  });

  it('deve classificar distintamente PROCESSING (409 DOCUMENT_ALREADY_PROCESSING), estados incompatíveis COMPLETED/UPLOADED (409 DOCUMENT_INVALID_OCR_STATE), desaparecimento concorrente do documento (404 DOCUMENT_NOT_FOUND) e preservar falhas de infraestrutura', async () => {
    let recognizerInvocations = 0;

    const testOcrService = new ConfigurableOcrService({
      providerName: 'state-classification-ocr',
      recognizer: async (page) => {
        recognizerInvocations += 1;
        return {
          pageNumber: page.pageNumber,
          text: 'Texto extraído via OCR.',
        };
      },
    });

    const service = new PdfDocumentService({
      pdfDocumentRepository: repo,
      storageService: storage,
      pdfTextExtractor: extractor,
      ocrService: testOcrService,
    });

    // 1. Documento em estado COMPLETED (ex.: PDF digital já concluído) -> 409 DOCUMENT_INVALID_OCR_STATE
    const digitalPdf = buildRealPdfBuffer({
      pageTexts: ['Questao com camada de texto digital suficiente para classificacao COMPLETED.'],
    });

    const completedDoc = await service.uploadAndProcessPdf(USER_A, {
      originalName: 'digital_ja_concluido.pdf',
      mimeType: 'application/pdf',
      sizeBytes: digitalPdf.byteLength,
      buffer: digitalPdf,
    });

    expect(completedDoc.status).toBe('COMPLETED');

    await expect(
      service.processDocumentOcr(USER_A, completedDoc.id)
    ).rejects.toMatchObject({
      code: 'DOCUMENT_INVALID_OCR_STATE',
      statusCode: 409,
    });
    expect(recognizerInvocations).toBe(0);

    // 2. Documento em estado UPLOADED (ainda não elegível para OCR) -> 409 DOCUMENT_INVALID_OCR_STATE
    const uploadedOnlyRecord = await repo.create({
      id: 'doc-uploaded-state',
      userId: USER_A,
      originalName: 'recem_enviado.pdf',
      mimeType: 'application/pdf',
      sizeBytes: digitalPdf.byteLength,
      storageBucket: storage.getDefaultBucket(),
      objectKey: `users/${USER_A}/pdf/doc-uploaded-state.pdf`,
      checksumSha256: 'a'.repeat(64),
      status: 'UPLOADED',
    });

    await expect(
      service.processDocumentOcr(USER_A, uploadedOnlyRecord.id)
    ).rejects.toMatchObject({
      code: 'DOCUMENT_INVALID_OCR_STATE',
      statusCode: 409,
    });
    expect(recognizerInvocations).toBe(0);

    // 3. Documento desaparece entre a leitura inicial e a aquisição atômica -> 404 DOCUMENT_NOT_FOUND (não 409)
    const disappearingRecord = await repo.create({
      id: 'doc-disappearing',
      userId: USER_A,
      originalName: 'excluido_concorrentemente.pdf',
      mimeType: 'application/pdf',
      sizeBytes: digitalPdf.byteLength,
      storageBucket: storage.getDefaultBucket(),
      objectKey: `users/${USER_A}/pdf/doc-disappearing.pdf`,
      checksumSha256: 'b'.repeat(64),
      status: 'NEEDS_OCR',
    });

    const originalTryAcquire = repo.tryAcquireOcrProcessing.bind(repo);
    repo.tryAcquireOcrProcessing = async (id, allowedStatuses) => {
      if (id === disappearingRecord.id) {
        // Simula exclusão concorrente imediatamente antes do updateMany
        repo.records.delete(id);
      }
      return originalTryAcquire(id, allowedStatuses);
    };

    await expect(
      service.processDocumentOcr(USER_A, disappearingRecord.id)
    ).rejects.toMatchObject({
      code: 'DOCUMENT_NOT_FOUND',
      statusCode: 404,
    });

    // 4. Erro real de infraestrutura do banco durante tryAcquireOcrProcessing propaga sem virar 409
    const dbErrorRecord = await repo.create({
      id: 'doc-db-infra-error',
      userId: USER_A,
      originalName: 'erro_banco.pdf',
      mimeType: 'application/pdf',
      sizeBytes: digitalPdf.byteLength,
      storageBucket: storage.getDefaultBucket(),
      objectKey: `users/${USER_A}/pdf/doc-db-infra-error.pdf`,
      checksumSha256: 'c'.repeat(64),
      status: 'NEEDS_OCR',
    });

    repo.tryAcquireOcrProcessing = async () => {
      throw new Error('PostgreSQL connection lost during updateMany');
    };

    await expect(
      service.processDocumentOcr(USER_A, dbErrorRecord.id)
    ).rejects.toThrow('PostgreSQL connection lost during updateMany');
  });
});
