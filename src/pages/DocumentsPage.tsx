import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Filter,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Navbar } from '../components/Navbar.tsx';
import { Footer } from '../components/Footer.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import {
  ApiHttpError,
  deletePdfDocument,
  fetchPdfDocumentById,
  fetchPdfDocuments,
  uploadPdfDocument,
} from '../services/api.ts';
import type {
  DocumentProcessingStatus,
  PaginatedPdfDocumentsResponse,
  PdfDocumentDTO,
} from '../types/index.ts';

export const MAX_CLIENT_PDF_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_CLIENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/x-pdf',
  '', // alguns navegadores/SOs podem omitir file.type quando selecionado via input
]);

const STATUS_LABELS: Record<DocumentProcessingStatus, string> = {
  UPLOADED: 'Recebido (Aguardando)',
  PROCESSING: 'Em Processamento',
  COMPLETED: 'Concluído (Texto Digital)',
  NEEDS_OCR: 'Requer OCR (Escaneado)',
  FAILED: 'Falha no Processamento',
};

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function validateClientPdfFile(file: File | null): string | null {
  if (!file) {
    return 'Selecione um arquivo PDF antes de iniciar o envio.';
  }

  const trimmedName = file.name.trim();
  if (!trimmedName.toLowerCase().endsWith('.pdf')) {
    return 'Formato inválido: selecione exclusivamente um arquivo com extensão .pdf.';
  }

  const normalizedMime = (file.type || '').trim().toLowerCase();
  if (!ALLOWED_CLIENT_MIME_TYPES.has(normalizedMime)) {
    return 'Tipo MIME inválido: envie exclusivamente arquivos application/pdf.';
  }

  if (file.size <= 0) {
    return 'O arquivo PDF selecionado está vazio (0 bytes).';
  }

  if (file.size > MAX_CLIENT_PDF_SIZE_BYTES) {
    return 'O arquivo PDF selecionado excede o tamanho máximo permitido de 20.0 MB.';
  }

  return null;
}

export function DocumentsPage() {
  const { status, sessionCheckError, refreshSession } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Estado do formulário de Upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadValidationError, setUploadValidationError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Estado de listagem e filtro por status
  const [draftStatusFilter, setDraftStatusFilter] = useState<DocumentProcessingStatus | ''>('');
  const [appliedStatusFilter, setAppliedStatusFilter] = useState<DocumentProcessingStatus | ''>('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [data, setData] = useState<PaginatedPdfDocumentsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Estado de consulta de detalhes (GET /api/documents/:id)
  const [inspectedDocument, setInspectedDocument] = useState<PdfDocumentDTO | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  // Estado de exclusão com confirmação explícita (DELETE /api/documents/:id)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadDocuments = useCallback(
    async (signal?: AbortSignal) => {
      if (status !== 'authenticated') return;

      setIsLoading(true);
      setLoadError(null);

      try {
        const result = await fetchPdfDocuments(
          {
            page: currentPage,
            limit: pageSize,
            status: appliedStatusFilter,
          },
          signal
        );
        if (signal?.aborted) return;
        setData(result);
      } catch (error) {
        if (signal?.aborted) return;
        if (error instanceof ApiHttpError && error.status === 401) {
          await refreshSession();
          return;
        }
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar os documentos PDF no momento.'
        );
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [status, currentPage, appliedStatusFilter, refreshSession]
  );

  useEffect(() => {
    if (status !== 'authenticated') return;
    const controller = new AbortController();
    loadDocuments(controller.signal);
    return () => controller.abort();
  }, [status, loadDocuments]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUploadValidationError(null);
    setUploadError(null);
    setUploadSuccess(null);

    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);

    if (file) {
      const validationMessage = validateClientPdfFile(file);
      if (validationMessage) {
        setUploadValidationError(validationMessage);
      }
    }
  };

  const handleClearSelectedFile = () => {
    setSelectedFile(null);
    setUploadValidationError(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isUploading) return;

    setUploadError(null);
    setUploadSuccess(null);
    setActionError(null);
    setActionSuccess(null);

    const validationMessage = validateClientPdfFile(selectedFile);
    if (validationMessage || !selectedFile) {
      setUploadValidationError(
        validationMessage ?? 'Selecione um arquivo PDF antes de iniciar o envio.'
      );
      return;
    }

    setUploadValidationError(null);
    setIsUploading(true);

    try {
      const uploadedDoc = await uploadPdfDocument(selectedFile);

      const statusDescription =
        uploadedDoc.status === 'COMPLETED'
          ? `Texto digital extraído (${uploadedDoc.extractedCharCount ?? 0} caracteres em ${uploadedDoc.pageCount ?? 0} páginas).`
          : uploadedDoc.status === 'NEEDS_OCR'
            ? 'PDF escaneado ou com camada textual insuficiente — sinalizado com requerimento de OCR.'
            : STATUS_LABELS[uploadedDoc.status];

      setUploadSuccess(
        `Upload concluído para "${uploadedDoc.originalName}". Status: ${statusDescription}`
      );
      setInspectedDocument(uploadedDoc);
      setInspectError(null);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      await loadDocuments();
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        await refreshSession();
        return;
      }
      setUploadError(
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar o arquivo PDF selecionado.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleApplyFilter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError(null);
    setActionSuccess(null);
    setCurrentPage(1);
    setAppliedStatusFilter(draftStatusFilter);
  };

  const handleClearFilter = () => {
    setActionError(null);
    setActionSuccess(null);
    setDraftStatusFilter('');
    setAppliedStatusFilter('');
    setCurrentPage(1);
  };

  const handleInspectDocument = async (documentId: string) => {
    setInspectError(null);
    setIsInspecting(true);

    try {
      const doc = await fetchPdfDocumentById(documentId);
      setInspectedDocument(doc);
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        await refreshSession();
        return;
      }
      setInspectError(
        error instanceof Error
          ? error.message
          : 'Não foi possível consultar os metadados deste documento PDF.'
      );
    } finally {
      setIsInspecting(false);
    }
  };

  const handleConfirmDelete = async (documentId: string) => {
    setActionError(null);
    setActionSuccess(null);
    setUploadSuccess(null);
    setDeletingId(documentId);

    try {
      const response = await deletePdfDocument(documentId);
      setConfirmDeleteId(null);
      setActionSuccess(response.message);
      if (inspectedDocument?.id === documentId) {
        setInspectedDocument(null);
      }
      await loadDocuments();
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        await refreshSession();
        return;
      }
      setActionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível excluir o documento PDF selecionado.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col justify-between">
      <Navbar />

      <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 flex-1">
        {status === 'loading' && (
          <div
            role="status"
            className="rounded-lg border border-neutral-800 bg-neutral-950 p-8 text-sm font-mono text-neutral-400"
          >
            Verificando sessão ativa junto ao servidor (GET /api/auth/me)...
          </div>
        )}

        {status === 'unauthenticated' && (
          <div className="mx-auto max-w-2xl rounded-lg border border-neutral-800 bg-neutral-950 p-6 sm:p-8 qf-animate-in">
            <p className="text-xs font-mono text-neutral-400">
              Acesso Restrito · Documentos PDF
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
              Autenticação necessária para gerenciar Documentos PDF
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Seus arquivos PDF de provas e apostilas são armazenados em bucket privado e
              isolados por usuário no PostgreSQL. Realize o login para enviar, consultar ou
              excluir documentos.
            </p>

            {sessionCheckError && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2.5 rounded-md border border-red-900/60 bg-red-950/20 p-3.5 text-xs text-red-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{sessionCheckError}</span>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/login"
                className="rounded-md bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-[#2563EB]"
              >
                Ir para o Login
              </Link>
              <Link
                to="/register"
                className="rounded-md border border-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
              >
                Criar conta
              </Link>
            </div>
          </div>
        )}

        {status === 'authenticated' && (
          <div className="space-y-8 qf-animate-in">
            {/* Cabeçalho da Página */}
            <div className="flex flex-col gap-4 border-b border-neutral-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                  Sprint 3 · Pipeline de Ingestão e Extração Digital
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Documentos PDF
                </h1>
                <p className="mt-1 text-sm text-neutral-400">
                  Envie provas e apostilas em PDF para armazenamento privado, extração de
                  texto digital e triagem automática de OCR.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => loadDocuments()}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Atualizar lista
                </button>
                <Link
                  to="/questions"
                  className="inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  Banco de Questões
                </Link>
              </div>
            </div>

            {/* Seção 1: Upload de PDF */}
            <section
              aria-labelledby="upload-pdf-heading"
              className="rounded-lg border border-neutral-800 bg-neutral-950 p-6"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2
                    id="upload-pdf-heading"
                    className="text-base font-semibold tracking-tight text-white"
                  >
                    Enviar Novo Documento PDF
                  </h2>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    Apenas arquivos <code>.pdf</code> (<code>application/pdf</code>) até 20.0
                    MB. O texto digital nativo é extraído automaticamente no envio.
                  </p>
                </div>
              </div>

              <form onSubmit={handleUploadSubmit} className="mt-4 space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="pdf-file-input"
                    className="block text-xs font-medium text-neutral-300"
                  >
                    Arquivo PDF (prova ou apostila) *
                  </label>
                  <div className="mt-1.5 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                      ref={fileInputRef}
                      id="pdf-file-input"
                      name="file"
                      type="file"
                      accept=".pdf,application/pdf"
                      disabled={isUploading}
                      onChange={handleFileChange}
                      className="block w-full text-sm text-neutral-300 file:mr-4 file:rounded-md file:border file:border-neutral-700 file:bg-[#0A0A0A] file:px-3.5 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-neutral-900 disabled:opacity-50 focus:outline-none"
                    />

                    <div className="flex items-center gap-2.5 shrink-0">
                      {selectedFile && !isUploading && (
                        <button
                          type="button"
                          onClick={handleClearSelectedFile}
                          className="rounded-md border border-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                        >
                          Limpar seleção
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={isUploading}
                        className="inline-flex items-center gap-2 rounded-md bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {isUploading ? 'Enviando e processando...' : 'Enviar PDF'}
                      </button>
                    </div>
                  </div>
                </div>

                {selectedFile && (
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-neutral-400">
                    <span>Arquivo selecionado:</span>
                    <strong className="text-neutral-200">{selectedFile.name}</strong>
                    <span aria-hidden="true">·</span>
                    <span>{formatFileSize(selectedFile.size)}</span>
                  </div>
                )}

                {uploadValidationError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-md border border-red-900/60 bg-red-950/20 p-3.5 text-xs text-red-200"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                    <span>{uploadValidationError}</span>
                  </div>
                )}

                {uploadError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-md border border-red-900/60 bg-red-950/20 p-3.5 text-xs text-red-200"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                    <span>{uploadError}</span>
                  </div>
                )}

                {uploadSuccess && (
                  <div
                    role="status"
                    className="rounded-md border border-neutral-700 bg-neutral-900/60 p-3.5 text-xs text-neutral-200"
                  >
                    {uploadSuccess}
                  </div>
                )}
              </form>
            </section>

            {/* Painel de Inspeção de Detalhes do Documento (GET /api/documents/:id) */}
            {(isInspecting || inspectError || inspectedDocument) && (
              <section
                aria-label="Detalhes do documento PDF selecionado"
                className="rounded-lg border border-neutral-800 bg-neutral-950 p-6"
              >
                <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                      Metadados e Diagnóstico de Extração · GET /api/documents/:id
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-white">
                      {inspectedDocument
                        ? inspectedDocument.originalName
                        : 'Inspecionando documento PDF'}
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setInspectedDocument(null);
                      setInspectError(null);
                    }}
                    aria-label="Fechar detalhes do documento"
                    className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                  >
                    <X className="h-3.5 w-3.5" />
                    Fechar detalhes
                  </button>
                </div>

                {isInspecting && (
                  <div
                    role="status"
                    className="mt-4 text-xs font-mono text-neutral-400"
                  >
                    Consultando metadados do documento (GET /api/documents/:id)...
                  </div>
                )}

                {inspectError && (
                  <div
                    role="alert"
                    className="mt-4 flex items-start gap-2.5 rounded-md border border-red-900/60 bg-red-950/20 p-3.5 text-xs text-red-200"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                    <span>{inspectError}</span>
                  </div>
                )}

                {!isInspecting && inspectedDocument && (
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                      <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-3.5">
                        <span className="text-neutral-400">Status de Processamento</span>
                        <p className="mt-1 font-mono text-sm text-white">
                          {STATUS_LABELS[inspectedDocument.status]} ({inspectedDocument.status})
                        </p>
                      </div>

                      <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-3.5">
                        <span className="text-neutral-400">Necessidade de OCR</span>
                        <p className="mt-1 font-mono text-sm text-white">
                          {inspectedDocument.requiresOcr
                            ? 'Sim — PDF escaneado ou sem texto digital suficiente'
                            : 'Não — Texto digital extraído nativamente'}
                        </p>
                      </div>

                      <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-3.5">
                        <span className="text-neutral-400">Páginas e Caracteres Extraídos</span>
                        <p className="mt-1 font-mono text-sm text-white tabular-nums">
                          {inspectedDocument.pageCount !== null
                            ? `${inspectedDocument.pageCount} ${inspectedDocument.pageCount === 1 ? 'página' : 'páginas'}`
                            : 'N/D'}{' '}
                          ·{' '}
                          {inspectedDocument.extractedCharCount !== null
                            ? `${inspectedDocument.extractedCharCount.toLocaleString('pt-BR')} caracteres`
                            : 'N/D'}
                        </p>
                      </div>

                      <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-3.5">
                        <span className="text-neutral-400">Tamanho e Tipo MIME</span>
                        <p className="mt-1 font-mono text-sm text-white tabular-nums">
                          {formatFileSize(inspectedDocument.sizeBytes)} (
                          {inspectedDocument.sizeBytes.toLocaleString('pt-BR')} bytes) ·{' '}
                          {inspectedDocument.mimeType}
                        </p>
                      </div>

                      <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-3.5">
                        <span className="text-neutral-400">ID do Documento</span>
                        <p className="mt-1 font-mono text-sm text-white tabular-nums">
                          {inspectedDocument.id}
                        </p>
                      </div>

                      <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-3.5">
                        <span className="text-neutral-400">Processado em</span>
                        <p className="mt-1 font-mono text-sm text-white tabular-nums">
                          {inspectedDocument.processedAt
                            ? new Date(inspectedDocument.processedAt).toLocaleString('pt-BR')
                            : 'Aguardando conclusão'}
                        </p>
                      </div>
                    </div>

                    <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-3.5 text-xs">
                      <span className="text-neutral-400">Checksum SHA-256 de Integridade</span>
                      <p className="mt-1 break-all font-mono text-neutral-200">
                        {inspectedDocument.checksumSha256}
                      </p>
                    </div>

                    {inspectedDocument.errorMessage && (
                      <div
                        role="alert"
                        className="rounded border border-red-900/60 bg-red-950/20 p-3.5 text-xs text-red-200"
                      >
                        <strong className="font-semibold text-white">
                          Motivo da falha de processamento:{' '}
                        </strong>
                        <span>{inspectedDocument.errorMessage}</span>
                      </div>
                    )}

                    <p className="text-xs font-mono text-neutral-400">
                      Armazenamento privado: chaves de objeto do MinIO e texto bruto extraído
                      permanecem restritos ao pipeline interno do servidor.
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* Filtro por Status */}
            <form
              onSubmit={handleApplyFilter}
              aria-label="Filtros de documentos PDF"
              className="rounded-lg border border-neutral-800 bg-neutral-950 p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="w-full sm:max-w-xs">
                  <label
                    htmlFor="filter-document-status"
                    className="flex items-center gap-2 text-xs font-medium text-neutral-300"
                  >
                    <Filter className="h-3.5 w-3.5 text-[#2563EB]" />
                    <span>Filtrar por status de processamento</span>
                  </label>
                  <select
                    id="filter-document-status"
                    value={draftStatusFilter}
                    onChange={(e) =>
                      setDraftStatusFilter(e.target.value as DocumentProcessingStatus | '')
                    }
                    className="mt-1.5 w-full rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                  >
                    <option value="">Todos os status</option>
                    <option value="COMPLETED">Concluído (Texto Digital)</option>
                    <option value="NEEDS_OCR">Requer OCR (Escaneado)</option>
                    <option value="PROCESSING">Em Processamento</option>
                    <option value="UPLOADED">Recebido (Aguardando)</option>
                    <option value="FAILED">Falha no Processamento</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleClearFilter}
                    className="rounded-md border border-neutral-800 px-3.5 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                  >
                    Limpar filtro
                  </button>
                  <button
                    type="submit"
                    className="rounded-md bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                  >
                    Aplicar filtro
                  </button>
                </div>
              </div>
            </form>

            {/* Feedback de exclusão */}
            {actionError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-md border border-red-900/60 bg-red-950/20 p-4 text-xs text-red-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{actionError}</span>
              </div>
            )}

            {actionSuccess && (
              <div
                role="status"
                className="rounded-md border border-neutral-700 bg-neutral-900/60 p-3.5 text-xs text-neutral-200"
              >
                {actionSuccess}
              </div>
            )}

            {/* Estado de Carregamento */}
            {isLoading && (
              <div
                role="status"
                className="rounded-lg border border-neutral-800 bg-neutral-950 p-8 text-center text-sm font-mono text-neutral-400"
              >
                Carregando documentos PDF de GET /api/documents...
              </div>
            )}

            {/* Estado de Erro / Indisponibilidade */}
            {!isLoading && loadError && (
              <div
                role="alert"
                className="rounded-lg border border-red-900/60 bg-red-950/20 p-6 text-sm text-red-200"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                  <div className="space-y-2">
                    <p className="font-semibold text-white">
                      Falha ao consultar os documentos PDF
                    </p>
                    <p className="text-xs text-red-200/90">{loadError}</p>
                    <button
                      type="button"
                      onClick={() => loadDocuments()}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-red-800/80 bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                    >
                      Tentar novamente
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Estado Vazio */}
            {!isLoading && !loadError && data && data.items.length === 0 && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-10 text-center">
                <FileText className="mx-auto h-8 w-8 text-neutral-500" />
                <h2 className="mt-3 text-lg font-semibold text-white">
                  Nenhum documento PDF encontrado
                </h2>
                <p className="mx-auto mt-1 max-w-md text-xs text-neutral-400">
                  Não há documentos PDF registrados para os critérios selecionados. Utilize o
                  formulário acima para enviar sua primeira prova ou apostila em PDF.
                </p>
              </div>
            )}

            {/* Lista Paginada de Documentos PDF */}
            {!isLoading && !loadError && data && data.items.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs font-mono text-neutral-400">
                  <span>
                    Total: <strong className="text-white">{data.total}</strong>{' '}
                    {data.total === 1 ? 'documento encontrado' : 'documentos encontrados'}
                  </span>
                  <span>
                    Página <strong className="text-white">{data.currentPage}</strong> de{' '}
                    <strong className="text-white">{data.totalPages}</strong>
                  </span>
                </div>

                <ul className="space-y-4" aria-label="Lista de documentos PDF">
                  {data.items.map((doc) => (
                    <li
                      key={doc.id}
                      className="rounded-lg border border-neutral-800 bg-neutral-950 p-5 transition-colors hover:border-neutral-700"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-900 pb-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-[#2563EB]" />
                          <span className="font-semibold text-white">
                            {doc.originalName}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-neutral-400">
                          <span className="text-neutral-200">
                            {STATUS_LABELS[doc.status]}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatFileSize(doc.sizeBytes)}</span>
                          {doc.pageCount !== null && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                {doc.pageCount}{' '}
                                {doc.pageCount === 1 ? 'página' : 'páginas'}
                              </span>
                            </>
                          )}
                          {doc.extractedCharCount !== null && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                {doc.extractedCharCount.toLocaleString('pt-BR')} caracteres
                                extraídos
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 space-y-1.5 text-xs text-neutral-400">
                        {doc.status === 'COMPLETED' && (
                          <p>
                            Camada de texto digital extraída com sucesso e persistida para as
                            próximas etapas.
                          </p>
                        )}
                        {doc.status === 'NEEDS_OCR' && (
                          <p className="text-amber-300/90">
                            PDF escaneado ou com densidade de texto digital insuficiente —
                            marcado automaticamente para OCR (<code>requiresOcr: true</code>).
                          </p>
                        )}
                        {doc.status === 'FAILED' && (
                          <p className="text-red-300">
                            Falha no processamento:{' '}
                            {doc.errorMessage ??
                              'Não foi possível concluir a leitura estrutural do PDF.'}
                          </p>
                        )}
                        {(doc.status === 'UPLOADED' || doc.status === 'PROCESSING') && (
                          <p>Documento recebido e em fila de processamento digital.</p>
                        )}

                        <p className="font-mono text-[11px] text-neutral-500">
                          Enviado em {new Date(doc.createdAt).toLocaleString('pt-BR')}
                          {doc.processedAt
                            ? ` · Processado em ${new Date(doc.processedAt).toLocaleString('pt-BR')}`
                            : ''}
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-900 pt-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleInspectDocument(doc.id)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                          >
                            <Eye className="h-3.5 w-3.5 text-[#2563EB]" />
                            Ver detalhes
                          </button>
                        </div>

                        {confirmDeleteId === doc.id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-neutral-300">
                              Confirmar exclusão permanente?
                            </span>
                            <button
                              type="button"
                              disabled={deletingId === doc.id}
                              onClick={() => handleConfirmDelete(doc.id)}
                              className="rounded-md bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                            >
                              {deletingId === doc.id
                                ? 'Excluindo...'
                                : 'Confirmar exclusão'}
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === doc.id}
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(doc.id)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-[#0A0A0A] px-3 py-1.5 text-xs font-medium text-neutral-400 transition-colors hover:border-red-900/60 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Excluir
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Controles de Paginação Real */}
                <nav
                  aria-label="Paginação de documentos PDF"
                  className="flex items-center justify-between border-t border-neutral-800 pt-4"
                >
                  <button
                    type="button"
                    disabled={data.currentPage <= 1 || isLoading}
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Página anterior
                  </button>

                  <span className="text-xs font-mono text-neutral-400">
                    Página {data.currentPage} de {data.totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={data.currentPage >= data.totalPages || isLoading}
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(data.totalPages, prev + 1))
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                  >
                    Próxima página
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </nav>
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
