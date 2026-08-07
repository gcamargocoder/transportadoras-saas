import { z } from 'zod';

// Espelha as regras de LoginDto (apps/api/src/auth/dto/login.dto.ts).
export const loginSchema = z.object({
  tenantId: z.string().uuid('Informe um identificador de empresa válido (UUID).'),
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres.'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
