import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido").max(200),
  password: z.string().min(1, "Senha é obrigatória").max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;

const passwordStrength = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres")
  .max(200)
  .refine((v) => /[a-zA-Z]/.test(v), {
    message: "A senha deve conter pelo menos 1 letra",
  })
  .refine((v) => /[0-9]/.test(v), {
    message: "A senha deve conter pelo menos 1 número",
  })
  .refine((v) => /[^a-zA-Z0-9]/.test(v), {
    message: "A senha deve conter pelo menos 1 caractere especial",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Senha atual é obrigatória").max(200),
    newPassword: passwordStrength,
    confirmPassword: z.string().min(1, "Confirmação é obrigatória").max(200),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
