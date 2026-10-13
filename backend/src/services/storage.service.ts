import crypto from 'node:crypto';
import { Client as MinioClient } from 'minio';
import { PdfDocumentDomainError } from '../types/pdf-document.types.ts';
import { logger } from '../utils/logger.ts';

export interface PutPrivateObjectInput {
  bucket?: string;
  objectKey: string;
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
}

export interface StoredPrivateObjectInfo {
  bucket: string;
  objectKey: string;
  etag?: string;
}

export interface IObjectStorageService {
  getDefaultBucket(): string;
  putPrivateObject(input: PutPrivateObjectInput): Promise<StoredPrivateObjectInfo>;
  getPrivateObjectBuffer(objectKey: string, bucket?: string): Promise<Buffer>;
  deletePrivateObject(objectKey: string, bucket?: string): Promise<void>;
  checkStorageHealth(): Promise<{
    status: 'up' | 'down' | 'unconfigured';
    bucket: string;
    message: string;
  }>;
}

export interface MinioStorageConfig {
  endPoint?: string;
  port?: number;
  useSSL?: boolean;
  accessKey?: string;
  secretKey?: string;
  bucket?: string;
}

/**
 * Gera uma chave de objeto privada e isolada por usuário para armazenamento no MinIO.
 * Impede colisão de nomes e qualquer tentativa de Path Traversal.
 */
export function buildPrivatePdfObjectKey(
  userId: string,
  documentId: string = crypto.randomUUID()
): string {
  const safeUser = userId.trim();
  const safeDoc = documentId.trim();

  if (
    !safeUser ||
    !safeDoc ||
    /[^a-zA-Z0-9_-]/.test(safeUser) ||
    /[^a-zA-Z0-9_-]/.test(safeDoc)
  ) {
    throw new PdfDocumentDomainError(
      'PDF_VALIDATION_ERROR',
      'Identificadores inválidos para geração da chave privada de armazenamento.',
      400
    );
  }

  return `users/${safeUser}/pdf/${safeDoc}.pdf`;
}

/**
 * Serviço de Armazenamento de Objetos Privado via MinIO (Sprint 3 — Etapa 3.1).
 *
 * Regras de segurança:
 * - Armazena objetos exclusivamente em bucket privado, sem política pública e sem URLs públicas permanentes.
 * - Não inventa credenciais: se `MINIO_ACCESS_KEY` ou `MINIO_SECRET_KEY` estiverem ausentes ou
 *   com placeholders de exemplo, falha honestamente com `STORAGE_UNAVAILABLE` (503).
 * - Nunca expõe chaves de acesso ou segredos em logs ou mensagens de erro.
 */
export class MinioObjectStorageService implements IObjectStorageService {
  private readonly endPoint: string;
  private readonly port: number;
  private readonly useSSL: boolean;
  private readonly accessKey: string | undefined;
  private readonly secretKey: string | undefined;
  private readonly bucket: string;
  private clientInstance: MinioClient | null = null;

  constructor(config: MinioStorageConfig = {}) {
    this.endPoint = config.endPoint ?? process.env.MINIO_ENDPOINT ?? 'localhost';
    this.port = config.port ?? (Number(process.env.MINIO_PORT) || 9000);
    this.useSSL =
      config.useSSL ?? (process.env.MINIO_USE_SSL?.toLowerCase() === 'true');
    this.accessKey = config.accessKey ?? process.env.MINIO_ACCESS_KEY;
    this.secretKey = config.secretKey ?? process.env.MINIO_SECRET_KEY;
    this.bucket = config.bucket ?? process.env.MINIO_BUCKET ?? 'questforge-documents';
  }

  getDefaultBucket(): string {
    return this.bucket;
  }

  private isConfigured(): boolean {
    if (!this.accessKey || !this.secretKey) return false;
    if (
      this.accessKey.includes('SEU_USUARIO') ||
      this.secretKey.includes('SUA_SENHA')
    ) {
      return false;
    }
    return true;
  }

  private getClientOrThrow(): MinioClient {
    if (!this.isConfigured()) {
      throw new PdfDocumentDomainError(
        'STORAGE_UNAVAILABLE',
        'Armazenamento MinIO não configurado. Defina MINIO_ACCESS_KEY e MINIO_SECRET_KEY no ambiente.',
        503
      );
    }

    if (!this.clientInstance) {
      this.clientInstance = new MinioClient({
        endPoint: this.endPoint,
        port: this.port,
        useSSL: this.useSSL,
        accessKey: this.accessKey!,
        secretKey: this.secretKey!,
      });
    }

    return this.clientInstance;
  }

  private async ensurePrivateBucket(client: MinioClient, bucketName: string): Promise<void> {
    const exists = await client.bucketExists(bucketName);
    if (!exists) {
      await client.makeBucket(bucketName);
    }
  }

  async putPrivateObject(input: PutPrivateObjectInput): Promise<StoredPrivateObjectInfo> {
    const client = this.getClientOrThrow();
    const targetBucket = input.bucket ?? this.bucket;

    try {
      await this.ensurePrivateBucket(client, targetBucket);
      const uploaded = await client.putObject(
        targetBucket,
        input.objectKey,
        input.buffer,
        input.sizeBytes,
        {
          'Content-Type': input.mimeType,
          'X-Amz-Meta-Visibility': 'private',
        }
      );

      return {
        bucket: targetBucket,
        objectKey: input.objectKey,
        etag: uploaded.etag,
      };
    } catch (error) {
      logger.error('minio_put_object_failed', {
        bucket: targetBucket,
        objectKey: input.objectKey,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });

      throw new PdfDocumentDomainError(
        'STORAGE_UNAVAILABLE',
        'Não foi possível armazenar o arquivo PDF no serviço de objetos privado (MinIO).',
        503
      );
    }
  }

  async getPrivateObjectBuffer(objectKey: string, bucket?: string): Promise<Buffer> {
    const client = this.getClientOrThrow();
    const targetBucket = bucket ?? this.bucket;

    try {
      const stream = await client.getObject(targetBucket, objectKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      logger.error('minio_get_object_failed', {
        bucket: targetBucket,
        objectKey,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });

      throw new PdfDocumentDomainError(
        'STORAGE_UNAVAILABLE',
        'Não foi possível recuperar o arquivo PDF no armazenamento privado.',
        503
      );
    }
  }

  async deletePrivateObject(objectKey: string, bucket?: string): Promise<void> {
    const client = this.getClientOrThrow();
    const targetBucket = bucket ?? this.bucket;

    try {
      await client.removeObject(targetBucket, objectKey);
    } catch (error) {
      logger.error('minio_delete_object_failed', {
        bucket: targetBucket,
        objectKey,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });

      throw new PdfDocumentDomainError(
        'STORAGE_UNAVAILABLE',
        'Não foi possível remover o objeto PDF do armazenamento privado.',
        503
      );
    }
  }

  async checkStorageHealth(): Promise<{
    status: 'up' | 'down' | 'unconfigured';
    bucket: string;
    message: string;
  }> {
    if (!this.isConfigured()) {
      return {
        status: 'unconfigured',
        bucket: this.bucket,
        message: 'Credenciais do MinIO ausentes ou com valores de placeholder.',
      };
    }

    try {
      const client = this.getClientOrThrow();
      await client.bucketExists(this.bucket);
      return {
        status: 'up',
        bucket: this.bucket,
        message: 'Conectividade com MinIO verificada com sucesso.',
      };
    } catch {
      return {
        status: 'down',
        bucket: this.bucket,
        message: 'Não foi possível estabelecer conexão com o servidor MinIO.',
      };
    }
  }
}
