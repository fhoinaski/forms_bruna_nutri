import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().email("E-mail inválido").max(200),
  password: z.string().min(1, "Senha é obrigatória").max(200),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const DashboardFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  status: z.enum(["novo", "em_andamento", "finalizado", "arquivado"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export type DashboardFilters = z.infer<typeof DashboardFiltersSchema>;

export const UpdateSubmissionSchema = z.object({
  status: z
    .enum(["novo", "em_andamento", "finalizado", "arquivado"])
    .optional(),
  notes: z.string().max(10000).optional(),
});

export type UpdateSubmissionInput = z.infer<typeof UpdateSubmissionSchema>;

export const ExportFiltersSchema = z.object({
  search: z.string().max(200).optional(),
  status: z.enum(["novo", "em_andamento", "finalizado", "arquivado"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export type ExportFilters = z.infer<typeof ExportFiltersSchema>;
