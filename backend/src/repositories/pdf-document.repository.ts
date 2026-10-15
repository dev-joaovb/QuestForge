import type {
  DocumentProcessingStatus,
  DocumentType,
  PdfDocument,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { getPrismaClient } from '../config/database.ts';
import type {
  PdfDocumentDetailDTO,
  PdfDocumentSummaryDTO,
} from '../types/pdf-document.types.ts';

export interface CreatePdfDocumentRecordInput {
  id?: string;
  userId: string;
  examId?: string | null;
  documentType?: DocumentType;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageBucket: string;
  objectKey: string;
  checksumSha256: string;
  status?: DocumentProcessingStatus;
}

export interface CompletePdfExtractionInput {
  status: 'COMPLETED' | 'NEEDS_OCR';
  pageCount: number;
  extractedText: string | null;
  extractedCharCount: number;
  requiresOcr: boolean;
  processedAt: Date;
}

export interface FindPdfDocumentsParams {
  userId: string;
  page: number;
  limit: number;
  status?: DocumentProcessingStatus;
}

export const OCR_ACQUIRABLE_STATUSES: readonly DocumentProcessingStatus[] = [
  'NEEDS_OCR',
  'FAILED',
] as const;

export interface IPdfDocumentRepository {
  create(data: CreatePdfDocumentRecordInput): Promise<PdfDocument>;
  findById(id: string): Promise<PdfDocument | null>;
  findManyByUser(userId: string): Promise<PdfDocument[]>;
  findManyPaginated?(
    params: FindPdfDocumentsParams
  ): Promise<{ items: PdfDocument[]; total: number }>;
  markProcessing(id: string): Promise<PdfDocument>;
  tryAcquireOcrProcessing(
    id: string,
    allowedStatuses?: readonly DocumentProcessingStatus[]
  ): Promise<boolean>;
  markExtractionCompleted(
    id: string,
    data: CompletePdfExtractionInput
  ): Promise<PdfDocument>;
  markFailed(id: string, sanitizedErrorMessage: string, processedAt: Date): Promise<PdfDocument>;
  deleteById(id: string): Promise<void>;
}

/**
 * Mapeia a entidade persistida para o DTO de resumo (listagem), sem incluir o texto extraído
 * e sem expor chaves internas (`objectKey`, `storageBucket`), credenciais ou URLs de armazenamento.
 */
export function toPdfDocumentSummaryDTO(entity: PdfDocument): PdfDocumentSummaryDTO {
  return {
    id: entity.id,
    userId: entity.userId,
    examId: entity.examId,
    originalName: entity.originalName,
    mimeType: entity.mimeType,
    sizeBytes: entity.sizeBytes,
    checksumSha256: entity.checksumSha256,
    status: entity.status,
    pageCount: entity.pageCount,
    extractedCharCount: entity.extractedCharCount,
    requiresOcr: entity.requiresOcr,
    errorMessage: entity.errorMessage,
    processedAt: entity.processedAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

/**
 * Mapeia a entidade persistida para o DTO de detalhes autorizado ao proprietário
 * (`POST /api/documents` e `GET /api/documents/:id`).
 *
 * O texto extraído (`extractedText`) permanece persistido no banco de dados para as próximas etapas,
 * mas é omitido das respostas HTTP padrão (retornando apenas `extractedCharCount`, `pageCount`, `status`
 * e metadados seguros, sem `objectKey`, `storageBucket` ou credenciais).
 */
export function toPdfDocumentDetailDTO(entity: PdfDocument): PdfDocumentDetailDTO {
  return toPdfDocumentSummaryDTO(entity);
}

export class PrismaPdfDocumentRepository implements IPdfDocumentRepository {
  private readonly prismaGetter: () => PrismaClient;

  constructor(customClient?: PrismaClient) {
    this.prismaGetter = customClient ? () => customClient : () => getPrismaClient();
  }

  async create(data: CreatePdfDocumentRecordInput): Promise<PdfDocument> {
    const prisma = this.prismaGetter();
    return prisma.pdfDocument.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        userId: data.userId,
        examId: data.examId ?? null,
        ...(data.documentType ? { documentType: data.documentType } : {}),
        originalName: data.originalName,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        storageBucket: data.storageBucket,
        objectKey: data.objectKey,
        checksumSha256: data.checksumSha256,
        status: data.status ?? 'UPLOADED',
      },
    });
  }

  async findById(id: string): Promise<PdfDocument | null> {
    const prisma = this.prismaGetter();
    return prisma.pdfDocument.findUnique({
      where: { id },
    });
  }

  async findManyByUser(userId: string): Promise<PdfDocument[]> {
    const prisma = this.prismaGetter();
    return prisma.pdfDocument.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findManyPaginated(
    params: FindPdfDocumentsParams
  ): Promise<{ items: PdfDocument[]; total: number }> {
    const prisma = this.prismaGetter();
    const where: Prisma.PdfDocumentWhereInput = {
      userId: params.userId,
      ...(params.status ? { status: params.status } : {}),
    };

    const skip = (params.page - 1) * params.limit;

    const [total, items] = await prisma.$transaction([
      prisma.pdfDocument.count({ where }),
      prisma.pdfDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
    ]);

    return { items, total };
  }

  async markProcessing(id: string): Promise<PdfDocument> {
    const prisma = this.prismaGetter();
    return prisma.pdfDocument.update({
      where: { id },
      data: {
        status: 'PROCESSING',
        errorMessage: null,
      },
    });
  }

  async tryAcquireOcrProcessing(
    id: string,
    allowedStatuses: readonly DocumentProcessingStatus[] = OCR_ACQUIRABLE_STATUSES
  ): Promise<boolean> {
    const prisma = this.prismaGetter();
    const result = await prisma.pdfDocument.updateMany({
      where: {
        id,
        status: { in: [...allowedStatuses] },
      },
      data: {
        status: 'PROCESSING',
        errorMessage: null,
      },
    });
    return result.count === 1;
  }

  async markExtractionCompleted(
    id: string,
    data: CompletePdfExtractionInput
  ): Promise<PdfDocument> {
    const prisma = this.prismaGetter();
    return prisma.pdfDocument.update({
      where: { id },
      data: {
        status: data.status,
        pageCount: data.pageCount,
        extractedText: data.extractedText,
        extractedCharCount: data.extractedCharCount,
        requiresOcr: data.requiresOcr,
        errorMessage: null,
        processedAt: data.processedAt,
      },
    });
  }

  async markFailed(
    id: string,
    sanitizedErrorMessage: string,
    processedAt: Date
  ): Promise<PdfDocument> {
    const prisma = this.prismaGetter();
    return prisma.pdfDocument.update({
      where: { id },
      data: {
        status: 'FAILED',
        errorMessage: sanitizedErrorMessage,
        processedAt,
      },
    });
  }

  async deleteById(id: string): Promise<void> {
    const prisma = this.prismaGetter();
    await prisma.pdfDocument.delete({
      where: { id },
    });
  }
}
