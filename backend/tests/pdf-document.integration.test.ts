import { describe, it, expect } from 'vitest';
import { getPrismaClient } from '../src/config/database.ts';
import { PdfDocumentService } from '../src/services/pdf-document.service.ts';
import { MinioObjectStorageService } from '../src/services/storage.service.ts';

/**
 * TESTES DE INTEGRAÇÃO REAL — PDF DOCUMENT + POSTGRESQL + MINIO
 *
 * Exercitam o armazenamento privado real no MinIO e a persistência real
 * de `PdfDocument` no PostgreSQL via Prisma ORM.
 * Ficam identificados como `skipped` quando PostgreSQL e MinIO reais não estão
 * ativos e configurados com `RUN_DB_INTEGRATION=true` e `RUN_MINIO_INTEGRATION=true`.
 */
const hasLivePostgresAndMinio =
  Boolean(process.env.DATABASE_URL) &&
  !process.env.DATABASE_URL?.includes('SEU_USUARIO') &&
  Boolean(process.env.MINIO_ACCESS_KEY) &&
  !process.env.MINIO_ACCESS_KEY?.includes('SEU_USUARIO') &&
  Boolean(process.env.MINIO_SECRET_KEY) &&
  !process.env.MINIO_SECRET_KEY?.includes('SUA_SENHA') &&
  process.env.RUN_DB_INTEGRATION === 'true' &&
  process.env.RUN_MINIO_INTEGRATION === 'true';

describe('Documentos PDF — Testes de Integração Real com PostgreSQL e MinIO', () => {
  it.skipIf(!hasLivePostgresAndMinio)(
    '[REQUER POSTGRESQL E MINIO ATIVOS] deve armazenar PDF privado no MinIO, extrair texto digital e persistir PdfDocument no PostgreSQL',
    async () => {
      const prisma = getPrismaClient();
      const storage = new MinioObjectStorageService();
      const service = new PdfDocumentService({ storageService: storage });
      const testEmail = `pdf.integration.${Date.now()}@questforge.dev`;

      const user = await prisma.user.create({
        data: {
          name: 'Usuário Integração PDF',
          email: testEmail,
          passwordHash: 'scrypt$16384$8$1$placeholder$placeholder',
        },
      });

      const samplePdfContent =
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [4 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>\nendobj\n5 0 obj\n<< /Length 75 >>\nstream\nBT /F1 12 Tf 50 700 Td (Questao de Integracao PostgreSQL e MinIO no QuestForge) Tj ET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000183 00000 n \n0000000311 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n436\n%%EOF\n';
      const pdfBuffer = Buffer.from(samplePdfContent, 'latin1');

      try {
        const created = await service.uploadAndProcessPdf(user.id, {
          originalName: 'integracao_minio_postgres.pdf',
          mimeType: 'application/pdf',
          sizeBytes: pdfBuffer.byteLength,
          buffer: pdfBuffer,
        });

        expect(created.status).toBe('COMPLETED');
        expect(created.requiresOcr).toBe(false);
        expect(created.extractedCharCount).toBeGreaterThan(20);
        expect('extractedText' in created).toBe(false);

        const persistedRecord = await prisma.pdfDocument.findUnique({
          where: { id: created.id },
        });
        expect(persistedRecord?.extractedText).toContain('Questao de Integracao');

        await service.deleteUserDocument(user.id, created.id);
      } finally {
        await prisma.user.deleteMany({ where: { id: user.id } });
      }
    }
  );
});
