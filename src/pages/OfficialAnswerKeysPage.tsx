import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  ExternalLink,
  FileCheck,
  FileSpreadsheet,
  FileText,
  History,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import { Navbar } from '../components/Navbar.tsx';
import { Footer } from '../components/Footer.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import {
  ApiHttpError,
  addOfficialAnswerKeyItem,
  createOfficialAnswerKeyDraft,
  deleteOfficialAnswerKeyDraft,
  fetchCurrentOfficialAnswerKeyByExamId,
  fetchOfficialAnswerKeyById,
  fetchOfficialAnswerKeyVersions,
  publishOfficialAnswerKey,
  replaceOfficialAnswerKeyItems,
  updateOfficialAnswerKeyDraft,
  updateOfficialAnswerKeyItem,
} from '../services/api.ts';
import type {
  CreateOfficialAnswerKeyDraftPayload,
  CreateOfficialAnswerKeyItemPayload,
  OfficialAnswerKeyDTO,
  OfficialAnswerKeyItemDTO,
  OfficialAnswerKeyItemStatus,
  OfficialAnswerKeyStatus,
  OfficialAnswerKeyType,
  PublishOfficialAnswerKeyPayload,
  UpdateOfficialAnswerKeyDraftPayload,
  UpdateOfficialAnswerKeyItemPayload,
} from '../types/index.ts';

const TYPE_LABELS: Record<OfficialAnswerKeyType, string> = {
  PRELIMINARY: 'Preliminar',
  FINAL: 'Definitivo',
  RECTIFIED: 'Retificado',
};

const STATUS_LABELS: Record<OfficialAnswerKeyStatus, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado (Vigente)',
  SUPERSEDED: 'Substituído (Histórico)',
  ARCHIVED: 'Arquivado',
};

const ITEM_STATUS_LABELS: Record<OfficialAnswerKeyItemStatus, string> = {
  ACTIVE: 'Ativo',
  ANNULLED: 'Anulada',
  CHANGED: 'Alterada',
  NEEDS_REVIEW: 'Requer Revisão',
};

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

export function OfficialAnswerKeysPage(): ReactElement {
  const { status, sessionCheckError, refreshSession } = useAuth();

  // Controle de requisições assíncronas e isolamento por prova
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeExamIdRef = useRef<string | null>(null);

  // 1. Identificação da Prova
  const [examIdInput, setExamIdInput] = useState('');
  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const [examValidationError, setExamValidationError] = useState<string | null>(null);

  // 2. Gabarito em visualização e histórico de versões
  const [currentAnswerKey, setCurrentAnswerKey] = useState<OfficialAnswerKeyDTO | null>(null);
  const [selectedAnswerKey, setSelectedAnswerKey] = useState<OfficialAnswerKeyDTO | null>(null);
  const [versions, setVersions] = useState<OfficialAnswerKeyDTO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [publishConflictError, setPublishConflictError] = useState<string | null>(null);

  // Erros específicos de modais
  const [modalError, setModalError] = useState<string | null>(null);
  const [batchModalError, setBatchModalError] = useState<string | null>(null);

  // 3. Modais e Ações
  const [isCreateDraftModalOpen, setIsCreateDraftModalOpen] = useState(false);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OfficialAnswerKeyItemDTO | null>(null);
  const [isReplaceBatchModalOpen, setIsReplaceBatchModalOpen] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isConfirmDeleteModalOpen, setIsConfirmDeleteModalOpen] = useState(false);
  const [isEditMetadataModalOpen, setIsEditMetadataModalOpen] = useState(false);

  // 4. Estados de envio (loading / disabled)
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 5. Formulários internos
  // Formulário: Criar Rascunho
  const [draftType, setDraftType] = useState<OfficialAnswerKeyType>('PRELIMINARY');
  const [draftVersion, setDraftVersion] = useState<number>(1);
  const [draftNotes, setDraftNotes] = useState('');
  const [draftPdfId, setDraftPdfId] = useState('');

  // Formulário: Adicionar Item
  const [itemQuestionNumber, setItemQuestionNumber] = useState<number>(1);
  const [itemCorrectAnswer, setItemCorrectAnswer] = useState('');
  const [itemStatus, setItemStatus] = useState<OfficialAnswerKeyItemStatus>('ACTIVE');
  const [itemIsAnnulled, setItemIsAnnulled] = useState(false);
  const [itemPreviousAnswer, setItemPreviousAnswer] = useState('');
  const [itemJustification, setItemJustification] = useState('');
  const [itemTextEvidence, setItemTextEvidence] = useState('');
  const [itemConfidence, setItemConfidence] = useState<string>('');
  const [itemSourcePage, setItemSourcePage] = useState<string>('');

  // Formulário: Edição de Metadados
  const [editNotes, setEditNotes] = useState('');
  const [editType, setEditType] = useState<OfficialAnswerKeyType>('PRELIMINARY');
  const [editVersion, setEditVersion] = useState<number>(1);

  // Formulário: Substituição em Lote
  const [batchRawInput, setBatchRawInput] = useState('');
  const [batchParsingError, setBatchParsingError] = useState<string | null>(null);

  // Formulário: Publicação
  const [publishConfirmAll, setPublishConfirmAll] = useState(false);

  // Limpeza de tarefas assíncronas ao desmontar o componente
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Limpeza de estado caso o usuário perca autenticação
  useEffect(() => {
    if (status !== 'authenticated') {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setActiveExamId(null);
      activeExamIdRef.current = null;
      setCurrentAnswerKey(null);
      setSelectedAnswerKey(null);
      setVersions([]);
      setLoadError(null);
      setActionError(null);
      setActionSuccess(null);
      setPublishConflictError(null);
      setModalError(null);
      setBatchModalError(null);
    }
  }, [status]);

  // --------------------------------------------------------------------------
  // Carregamento de dados da prova ativa
  // --------------------------------------------------------------------------
  const loadExamAnswerKeys = useCallback(
    async (examId: string, preferredAnswerKeyId?: string, signal?: AbortSignal) => {
      if (status !== 'authenticated') return;

      setIsLoading(true);
      setLoadError(null);
      setActionError(null);
      setPublishConflictError(null);

      try {
        // 1. Consulta gabarito vigente da prova
        const currentResult = await fetchCurrentOfficialAnswerKeyByExamId(
          examId,
          { includeItems: true, signal }
        );

        if (signal?.aborted || activeExamIdRef.current !== examId) return;

        // 2. Consulta histórico de versões da prova
        const versionsResult = await fetchOfficialAnswerKeyVersions(examId, {}, signal);

        if (signal?.aborted || activeExamIdRef.current !== examId) return;

        setCurrentAnswerKey(currentResult);
        setVersions(versionsResult);

        // Determina qual gabarito manter selecionado na visualização
        if (preferredAnswerKeyId) {
          // Se foi especificado um ID preferencial (ex.: rascunho recém-criado), consulta-o com itens
          const specific = await fetchOfficialAnswerKeyById(preferredAnswerKeyId, {
            includeItems: true,
            signal,
          });
          if (signal?.aborted || activeExamIdRef.current !== examId) return;
          setSelectedAnswerKey(specific);
        } else if (currentResult) {
          setSelectedAnswerKey(currentResult);
        } else if (versionsResult.length > 0) {
          // Se não houver vigente mas houver rascunhos ou versões anteriores, seleciona a primeira
          const first = await fetchOfficialAnswerKeyById(versionsResult[0].id, {
            includeItems: true,
            signal,
          });
          if (signal?.aborted || activeExamIdRef.current !== examId) return;
          setSelectedAnswerKey(first);
        } else {
          setSelectedAnswerKey(null);
        }
      } catch (error) {
        if (signal?.aborted || activeExamIdRef.current !== examId) return;
        if (error instanceof ApiHttpError && error.status === 401) {
          await refreshSession();
          return;
        }
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar os gabaritos da prova informada.'
        );
      } finally {
        if (!signal?.aborted && activeExamIdRef.current === examId) {
          setIsLoading(false);
        }
      }
    },
    [status, refreshSession]
  );

  const handleSelectExam = (e: FormEvent) => {
    e.preventDefault();
    const cleanId = examIdInput.trim();
    if (!cleanId) {
      setExamValidationError('Informe o identificador único (UUID) da prova.');
      return;
    }
    if (!isValidUuid(cleanId)) {
      setExamValidationError('O identificador deve ser um UUID válido (ex: 123e4567-e89b-12d3-a456-426614174000).');
      return;
    }

    setExamValidationError(null);

    // Cancelar qualquer requisição pendente anterior
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Limpar imediatamente os dados da prova anterior para evitar dados residuais
    setCurrentAnswerKey(null);
    setSelectedAnswerKey(null);
    setVersions([]);
    setLoadError(null);
    setActionError(null);
    setActionSuccess(null);
    setPublishConflictError(null);
    setModalError(null);
    setBatchModalError(null);

    setActiveExamId(cleanId);
    activeExamIdRef.current = cleanId;

    loadExamAnswerKeys(cleanId, undefined, controller.signal);
  };

  const handleSelectVersion = async (versionKey: OfficialAnswerKeyDTO) => {
    setIsLoading(true);
    setActionError(null);
    setPublishConflictError(null);
    try {
      const full = await fetchOfficialAnswerKeyById(versionKey.id, {
        includeItems: true,
      });
      setSelectedAnswerKey(full);
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        await refreshSession();
        return;
      }
      setActionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar a versão selecionada.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Criação de Novo Rascunho (POST /api/official-answer-keys)
  // --------------------------------------------------------------------------
  const openCreateDraftModal = () => {
    const nextVersion = versions.length > 0 ? Math.max(...versions.map((v) => v.version)) + 1 : 1;
    setDraftVersion(nextVersion);
    setDraftType('PRELIMINARY');
    setDraftNotes('');
    setDraftPdfId('');
    setIsCreateDraftModalOpen(true);
    setActionError(null);
  };

  const handleCreateDraft = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeExamId) return;

    setIsSubmitting(true);
    setActionError(null);

    const payload: CreateOfficialAnswerKeyDraftPayload = {
      examId: activeExamId,
      type: draftType,
      version: draftVersion,
      notes: draftNotes.trim() ? draftNotes.trim() : null,
      pdfDocumentId: draftPdfId.trim() ? draftPdfId.trim() : null,
      items: [],
    };

    try {
      const created = await createOfficialAnswerKeyDraft(payload);
      setIsCreateDraftModalOpen(false);
      setActionSuccess(`Rascunho de gabarito (v${created.version} - ${TYPE_LABELS[created.type]}) criado com sucesso.`);
      // Recarrega e foca no rascunho recém-criado
      await loadExamAnswerKeys(activeExamId, created.id);
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        await refreshSession();
        return;
      }
      setActionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível criar o rascunho de gabarito.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // Edição de Metadados do Rascunho (PATCH /api/official-answer-keys/:id)
  // --------------------------------------------------------------------------
  const openEditMetadataModal = () => {
    if (!selectedAnswerKey || selectedAnswerKey.status !== 'DRAFT') return;
    setEditNotes(selectedAnswerKey.notes ?? '');
    setEditType(selectedAnswerKey.type);
    setEditVersion(selectedAnswerKey.version);
    setIsEditMetadataModalOpen(true);
  };

  const handleUpdateMetadata = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedAnswerKey || selectedAnswerKey.status !== 'DRAFT' || !activeExamId) return;

    setIsSubmitting(true);
    setActionError(null);

    const payload: UpdateOfficialAnswerKeyDraftPayload = {
      type: editType,
      version: editVersion,
      notes: editNotes.trim() ? editNotes.trim() : null,
    };

    try {
      const updated = await updateOfficialAnswerKeyDraft(selectedAnswerKey.id, payload);
      setIsEditMetadataModalOpen(false);
      setActionSuccess('Metadados do rascunho atualizados com sucesso.');
      setSelectedAnswerKey({ ...selectedAnswerKey, ...updated });
      await loadExamAnswerKeys(activeExamId, selectedAnswerKey.id);
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        await refreshSession();
        return;
      }
      setActionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar os metadados do rascunho.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // Adicionar Item Individual (POST /api/official-answer-keys/:id/items)
  // --------------------------------------------------------------------------
  const openAddItemModal = () => {
    if (!selectedAnswerKey || selectedAnswerKey.status !== 'DRAFT') return;
    const existingItems = selectedAnswerKey.items ?? [];
    const nextNumber = existingItems.length > 0 ? Math.max(...existingItems.map((i) => i.questionNumber)) + 1 : 1;
    setItemQuestionNumber(nextNumber);
    setItemCorrectAnswer('');
    setItemStatus('ACTIVE');
    setItemIsAnnulled(false);
    setItemPreviousAnswer('');
    setItemJustification('');
    setItemTextEvidence('');
    setItemConfidence('');
    setItemSourcePage('');
    setIsAddItemModalOpen(true);
  };

  const handleAddItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedAnswerKey || selectedAnswerKey.status !== 'DRAFT') return;

    setIsSubmitting(true);
    setActionError(null);

    const isAnnulledVal = itemStatus === 'ANNULLED';
    const payload: CreateOfficialAnswerKeyItemPayload = {
      questionNumber: Number(itemQuestionNumber),
      correctAnswer: isAnnulledVal ? null : itemCorrectAnswer.trim().toUpperCase() || null,
      previousAnswer: itemPreviousAnswer.trim().toUpperCase() || null,
      status: itemStatus,
      isAnnulled: isAnnulledVal,
      justification: itemJustification.trim() || null,
      textEvidence: itemTextEvidence.trim() || null,
      confidence: itemConfidence ? Number(itemConfidence) : null,
      sourcePage: itemSourcePage ? Number(itemSourcePage) : null,
    };

    try {
      const added = await addOfficialAnswerKeyItem(selectedAnswerKey.id, payload);
      setIsAddItemModalOpen(false);
      setActionSuccess(`Item da questão ${added.questionNumber} adicionado com sucesso.`);
      // Atualiza o estado local do gabarito
      const updatedItems = [...(selectedAnswerKey.items ?? []), added].sort(
        (a, b) => a.questionNumber - b.questionNumber
      );
      setSelectedAnswerKey({ ...selectedAnswerKey, items: updatedItems });
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        await refreshSession();
        return;
      }
      setActionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível adicionar o item ao rascunho.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // Editar Item Individual (PATCH /api/official-answer-keys/:id/items/:questionNumber)
  // --------------------------------------------------------------------------
  const openEditItemModal = (item: OfficialAnswerKeyItemDTO) => {
    if (!selectedAnswerKey || selectedAnswerKey.status !== 'DRAFT') return;
    setEditingItem(item);
    setItemCorrectAnswer(item.correctAnswer ?? '');
    setItemStatus(item.status);
    setItemIsAnnulled(item.isAnnulled);
    setItemPreviousAnswer(item.previousAnswer ?? '');
    setItemJustification(item.justification ?? '');
    setItemTextEvidence(item.textEvidence ?? '');
    setItemConfidence(item.confidence !== null ? String(item.confidence) : '');
    setItemSourcePage(item.sourcePage !== null ? String(item.sourcePage) : '');
  };

  const handleUpdateItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedAnswerKey || selectedAnswerKey.status !== 'DRAFT' || !editingItem) return;

    setIsSubmitting(true);
    setActionError(null);

    const isAnnulledVal = itemStatus === 'ANNULLED';
    const payload: UpdateOfficialAnswerKeyItemPayload = {
      correctAnswer: isAnnulledVal ? null : itemCorrectAnswer.trim().toUpperCase() || null,
      previousAnswer: itemPreviousAnswer.trim().toUpperCase() || null,
      status: itemStatus,
      isAnnulled: isAnnulledVal,
      justification: itemJustification.trim() || null,
      textEvidence: itemTextEvidence.trim() || null,
      confidence: itemConfidence ? Number(itemConfidence) : null,
      sourcePage: itemSourcePage ? Number(itemSourcePage) : null,
    };

    try {
      const updated = await updateOfficialAnswerKeyItem(
        selectedAnswerKey.id,
        editingItem.questionNumber,
        payload
      );
      setEditingItem(null);
      setActionSuccess(`Item da questão ${updated.questionNumber} atualizado com sucesso.`);
      // Atualiza localmente o item no gabarito
      const updatedItems = (selectedAnswerKey.items ?? []).map((i) =>
        i.questionNumber === updated.questionNumber ? updated : i
      );
      setSelectedAnswerKey({ ...selectedAnswerKey, items: updatedItems });
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        await refreshSession();
        return;
      }
      setActionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar o item.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // Substituição em Lote (PUT /api/official-answer-keys/:id/items)
  // --------------------------------------------------------------------------
  const openReplaceBatchModal = () => {
    if (!selectedAnswerKey || selectedAnswerKey.status !== 'DRAFT') return;
    setBatchRawInput('');
    setBatchParsingError(null);
    setBatchModalError(null);
    setIsReplaceBatchModalOpen(true);
  };

  const parseBatchItems = (text: string): CreateOfficialAnswerKeyItemPayload[] => {
    const lines = text.split('\n');
    const items: CreateOfficialAnswerKeyItemPayload[] = [];
    const seen = new Set<number>();

    for (let idx = 0; idx < lines.length; idx++) {
      const rawLine = lines[idx].trim();
      if (!rawLine || rawLine.startsWith('#')) continue;

      // Padrões aceitos: "1: A", "1 - A", "1 A", "1=A", "1: ANULADA"
      const match = rawLine.match(/^(\d+)[\s:\-=\t]+([A-Za-z0-9]+|ANULADA|ANULADO|NEEDS_REVIEW)$/i);
      if (!match) {
        throw new Error(
          `Linha ${idx + 1} inválida: "${rawLine}". Use o formato "1: A" ou "1: ANULADA".`
        );
      }

      const qNum = parseInt(match[1], 10);
      const val = match[2].toUpperCase().trim();

      if (seen.has(qNum)) {
        throw new Error(`Número de questão duplicado: ${qNum} na linha ${idx + 1}.`);
      }
      seen.add(qNum);

      if (val === 'ANULADA' || val === 'ANULADO') {
        items.push({
          questionNumber: qNum,
          correctAnswer: null,
          status: 'ANNULLED',
          isAnnulled: true,
        });
      } else if (val === 'NEEDS_REVIEW') {
        items.push({
          questionNumber: qNum,
          correctAnswer: null,
          status: 'NEEDS_REVIEW',
          isAnnulled: false,
        });
      } else {
        items.push({
          questionNumber: qNum,
          correctAnswer: val,
          status: 'ACTIVE',
          isAnnulled: false,
        });
      }
    }

    if (items.length === 0) {
      throw new Error('Nenhum item válido encontrado no texto fornecido.');
    }

    return items;
  };

  const handleReplaceBatch = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedAnswerKey || selectedAnswerKey.status !== 'DRAFT') return;

    setBatchParsingError(null);
    setBatchModalError(null);
    let itemsToReplace: CreateOfficialAnswerKeyItemPayload[];
    try {
      itemsToReplace = parseBatchItems(batchRawInput);
    } catch (parseErr) {
      setBatchParsingError(parseErr instanceof Error ? parseErr.message : 'Erro ao processar itens.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    try {
      const replaced = await replaceOfficialAnswerKeyItems(selectedAnswerKey.id, {
        items: itemsToReplace,
      });
      setIsReplaceBatchModalOpen(false);
      setActionSuccess(`Todos os itens (${replaced.length}) foram substituídos com sucesso.`);
      setSelectedAnswerKey({ ...selectedAnswerKey, items: replaced });
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        await refreshSession();
        return;
      }
      const msg =
        error instanceof Error
          ? error.message
          : 'Não foi possível substituir os itens do gabarito.';
      setBatchModalError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // Exclusão de Rascunho (DELETE /api/official-answer-keys/:id)
  // --------------------------------------------------------------------------
  const handleDeleteDraft = async () => {
    if (!selectedAnswerKey || selectedAnswerKey.status !== 'DRAFT' || !activeExamId) return;

    setIsSubmitting(true);
    setActionError(null);

    try {
      await deleteOfficialAnswerKeyDraft(selectedAnswerKey.id);
      setIsConfirmDeleteModalOpen(false);
      setActionSuccess('Rascunho de gabarito excluído com sucesso.');
      // Recarrega o estado da prova
      await loadExamAnswerKeys(activeExamId);
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) {
        await refreshSession();
        return;
      }
      setActionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível excluir o rascunho.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // Publicação Atômica (POST /api/official-answer-keys/:id/publish)
  // --------------------------------------------------------------------------
  const openPublishModal = () => {
    if (!selectedAnswerKey || selectedAnswerKey.status !== 'DRAFT') return;
    setPublishConfirmAll(false);
    setPublishConflictError(null);
    setIsPublishModalOpen(true);
  };

  const handlePublish = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedAnswerKey || selectedAnswerKey.status !== 'DRAFT' || !activeExamId) return;

    setIsSubmitting(true);
    setActionError(null);
    setPublishConflictError(null);

    const payload: PublishOfficialAnswerKeyPayload = {
      confirmAllReviewed: publishConfirmAll,
      syncQuestionAnswers: true,
    };

    try {
      const published = await publishOfficialAnswerKey(selectedAnswerKey.id, payload);
      setIsPublishModalOpen(false);
      setActionSuccess(`Gabarito oficial v${published.version} publicado com sucesso e tornado vigente!`);
      // Recarrega dados com a nova versão vigente
      await loadExamAnswerKeys(activeExamId, published.id);
    } catch (error) {
      if (error instanceof ApiHttpError) {
        if (error.status === 401) {
          await refreshSession();
          return;
        }
        if (error.status === 409) {
          // Conflito de publicação concorrente mapeado
          setPublishConflictError(
            'Conflito de publicação concorrente: outra versão deste gabarito oficial foi ativada simultaneamente. Recarregue os dados mais recentes antes de tentar novamente.'
          );
          setIsPublishModalOpen(false);
          return;
        }
      }
      setActionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível publicar o gabarito oficial.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Análise de pendências de publicação do gabarito atual
  const items = selectedAnswerKey?.items ?? [];
  const needsReviewCount = items.filter((i) => i.status === 'NEEDS_REVIEW').length;
  const missingAnswerCount = items.filter(
    (i) => !i.isAnnulled && i.status !== 'ANNULLED' && (!i.correctAnswer || i.correctAnswer.trim() === '')
  ).length;
  const isDraft = selectedAnswerKey?.status === 'DRAFT';
  const canPublish = isDraft && items.length > 0 && needsReviewCount === 0 && missingAnswerCount === 0;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-neutral-100 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
              Acesso Restrito · Gabaritos Oficiais
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
              Autenticação necessária para gerenciar Gabaritos Oficiais
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Os gabaritos oficiais, rascunhos e histórico de versões são isolados por usuário no PostgreSQL.
              Realize o login para consultar, editar ou publicar gabaritos oficiais.
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
          <div className="space-y-6">
            {/* Cabeçalho da Página */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-neutral-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-7 w-7 text-[#2563EB]" />
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Gabaritos Oficiais
              </h1>
            </div>
            <p className="mt-1 text-sm text-neutral-400">
              Gerencie, versione e publique os gabaritos oficiais das provas com controle transacional e vigência atômica.
            </p>
          </div>

          {activeExamId && isDraft && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={openPublishModal}
                disabled={!canPublish || isSubmitting}
                className="inline-flex items-center gap-2 rounded-md bg-[#2563EB] px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#2563EB]"
              >
                <CheckCircle2 className="h-4 w-4" />
                Publicar Gabarito
              </button>
            </div>
          )}
        </div>

        {/* 1. Seleção / Identificação da Prova (Exam ID) */}
        <section aria-labelledby="exam-selection-title" className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900/60 p-5">
          <h2 id="exam-selection-title" className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">
            Identificação da Prova
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            Informe o UUID da prova para carregar o gabarito vigente, histórico de versões e rascunhos associados.
          </p>

          <form onSubmit={handleSelectExam} className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 relative">
              <input
                id="examId-input"
                name="examId"
                type="text"
                placeholder="Exemplo: 22222222-2222-4222-8222-222222222222"
                value={examIdInput}
                onChange={(e) => {
                  setExamIdInput(e.target.value);
                  setExamValidationError(null);
                }}
                className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-sm text-white placeholder-neutral-500 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
            >
              <Search className="h-4 w-4" />
              {isLoading ? 'Consultando...' : 'Consultar Prova'}
            </button>
          </form>

          {examValidationError && (
            <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {examValidationError}
            </p>
          )}

          {activeExamId && (
            <div className="mt-3 flex items-center justify-between text-xs text-neutral-400 border-t border-neutral-800/80 pt-2.5">
              <span>
                Prova em consulta: <code className="text-neutral-200 bg-neutral-950 px-1.5 py-0.5 rounded">{activeExamId}</code>
              </span>
              <button
                type="button"
                onClick={() => loadExamAnswerKeys(activeExamId)}
                className="inline-flex items-center gap-1 text-neutral-400 hover:text-white transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
            </div>
          )}
        </section>

        {/* Banners de Notificação (Sucesso, Conflito, Erro) */}
        {actionSuccess && (
          <div role="status" className="mt-4 rounded-md border border-emerald-900/60 bg-emerald-950/40 p-4 text-sm text-emerald-300 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
              <span>{actionSuccess}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionSuccess(null)}
              className="text-emerald-400 hover:text-white"
              aria-label="Fechar notificação de sucesso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {publishConflictError && (
          <div role="alert" className="mt-4 rounded-md border border-amber-900/60 bg-amber-950/40 p-4 text-sm text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
              <span>{publishConflictError}</span>
            </div>
            {activeExamId && (
              <button
                type="button"
                onClick={() => {
                  setPublishConflictError(null);
                  loadExamAnswerKeys(activeExamId);
                }}
                className="whitespace-nowrap rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-500 transition-colors"
              >
                Recarregar Dados Recentes
              </button>
            )}
          </div>
        )}

        {actionError && (
          <div role="alert" className="mt-4 rounded-md border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-300 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
              <span>{actionError}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-red-400 hover:text-white"
              aria-label="Fechar notificação de erro"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {loadError && (
          <div role="alert" className="mt-4 rounded-md border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-300 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
            <span>{loadError}</span>
          </div>
        )}

        {/* 2. Conteúdo Principal após Seleção da Prova */}
        {!activeExamId ? (
          <div className="mt-12 text-center rounded-lg border border-dashed border-neutral-800 p-12">
            <FileSpreadsheet className="mx-auto h-12 w-12 text-neutral-600" />
            <h3 className="mt-3 text-base font-medium text-white">Nenhuma prova selecionada</h3>
            <p className="mt-1 text-sm text-neutral-400 max-w-md mx-auto">
              Digite o identificador único da prova acima para acessar o painel de gabaritos oficiais correspondentes.
            </p>
          </div>
        ) : isLoading && !selectedAnswerKey ? (
          <div className="mt-12 text-center py-12">
            <RefreshCw className="mx-auto h-8 w-8 text-[#2563EB] animate-spin" />
            <p className="mt-3 text-sm text-neutral-400">Carregando gabaritos da prova...</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Coluna Lateral: Histórico de Versões e Criação de Rascunho */}
            <aside aria-label="Histórico de versões do gabarito" className="lg:col-span-1 space-y-4">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                  <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                    <History className="h-4 w-4 text-neutral-400" />
                    Versões ({versions.length})
                  </h3>
                  <button
                    type="button"
                    onClick={openCreateDraftModal}
                    className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Novo Rascunho
                  </button>
                </div>

                {versions.length === 0 ? (
                  <p className="mt-3 text-xs text-neutral-500 text-center py-4">
                    Nenhum gabarito cadastrado para esta prova.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {versions.map((ver) => {
                      const isSelected = selectedAnswerKey?.id === ver.id;
                      return (
                        <li key={ver.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectVersion(ver)}
                            className={`w-full text-left rounded-md p-2.5 transition-colors text-xs border ${
                              isSelected
                                ? 'border-[#2563EB] bg-[#2563EB]/10 text-white'
                                : 'border-neutral-800 bg-neutral-950/60 text-neutral-300 hover:border-neutral-700'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-neutral-200">
                                v{ver.version} · {TYPE_LABELS[ver.type]}
                              </span>
                              {ver.isCurrent && (
                                <span className="inline-flex items-center rounded-full bg-emerald-950/80 px-2 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-800">
                                  Vigente
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-500">
                              <span>Status: {STATUS_LABELS[ver.status]}</span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </aside>

            {/* Coluna Central/Principal: Gabarito Ativo e Tabela de Itens */}
            <div className="lg:col-span-3 space-y-6">
              {!selectedAnswerKey ? (
                <div className="rounded-lg border border-dashed border-neutral-800 p-8 text-center bg-neutral-900/20">
                  <FileText className="mx-auto h-10 w-10 text-neutral-600" />
                  <h3 className="mt-2 text-sm font-medium text-white">Nenhum gabarito vigente ou rascunho selecionado</h3>
                  <p className="mt-1 text-xs text-neutral-400">
                    Crie um primeiro rascunho de gabarito oficial para esta prova para começar a cadastrar respostas.
                  </p>
                  <button
                    type="button"
                    onClick={openCreateDraftModal}
                    className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#2563EB] px-4 py-2 text-xs font-medium text-white hover:bg-[#1D4ED8]"
                  >
                    <Plus className="h-4 w-4" />
                    Criar Primeiro Rascunho
                  </button>
                </div>
              ) : (
                <>
                  {/* Cartão de Resumo do Gabarito Selecionado */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h2 className="text-lg font-bold text-white">
                            Gabarito Oficial — Versão {selectedAnswerKey.version} ({TYPE_LABELS[selectedAnswerKey.type]})
                          </h2>
                          {selectedAnswerKey.isCurrent && (
                            <span className="inline-flex items-center rounded-full bg-emerald-950/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-800">
                              Vigente
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                              selectedAnswerKey.status === 'DRAFT'
                                ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                                : selectedAnswerKey.status === 'PUBLISHED'
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                                : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                            }`}
                          >
                            {STATUS_LABELS[selectedAnswerKey.status]}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-neutral-400">
                          ID: <code className="text-neutral-300">{selectedAnswerKey.id}</code>
                          {selectedAnswerKey.notes && ` · Notas: ${selectedAnswerKey.notes}`}
                        </p>
                      </div>

                      {/* Ações do Rascunho */}
                      <div className="flex items-center gap-2">
                        {isDraft ? (
                          <>
                            <button
                              type="button"
                              onClick={openEditMetadataModal}
                              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Editar Metadados
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsConfirmDeleteModalOpen(true)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950/60 hover:border-red-800"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Excluir Rascunho
                            </button>
                          </>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs font-medium text-neutral-400">
                            <Lock className="h-3.5 w-3.5" />
                            Gabarito Publicado (Somente Leitura)
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Alertas de Validação de Publicação (Visíveis se em rascunho) */}
                    {isDraft && (
                      <div className="mt-4 pt-2">
                        {items.length === 0 ? (
                          <div className="rounded-md border border-amber-900/50 bg-amber-950/30 p-3 text-xs text-amber-300 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                            <span>Este rascunho não possui itens cadastrados. Adicione questões para possibilitar a publicação.</span>
                          </div>
                        ) : needsReviewCount > 0 ? (
                          <div className="rounded-md border border-amber-900/50 bg-amber-950/30 p-3 text-xs text-amber-300 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                            <span>
                              Existem <strong>{needsReviewCount}</strong> questões com pendência de revisão humana (NEEDS_REVIEW). A API bloqueará a publicação até que todas sejam resolvidas.
                            </span>
                          </div>
                        ) : missingAnswerCount > 0 ? (
                          <div className="rounded-md border border-amber-900/50 bg-amber-950/30 p-3 text-xs text-amber-300 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                            <span>
                              Existem <strong>{missingAnswerCount}</strong> questões ativas sem resposta correta preenchida. Preencha o gabarito ou anule as questões para publicar.
                            </span>
                          </div>
                        ) : (
                          <div className="rounded-md border border-emerald-900/50 bg-emerald-950/30 p-3 text-xs text-emerald-300 flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                            <span>Todos os itens estão íntegros e revisados. O gabarito está pronto para publicação.</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Barra de Ações sobre Itens */}
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                    <h3 className="text-base font-semibold text-white">
                      Itens do Gabarito ({items.length})
                    </h3>

                    {isDraft && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={openReplaceBatchModal}
                          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Substituição em Lote
                        </button>
                        <button
                          type="button"
                          onClick={openAddItemModal}
                          className="inline-flex items-center gap-1.5 rounded-md bg-[#2563EB] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1D4ED8]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Adicionar Item
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Tabela de Itens */}
                  {items.length === 0 ? (
                    <div className="text-center py-10 rounded-lg border border-dashed border-neutral-800 text-neutral-500 text-sm">
                      Nenhuma questão cadastrada neste gabarito oficial.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950">
                      <table className="w-full text-left text-sm text-neutral-300">
                        <thead className="border-b border-neutral-800 bg-neutral-900/60 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                          <tr>
                            <th className="py-3 px-4">Questão</th>
                            <th className="py-3 px-4">Resposta Oficial</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4">Justificativa / Evidência</th>
                            {isDraft && <th className="py-3 px-4 text-right">Ações</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/70">
                          {items.map((item) => (
                            <tr key={item.id} className="hover:bg-neutral-900/30 transition-colors">
                              <td className="py-3 px-4 font-semibold text-white">
                                Questão {item.questionNumber}
                              </td>
                              <td className="py-3 px-4">
                                {item.isAnnulled ? (
                                  <span className="text-red-400 font-semibold">[ANULADA]</span>
                                ) : item.correctAnswer ? (
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center justify-center h-6 w-6 rounded bg-[#2563EB]/20 text-[#60A5FA] font-bold text-xs border border-[#2563EB]/40">
                                      {item.correctAnswer}
                                    </span>
                                    {item.previousAnswer && (
                                      <span className="text-xs text-neutral-500 line-through">
                                        (antiga: {item.previousAnswer})
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-neutral-500 italic">Não definida</span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                                    item.status === 'ACTIVE'
                                      ? 'bg-neutral-800 text-neutral-300 border-neutral-700'
                                      : item.status === 'ANNULLED'
                                      ? 'bg-red-950/60 text-red-300 border-red-800'
                                      : item.status === 'CHANGED'
                                      ? 'bg-blue-950/60 text-blue-300 border-blue-800'
                                      : 'bg-amber-950/60 text-amber-300 border-amber-800'
                                  }`}
                                >
                                  {ITEM_STATUS_LABELS[item.status]}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-xs text-neutral-400 max-w-xs truncate">
                                {item.justification || item.textEvidence || '—'}
                              </td>
                              {isDraft && (
                                <td className="py-3 px-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() => openEditItemModal(item)}
                                    className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium transition-colors"
                                  >
                                    Editar
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
          </div>
        )}
      </main>

      {/* =========================================================================
          MODAIS DE FORMULÁRIO E CONFIRMAÇÃO
         ========================================================================= */}

      {/* Modal: Criar Rascunho */}
      {isCreateDraftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-[#0E0E0E] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base font-bold text-white">Criar Rascunho de Gabarito</h3>
              <button
                type="button"
                onClick={() => setIsCreateDraftModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDraft} className="mt-4 space-y-4">
              <div>
                <label htmlFor="create-draft-type" className="block text-xs font-medium text-neutral-300">
                  Tipo de Gabarito
                </label>
                <select
                  id="create-draft-type"
                  value={draftType}
                  onChange={(e) => setDraftType(e.target.value as OfficialAnswerKeyType)}
                  className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                >
                  <option value="PRELIMINARY">Preliminar</option>
                  <option value="FINAL">Definitivo</option>
                  <option value="RECTIFIED">Retificado</option>
                </select>
              </div>

              <div>
                <label htmlFor="create-draft-version" className="block text-xs font-medium text-neutral-300">
                  Número da Versão
                </label>
                <input
                  id="create-draft-version"
                  type="number"
                  min={1}
                  value={draftVersion}
                  onChange={(e) => setDraftVersion(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="create-draft-notes" className="block text-xs font-medium text-neutral-300">
                  Notas de Versão (opcional)
                </label>
                <textarea
                  id="create-draft-notes"
                  rows={3}
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  placeholder="Observações sobre banca, retificações ou referências do concurso..."
                  className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="create-draft-pdf" className="block text-xs font-medium text-neutral-300">
                  UUID do Documento PDF de Origem (opcional)
                </label>
                <input
                  id="create-draft-pdf"
                  type="text"
                  value={draftPdfId}
                  onChange={(e) => setDraftPdfId(e.target.value)}
                  placeholder="UUID do documento PDF extraído"
                  className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsCreateDraftModalOpen(false)}
                  className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-md bg-[#2563EB] px-4 py-2 text-xs font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50"
                >
                  {isSubmitting ? 'Criando...' : 'Criar Rascunho'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Adicionar Item */}
      {isAddItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-[#0E0E0E] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base font-bold text-white">Adicionar Item ao Rascunho</h3>
              <button
                type="button"
                onClick={() => setIsAddItemModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddItem} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="add-item-qnum" className="block text-xs font-medium text-neutral-300">
                    Número da Questão
                  </label>
                  <input
                    id="add-item-qnum"
                    type="number"
                    min={1}
                    value={itemQuestionNumber}
                    onChange={(e) => setItemQuestionNumber(parseInt(e.target.value, 10) || 1)}
                    className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="add-item-answer" className="block text-xs font-medium text-neutral-300">
                    Resposta Correta
                  </label>
                  <input
                    id="add-item-answer"
                    type="text"
                    maxLength={10}
                    value={itemCorrectAnswer}
                    disabled={itemStatus === 'ANNULLED'}
                    onChange={(e) => setItemCorrectAnswer(e.target.value.toUpperCase())}
                    placeholder={itemStatus === 'ANNULLED' ? 'Anulada' : 'Ex: A, B, C...'}
                    className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none disabled:opacity-40"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="add-item-status" className="block text-xs font-medium text-neutral-300">
                  Status da Questão
                </label>
                <select
                  id="add-item-status"
                  value={itemStatus}
                  onChange={(e) => {
                    const st = e.target.value as OfficialAnswerKeyItemStatus;
                    setItemStatus(st);
                    if (st === 'ANNULLED') {
                      setItemIsAnnulled(true);
                      setItemCorrectAnswer('');
                    } else {
                      setItemIsAnnulled(false);
                    }
                  }}
                  className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                >
                  <option value="ACTIVE">Ativo (Gabarito regular)</option>
                  <option value="ANNULLED">Anulada (Pontuação concedida)</option>
                  <option value="CHANGED">Alterada (Gabarito retificado)</option>
                  <option value="NEEDS_REVIEW">Requer Revisão Humana</option>
                </select>
              </div>

              {itemStatus === 'CHANGED' && (
                <div>
                  <label htmlFor="add-item-previous" className="block text-xs font-medium text-neutral-300">
                    Resposta Anterior
                  </label>
                  <input
                    id="add-item-previous"
                    type="text"
                    maxLength={10}
                    value={itemPreviousAnswer}
                    onChange={(e) => setItemPreviousAnswer(e.target.value.toUpperCase())}
                    placeholder="Gabarito divulgado anteriormente"
                    className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label htmlFor="add-item-justification" className="block text-xs font-medium text-neutral-300">
                  Justificativa da Banca (opcional)
                </label>
                <textarea
                  id="add-item-justification"
                  rows={2}
                  value={itemJustification}
                  onChange={(e) => setItemJustification(e.target.value)}
                  placeholder="Fundamentação teórica ou justificativa de anulação/alteração..."
                  className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div className="mt-5 flex justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsAddItemModalOpen(false)}
                  className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-md bg-[#2563EB] px-4 py-2 text-xs font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Item Individual */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-[#0E0E0E] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base font-bold text-white">
                Editar Questão {editingItem.questionNumber}
              </h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateItem} className="mt-4 space-y-3">
              <div>
                <label htmlFor="edit-item-answer" className="block text-xs font-medium text-neutral-300">
                  Resposta Correta
                </label>
                <input
                  id="edit-item-answer"
                  type="text"
                  maxLength={10}
                  value={itemCorrectAnswer}
                  disabled={itemStatus === 'ANNULLED'}
                  onChange={(e) => setItemCorrectAnswer(e.target.value.toUpperCase())}
                  placeholder={itemStatus === 'ANNULLED' ? 'Anulada' : 'Ex: A, B, C...'}
                  className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none disabled:opacity-40"
                />
              </div>

              <div>
                <label htmlFor="edit-item-status" className="block text-xs font-medium text-neutral-300">
                  Status
                </label>
                <select
                  id="edit-item-status"
                  value={itemStatus}
                  onChange={(e) => {
                    const st = e.target.value as OfficialAnswerKeyItemStatus;
                    setItemStatus(st);
                    if (st === 'ANNULLED') {
                      setItemIsAnnulled(true);
                      setItemCorrectAnswer('');
                    } else {
                      setItemIsAnnulled(false);
                    }
                  }}
                  className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                >
                  <option value="ACTIVE">Ativo (Gabarito regular)</option>
                  <option value="ANNULLED">Anulada (Pontuação concedida)</option>
                  <option value="CHANGED">Alterada (Gabarito retificado)</option>
                  <option value="NEEDS_REVIEW">Requer Revisão Humana</option>
                </select>
              </div>

              <div>
                <label htmlFor="edit-item-previous" className="block text-xs font-medium text-neutral-300">
                  Resposta Anterior (opcional)
                </label>
                <input
                  id="edit-item-previous"
                  type="text"
                  maxLength={10}
                  value={itemPreviousAnswer}
                  onChange={(e) => setItemPreviousAnswer(e.target.value.toUpperCase())}
                  placeholder="Gabarito divulgado anteriormente"
                  className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="edit-item-justification" className="block text-xs font-medium text-neutral-300">
                  Justificativa
                </label>
                <textarea
                  id="edit-item-justification"
                  rows={2}
                  value={itemJustification}
                  onChange={(e) => setItemJustification(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div className="mt-5 flex justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-md bg-[#2563EB] px-4 py-2 text-xs font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50"
                >
                  {isSubmitting ? 'Atualizando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Substituição em Lote */}
      {isReplaceBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-lg border border-neutral-800 bg-[#0E0E0E] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base font-bold text-white">Substituição em Lote de Itens</h3>
              <button
                type="button"
                onClick={() => setIsReplaceBatchModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleReplaceBatch} className="mt-4 space-y-3">
              <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-3 text-xs text-amber-300">
                Atenção: Esta operação substituirá <strong>todos</strong> os itens existentes deste rascunho de gabarito.
              </div>

              <div>
                <label htmlFor="replace-batch-input" className="block text-xs font-medium text-neutral-300">
                  Cole o gabarito (uma questão por linha, formato &quot;1: A&quot; ou &quot;1: ANULADA&quot;):
                </label>
                <textarea
                  id="replace-batch-input"
                  rows={8}
                  value={batchRawInput}
                  onChange={(e) => {
                    setBatchRawInput(e.target.value);
                    setBatchParsingError(null);
                    setBatchModalError(null);
                  }}
                  placeholder={`1: A\n2: B\n3: C\n4: ANULADA\n5: E`}
                  className="mt-1 w-full font-mono text-xs rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-white focus:border-[#2563EB] focus:outline-none"
                  required
                />
              </div>

              {batchParsingError && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {batchParsingError}
                </p>
              )}

              {batchModalError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-200"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <span>{batchModalError}</span>
                </div>
              )}

              <div className="mt-5 flex justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsReplaceBatchModalOpen(false)}
                  className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-md bg-[#2563EB] px-4 py-2 text-xs font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50"
                >
                  {isSubmitting ? 'Substituindo...' : 'Substituir Todos os Itens'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Publicação de Gabarito */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-[#0E0E0E] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-emerald-400" />
                Publicar Gabarito Oficial
              </h3>
              <button
                type="button"
                onClick={() => setIsPublishModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handlePublish} className="mt-4 space-y-4">
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-300 space-y-2">
                <p>
                  A publicação oficial ativará esta versão (<strong>v{selectedAnswerKey?.version}</strong>) como a <strong>vigente</strong> da prova.
                </p>
                <p className="text-neutral-400">
                  A versão vigente anterior (se houver) será automaticamente desativada em uma transação atômica no banco de dados.
                </p>
              </div>

              <div className="flex items-start gap-2 pt-2">
                <input
                  id="publish-confirm-reviewed"
                  type="checkbox"
                  checked={publishConfirmAll}
                  onChange={(e) => setPublishConfirmAll(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-neutral-800 bg-neutral-950 text-[#2563EB] focus:ring-[#2563EB]"
                  required
                />
                <label htmlFor="publish-confirm-reviewed" className="text-xs text-neutral-300">
                  Confirmo que todos os itens deste gabarito foram revisados e estão aptos para publicação oficial.
                </label>
              </div>

              <div className="mt-5 flex justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsPublishModalOpen(false)}
                  className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!publishConfirmAll || isSubmitting}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {isSubmitting ? 'Publicando...' : 'Confirmar e Publicar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmação de Exclusão de Rascunho */}
      {isConfirmDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-lg border border-red-900/60 bg-[#0E0E0E] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-400" />
              Excluir Rascunho
            </h3>
            <p className="mt-2 text-xs text-neutral-300">
              Tem certeza de que deseja excluir permanentemente este rascunho de gabarito e todos os seus itens? Esta operação não pode ser desfeita.
            </p>

            <div className="mt-5 flex justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setIsConfirmDeleteModalOpen(false)}
                className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteDraft}
                disabled={isSubmitting}
                className="rounded-md bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {isSubmitting ? 'Excluindo...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar Metadados */}
      {isEditMetadataModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-[#0E0E0E] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base font-bold text-white">Editar Metadados do Rascunho</h3>
              <button
                type="button"
                onClick={() => setIsEditMetadataModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateMetadata} className="mt-4 space-y-3">
              <div>
                <label htmlFor="edit-meta-type" className="block text-xs font-medium text-neutral-300">
                  Tipo de Gabarito
                </label>
                <select
                  id="edit-meta-type"
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as OfficialAnswerKeyType)}
                  className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                >
                  <option value="PRELIMINARY">Preliminar</option>
                  <option value="FINAL">Definitivo</option>
                  <option value="RECTIFIED">Retificado</option>
                </select>
              </div>

              <div>
                <label htmlFor="edit-meta-version" className="block text-xs font-medium text-neutral-300">
                  Versão
                </label>
                <input
                  id="edit-meta-version"
                  type="number"
                  min={1}
                  value={editVersion}
                  onChange={(e) => setEditVersion(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="edit-meta-notes" className="block text-xs font-medium text-neutral-300">
                  Notas
                </label>
                <textarea
                  id="edit-meta-notes"
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div className="mt-5 flex justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsEditMetadataModalOpen(false)}
                  className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-md bg-[#2563EB] px-4 py-2 text-xs font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
