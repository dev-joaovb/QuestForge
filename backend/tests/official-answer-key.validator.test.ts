import { describe, it, expect } from 'vitest';
import {
  createOfficialAnswerKeyDraftSchema,
  updateOfficialAnswerKeyDraftSchema,
  createOfficialAnswerKeyItemSchema,
  updateOfficialAnswerKeyItemSchema,
  updateOfficialAnswerKeyDraftItemSchema,
  replaceOfficialAnswerKeyItemsSchema,
  publishOfficialAnswerKeySchema,
  listAnswerKeyVersionsQuerySchema,
  listAnswerKeyItemsQuerySchema,
  validateCreateOfficialAnswerKeyDraft,
  validateUpdateOfficialAnswerKeyDraft,
  validateCreateOfficialAnswerKeyItem,
  validateUpdateOfficialAnswerKeyItem,
  validateUpdateOfficialAnswerKeyDraftItem,
  validateReplaceOfficialAnswerKeyItems,
  validatePublishOfficialAnswerKey,
  validateListAnswerKeyVersionsQuery,
  validateListAnswerKeyItemsQuery,
  MAX_OFFICIAL_ANSWER_KEY_ITEMS,
  MAX_ANSWER_KEY_NOTES_LENGTH,
  MAX_ANSWER_KEY_JUSTIFICATION_LENGTH,
  MAX_ANSWER_KEY_TEXT_EVIDENCE_LENGTH,
} from '../src/validators/official-answer-key.validator.ts';
import { OfficialAnswerKeyError } from '../src/types/official-answer-key.types.ts';

describe('OfficialAnswerKey Validators (backend/src/validators/official-answer-key.validator.ts)', () => {
  const validExamId = '11111111-1111-4111-8111-111111111111';
  const validPdfDocumentId = '22222222-2222-4222-8222-222222222222';
  const validQuestionId = '33333333-3333-4333-8333-333333333333';

  describe('1. createOfficialAnswerKeyDraftSchema & validateCreateOfficialAnswerKeyDraft', () => {
    it('deve aceitar payload válido com valores mínimos obrigatórios e preencher defaults', () => {
      const raw = {
        examId: validExamId,
      };

      const result = validateCreateOfficialAnswerKeyDraft(raw);

      expect(result.examId).toBe(validExamId);
      expect(result.type).toBe('PRELIMINARY');
      expect(result.pdfDocumentId).toBeUndefined();
      expect(result.version).toBeUndefined();
      expect(result.notes).toBeUndefined();
      expect(result.items).toEqual([]);
    });

    it('deve aceitar payload completo com itens válidos e formatar corretamente', () => {
      const raw = {
        examId: validExamId,
        pdfDocumentId: validPdfDocumentId,
        type: 'FINAL',
        version: 2,
        notes: '   Gabarito definitivo com recursos analisados   ',
        publicationDate: '2026-10-15T10:00:00.000Z',
        items: [
          {
            questionNumber: 1,
            questionId: validQuestionId,
            correctAnswer: 'a',
            status: 'ACTIVE',
            confidence: 0.98,
          },
          {
            questionNumber: 2,
            correctAnswer: null,
            status: 'ANNULLED',
            isAnnulled: true,
            justification: 'Recurso acolhido por duplicidade de respostas',
          },
        ],
      };

      const result = validateCreateOfficialAnswerKeyDraft(raw);

      expect(result.type).toBe('FINAL');
      expect(result.version).toBe(2);
      expect(result.notes).toBe('Gabarito definitivo com recursos analisados');
      expect(result.publicationDate).toBeInstanceOf(Date);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].correctAnswer).toBe('A');
      expect(result.items[1].isAnnulled).toBe(true);
    });

    it('deve rejeitar examId ausente ou que não seja UUID', () => {
      expect(() => validateCreateOfficialAnswerKeyDraft({})).toThrow(OfficialAnswerKeyError);
      expect(() => validateCreateOfficialAnswerKeyDraft({ examId: 'not-a-uuid' })).toThrow(
        /UUID válido/
      );
    });

    it('deve rejeitar pdfDocumentId inválido', () => {
      expect(() =>
        validateCreateOfficialAnswerKeyDraft({
          examId: validExamId,
          pdfDocumentId: 'invalid-uuid-string',
        })
      ).toThrow(/pdfDocumentId/);
    });

    it('deve rejeitar type inválido', () => {
      expect(() =>
        validateCreateOfficialAnswerKeyDraft({
          examId: validExamId,
          type: 'INVALID_TYPE',
        })
      ).toThrow(/expected one of "PRELIMINARY"|"FINAL"|"RECTIFIED"/);
    });

    it('deve rejeitar version menor que 1 ou não inteiro', () => {
      expect(() =>
        validateCreateOfficialAnswerKeyDraft({
          examId: validExamId,
          version: 0,
        })
      ).toThrow(/maior ou igual a 1/);

      expect(() =>
        validateCreateOfficialAnswerKeyDraft({
          examId: validExamId,
          version: 1.5,
        })
      ).toThrow(/número inteiro/);
    });

    it('deve rejeitar notes com tamanho acima do limite', () => {
      const longNotes = 'a'.repeat(MAX_ANSWER_KEY_NOTES_LENGTH + 1);
      expect(() =>
        validateCreateOfficialAnswerKeyDraft({
          examId: validExamId,
          notes: longNotes,
        })
      ).toThrow(new RegExp(`máximo ${MAX_ANSWER_KEY_NOTES_LENGTH}`));
    });

    it('deve rejeitar campos de controle internos proibidos (userId, status, isCurrent, id)', () => {
      expect(() =>
        validateCreateOfficialAnswerKeyDraft({
          examId: validExamId,
          userId: 'user-injetado-indevido',
        })
      ).toThrow(/Propriedades não permitidas no payload: userId/);

      expect(() =>
        validateCreateOfficialAnswerKeyDraft({
          examId: validExamId,
          status: 'PUBLISHED',
        })
      ).toThrow(/Propriedades não permitidas no payload: status/);

      expect(() =>
        validateCreateOfficialAnswerKeyDraft({
          examId: validExamId,
          isCurrent: true,
        })
      ).toThrow(/Propriedades não permitidas no payload: isCurrent/);
    });

    it('deve rejeitar itens com questionNumber duplicado no mesmo payload de criação', () => {
      const raw = {
        examId: validExamId,
        items: [
          { questionNumber: 1, correctAnswer: 'A' },
          { questionNumber: 2, correctAnswer: 'B' },
          { questionNumber: 1, correctAnswer: 'C' },
        ],
      };

      expect(() => validateCreateOfficialAnswerKeyDraft(raw)).toThrow(
        /Número de questão duplicado: 1/
      );
    });

    it('deve rejeitar array de itens que exceda o limite máximo permitido', () => {
      const excessiveItems = Array.from({ length: MAX_OFFICIAL_ANSWER_KEY_ITEMS + 1 }, (_, i) => ({
        questionNumber: i + 1,
        correctAnswer: 'A',
      }));

      expect(() =>
        validateCreateOfficialAnswerKeyDraft({
          examId: validExamId,
          items: excessiveItems,
        })
      ).toThrow(new RegExp(`no máximo ${MAX_OFFICIAL_ANSWER_KEY_ITEMS} itens`));
    });
  });

  describe('2. createOfficialAnswerKeyItemSchema & validateCreateOfficialAnswerKeyItem', () => {
    it('deve aceitar item válido com defaults de status ACTIVE e isAnnulled false', () => {
      const raw = {
        questionNumber: 10,
        correctAnswer: 'c',
      };

      const result = validateCreateOfficialAnswerKeyItem(raw);

      expect(result.questionNumber).toBe(10);
      expect(result.correctAnswer).toBe('C');
      expect(result.status).toBe('ACTIVE');
      expect(result.isAnnulled).toBe(false);
      expect(result.questionId).toBeUndefined();
    });

    it('deve suportar itens pendentes de revisão gerados por IA com evidência e confiança', () => {
      const raw = {
        questionNumber: 42,
        correctAnswer: 'd',
        status: 'NEEDS_REVIEW',
        confidence: 0.82,
        textEvidence: '42. Gabarito extraído da página 12: D (sujeito a conferência da banca)',
        sourcePage: 12,
      };

      const result = validateCreateOfficialAnswerKeyItem(raw);

      expect(result.status).toBe('NEEDS_REVIEW');
      expect(result.confidence).toBe(0.82);
      expect(result.textEvidence).toContain('página 12: D');
      expect(result.sourcePage).toBe(12);
    });

    it('deve preservar a formatação e caracteres da evidência textual sem transformação destrutiva', () => {
      const complexEvidence = `Questão 01:\n[A] Texto com acentuação e quebras\n(B) Evidência real #123 & "aspas"`;
      const raw = {
        questionNumber: 1,
        textEvidence: complexEvidence,
      };

      const result = validateCreateOfficialAnswerKeyItem(raw);

      expect(result.textEvidence).toBe(complexEvidence);
    });

    it('deve rejeitar questionNumber menor que 1 ou não inteiro', () => {
      expect(() => validateCreateOfficialAnswerKeyItem({ questionNumber: 0 })).toThrow(
        /maior ou igual a 1/
      );
      expect(() => validateCreateOfficialAnswerKeyItem({ questionNumber: 3.14 })).toThrow(
        /número inteiro/
      );
    });

    it('deve rejeitar confidence fora do intervalo 0.0 a 1.0', () => {
      expect(() =>
        validateCreateOfficialAnswerKeyItem({ questionNumber: 1, confidence: -0.1 })
      ).toThrow(/maior ou igual a 0.0/);

      expect(() =>
        validateCreateOfficialAnswerKeyItem({ questionNumber: 1, confidence: 1.05 })
      ).toThrow(/menor ou igual a 1.0/);
    });

    it('deve aceitar item com status ANNULLED e isAnnulled true explicitamente', () => {
      const raw = {
        questionNumber: 15,
        status: 'ANNULLED',
        isAnnulled: true,
        justification: 'Questão sem resposta correta dentre as alternativas',
      };

      const result = validateCreateOfficialAnswerKeyItem(raw);

      expect(result.questionNumber).toBe(15);
      expect(result.status).toBe('ANNULLED');
      expect(result.isAnnulled).toBe(true);
    });

    it('deve rejeitar status ANNULLED quando isAnnulled for explicitamente false', () => {
      const raw = {
        questionNumber: 15,
        status: 'ANNULLED',
        isAnnulled: false,
      };

      expect(() => validateCreateOfficialAnswerKeyItem(raw)).toThrow(
        /Itens com status ANNULLED devem possuir isAnnulled como true/
      );
    });

    it('deve rejeitar status ANNULLED quando isAnnulled for omitido (default false)', () => {
      const raw = {
        questionNumber: 15,
        status: 'ANNULLED',
      };

      expect(() => validateCreateOfficialAnswerKeyItem(raw)).toThrow(
        /Itens com status ANNULLED devem possuir isAnnulled como true/
      );
    });

    it('deve rejeitar isAnnulled true quando status for omitido (default ACTIVE)', () => {
      const raw = {
        questionNumber: 15,
        isAnnulled: true,
      };

      expect(() => validateCreateOfficialAnswerKeyItem(raw)).toThrow(
        /Itens com isAnnulled true devem possuir status ANNULLED/
      );
    });

    it('deve rejeitar isAnnulled true quando status for diferente de ANNULLED (ex: ACTIVE, CHANGED, NEEDS_REVIEW)', () => {
      for (const nonAnnulledStatus of ['ACTIVE', 'CHANGED', 'NEEDS_REVIEW'] as const) {
        expect(() =>
          validateCreateOfficialAnswerKeyItem({
            questionNumber: 15,
            status: nonAnnulledStatus,
            isAnnulled: true,
          })
        ).toThrow(/Itens com isAnnulled true devem possuir status ANNULLED/);
      }
    });

    it('deve aceitar status não-anulado com isAnnulled false ou omitido', () => {
      for (const validStatus of ['ACTIVE', 'CHANGED', 'NEEDS_REVIEW'] as const) {
        const res1 = validateCreateOfficialAnswerKeyItem({
          questionNumber: 1,
          status: validStatus,
          isAnnulled: false,
        });
        expect(res1.status).toBe(validStatus);
        expect(res1.isAnnulled).toBe(false);

        const res2 = validateCreateOfficialAnswerKeyItem({
          questionNumber: 2,
          status: validStatus,
        });
        expect(res2.status).toBe(validStatus);
        expect(res2.isAnnulled).toBe(false);
      }
    });

    it('deve rejeitar propriedades internas não permitidas no item', () => {
      expect(() =>
        validateCreateOfficialAnswerKeyItem({
          questionNumber: 1,
          id: 'item-uuid-proibido',
        })
      ).toThrow(/Propriedades não permitidas no payload: id/);

      expect(() =>
        validateCreateOfficialAnswerKeyItem({
          questionNumber: 1,
          answerKeyId: 'key-uuid-proibido',
        })
      ).toThrow(/Propriedades não permitidas no payload: answerKeyId/);
    });

    it('deve rejeitar justification e textEvidence que excedam limites máximos', () => {
      const longText = 'x'.repeat(MAX_ANSWER_KEY_JUSTIFICATION_LENGTH + 1);

      expect(() =>
        validateCreateOfficialAnswerKeyItem({
          questionNumber: 1,
          justification: longText,
        })
      ).toThrow(new RegExp(`máximo ${MAX_ANSWER_KEY_JUSTIFICATION_LENGTH}`));

      expect(() =>
        validateCreateOfficialAnswerKeyItem({
          questionNumber: 1,
          textEvidence: longText,
        })
      ).toThrow(new RegExp(`máximo ${MAX_ANSWER_KEY_TEXT_EVIDENCE_LENGTH}`));
    });
  });

  describe('3. updateOfficialAnswerKeyItemSchema & validateUpdateOfficialAnswerKeyItem', () => {
    it('deve aceitar atualização parcial de item com campos permitidos', () => {
      const raw = {
        correctAnswer: 'e',
        status: 'CHANGED',
        justification: 'Gabarito alterado de C para E após recurso da questão',
      };

      const result = validateUpdateOfficialAnswerKeyItem(raw);

      expect(result.correctAnswer).toBe('E');
      expect(result.status).toBe('CHANGED');
      expect(result.justification).toBe('Gabarito alterado de C para E após recurso da questão');
    });

    it('deve rejeitar payload de atualização de item totalmente vazio ({})', () => {
      expect(() => validateUpdateOfficialAnswerKeyItem({})).toThrow(
        /Pelo menos um campo deve ser fornecido para atualização/
      );
    });

    it('deve rejeitar payload de atualização de item com campos apenas undefined', () => {
      expect(() =>
        validateUpdateOfficialAnswerKeyItem({
          correctAnswer: undefined,
          status: undefined,
        })
      ).toThrow(/Pelo menos um campo deve ser fornecido para atualização/);
    });

    it('deve rejeitar questionNumber na atualização do item (número é chave de identificação)', () => {
      expect(() =>
        validateUpdateOfficialAnswerKeyItem({
          questionNumber: 2,
          correctAnswer: 'A',
        })
      ).toThrow(/Propriedades não permitidas no payload: questionNumber/);
    });

    it('deve aceitar anulação consistente com status ANNULLED e isAnnulled true', () => {
      const result = validateUpdateOfficialAnswerKeyItem({
        status: 'ANNULLED',
        isAnnulled: true,
        justification: 'Questão anulada após recurso',
      });

      expect(result.status).toBe('ANNULLED');
      expect(result.isAnnulled).toBe(true);
      expect(result.justification).toBe('Questão anulada após recurso');
    });

    it('deve rejeitar status ANNULLED sem enviar isAnnulled true', () => {
      expect(() =>
        validateUpdateOfficialAnswerKeyItem({
          status: 'ANNULLED',
        })
      ).toThrow(/Atualizações com status ANNULLED exigem envio explícito de isAnnulled como true/);
    });

    it('deve rejeitar status ANNULLED com isAnnulled explicitamente falso', () => {
      expect(() =>
        validateUpdateOfficialAnswerKeyItem({
          status: 'ANNULLED',
          isAnnulled: false,
        })
      ).toThrow(/Atualizações com status ANNULLED exigem envio explícito de isAnnulled como true/);
    });

    it('deve rejeitar isAnnulled true com status diferente de ANNULLED (ex: ACTIVE, CHANGED, NEEDS_REVIEW)', () => {
      for (const nonAnnulledStatus of ['ACTIVE', 'CHANGED', 'NEEDS_REVIEW'] as const) {
        expect(() =>
          validateUpdateOfficialAnswerKeyItem({
            status: nonAnnulledStatus,
            isAnnulled: true,
          })
        ).toThrow(/Itens com isAnnulled true não podem possuir status diferente de ANNULLED/);
      }
    });

    it('deve permitir atualizações de campos não relacionados a anulação sem status nem isAnnulled', () => {
      const result = validateUpdateOfficialAnswerKeyItem({
        correctAnswer: 'B',
        confidence: 0.95,
        sourcePage: 5,
      });

      expect(result.correctAnswer).toBe('B');
      expect(result.confidence).toBe(0.95);
      expect(result.sourcePage).toBe(5);
      expect(result.status).toBeUndefined();
      expect(result.isAnnulled).toBeUndefined();
    });

    it('deve permitir validação via alias updateOfficialAnswerKeyDraftItemSchema e validateUpdateOfficialAnswerKeyDraftItem', () => {
      expect(() => validateUpdateOfficialAnswerKeyDraftItem({})).toThrow(
        /Pelo menos um campo deve ser fornecido para atualização/
      );

      const parsed = validateUpdateOfficialAnswerKeyDraftItem({
        status: 'ANNULLED',
        isAnnulled: true,
      });
      expect(parsed.status).toBe('ANNULLED');
      expect(parsed.isAnnulled).toBe(true);
    });
  });

  describe('4. updateOfficialAnswerKeyDraftSchema & validateUpdateOfficialAnswerKeyDraft', () => {
    it('deve rejeitar payload de atualização de rascunho totalmente vazio ({})', () => {
      expect(() => validateUpdateOfficialAnswerKeyDraft({})).toThrow(
        /Pelo menos um campo deve ser fornecido para atualização/
      );
    });

    it('deve rejeitar payload de rascunho onde todos os campos são undefined', () => {
      expect(() =>
        validateUpdateOfficialAnswerKeyDraft({
          notes: undefined,
          type: undefined,
        })
      ).toThrow(/Pelo menos um campo deve ser fornecido para atualização/);
    });

    it('deve aceitar atualização contendo apenas um campo válido', () => {
      const resNotes = validateUpdateOfficialAnswerKeyDraft({ notes: 'Nova observação' });
      expect(resNotes.notes).toBe('Nova observação');

      const resItems = validateUpdateOfficialAnswerKeyDraft({ items: [] });
      expect(resItems.items).toEqual([]);

      const resType = validateUpdateOfficialAnswerKeyDraft({ type: 'FINAL' });
      expect(resType.type).toBe('FINAL');
    });

    it('deve aceitar atualização de metadados sem enviar itens', () => {
      const raw = {
        notes: 'Notas atualizadas do rascunho',
        type: 'RECTIFIED',
      };

      const result = validateUpdateOfficialAnswerKeyDraft(raw);

      expect(result.notes).toBe('Notas atualizadas do rascunho');
      expect(result.type).toBe('RECTIFIED');
      expect(result.items).toBeUndefined();
    });

    it('deve aceitar substituição de itens e validar duplicatas em updateDraft', () => {
      const raw = {
        items: [
          { questionNumber: 1, correctAnswer: 'B' },
          { questionNumber: 2, correctAnswer: 'C' },
        ],
      };

      const result = validateUpdateOfficialAnswerKeyDraft(raw);

      expect(result.items).toHaveLength(2);
    });

    it('deve rejeitar duplicatas de questionNumber quando items for fornecido em updateDraft', () => {
      const raw = {
        items: [
          { questionNumber: 10, correctAnswer: 'A' },
          { questionNumber: 10, correctAnswer: 'B' },
        ],
      };

      expect(() => validateUpdateOfficialAnswerKeyDraft(raw)).toThrow(
        /Número de questão duplicado: 10/
      );
    });

    it('deve rejeitar campos protegidos em updateDraft (examId, userId, status, isCurrent)', () => {
      expect(() =>
        validateUpdateOfficialAnswerKeyDraft({
          examId: validExamId,
        })
      ).toThrow(/Propriedades não permitidas no payload: examId/);

      expect(() =>
        validateUpdateOfficialAnswerKeyDraft({
          userId: 'user-hacker',
        })
      ).toThrow(/Propriedades não permitidas no payload: userId/);

      expect(() =>
        validateUpdateOfficialAnswerKeyDraft({
          status: 'PUBLISHED',
        })
      ).toThrow(/Propriedades não permitidas no payload: status/);
    });
  });

  describe('5. replaceOfficialAnswerKeyItemsSchema & validateReplaceOfficialAnswerKeyItems', () => {
    it('deve aceitar lista válida e ordenada de itens para substituição atômica', () => {
      const raw = {
        items: [
          { questionNumber: 1, correctAnswer: 'A' },
          { questionNumber: 2, correctAnswer: 'B' },
          { questionNumber: 3, isAnnulled: true, status: 'ANNULLED' },
        ],
      };

      const result = validateReplaceOfficialAnswerKeyItems(raw);

      expect(result.items).toHaveLength(3);
    });

    it('deve aceitar lista vazia de itens', () => {
      const raw = { items: [] };

      const result = validateReplaceOfficialAnswerKeyItems(raw);

      expect(result.items).toEqual([]);
    });

    it('deve rejeitar duplicidade de questionNumber na substituição de itens', () => {
      const raw = {
        items: [
          { questionNumber: 1, correctAnswer: 'A' },
          { questionNumber: 1, correctAnswer: 'B' },
        ],
      };

      expect(() => validateReplaceOfficialAnswerKeyItems(raw)).toThrow(
        /Número de questão duplicado: 1/
      );
    });

    it('deve rejeitar payload sem propriedade items', () => {
      expect(() => validateReplaceOfficialAnswerKeyItems({})).toThrow(/items/);
    });
  });

  describe('6. publishOfficialAnswerKeySchema & validatePublishOfficialAnswerKey', () => {
    it('deve aceitar payload de publicação com defaults de syncQuestionAnswers e confirmAllReviewed', () => {
      const raw = {};

      const result = validatePublishOfficialAnswerKey(raw);

      expect(result.syncQuestionAnswers).toBe(true);
      expect(result.confirmAllReviewed).toBe(false);
      expect(result.publicationDate).toBeUndefined();
    });

    it('deve aceitar publicação com publicationDate informada', () => {
      const raw = {
        publicationDate: '2026-10-20T12:00:00.000Z',
        syncQuestionAnswers: false,
        confirmAllReviewed: true,
      };

      const result = validatePublishOfficialAnswerKey(raw);

      expect(result.publicationDate).toBeInstanceOf(Date);
      expect(result.syncQuestionAnswers).toBe(false);
      expect(result.confirmAllReviewed).toBe(true);
    });

    it('deve rejeitar campos adicionais não permitidos no payload de publicação', () => {
      expect(() =>
        validatePublishOfficialAnswerKey({
          status: 'PUBLISHED',
        })
      ).toThrow(/Propriedades não permitidas no payload: status/);
    });
  });

  describe('7. listAnswerKeyVersionsQuerySchema & listAnswerKeyItemsQuerySchema', () => {
    it('deve aceitar filtro por type válido em versões', () => {
      const parsed = validateListAnswerKeyVersionsQuery({ type: 'PRELIMINARY' });
      expect(parsed.type).toBe('PRELIMINARY');
    });

    it('deve rejeitar parâmetros estranhos na consulta de versões', () => {
      expect(() =>
        validateListAnswerKeyVersionsQuery({ type: 'PRELIMINARY', hackerParam: '123' })
      ).toThrow(/Propriedades não permitidas no payload: hackerParam/);
    });

    it('deve aceitar filtro por status válido em itens', () => {
      const parsed = validateListAnswerKeyItemsQuery({ status: 'NEEDS_REVIEW' });
      expect(parsed.status).toBe('NEEDS_REVIEW');
    });

    it('deve rejeitar status de item inválido na consulta', () => {
      expect(() =>
        validateListAnswerKeyItemsQuery({ status: 'INVALID_STATUS' })
      ).toThrow(/expected one of "ACTIVE"|"ANNULLED"|"CHANGED"|"NEEDS_REVIEW"/);
    });
  });
});
