import { z } from 'zod';

/**
 * Validadores de entrada para os fluxos essenciais de Autenticação (Etapa 1.1).
 * Normaliza e-mail (trim + lowercase) e limita o tamanho máximo de senha para proteger o scrypt.
 */

export const registerInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'O nome deve ter pelo menos 2 caracteres.')
    .max(120, 'O nome deve ter no máximo 120 caracteres.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Informe um endereço de e-mail válido.')
    .max(254, 'O e-mail deve ter no máximo 254 caracteres.'),
  password: z
    .string()
    .min(8, 'A senha deve possuir no mínimo 8 caracteres.')
    .max(128, 'A senha deve possuir no máximo 128 caracteres.'),
});

export const loginInputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Informe um endereço de e-mail válido.')
    .max(254, 'O e-mail deve ter no máximo 254 caracteres.'),
  password: z
    .string()
    .min(1, 'A senha é obrigatória.')
    .max(128, 'A senha deve possuir no máximo 128 caracteres.'),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
