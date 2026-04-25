import { z } from "zod";

export const preAnalysisSchema = z.object({
  summary: z.string().max(5000).optional().nullable(),
  attention_points: z.string().max(5000).optional().nullable(),
  main_goal: z.string().max(2000).optional().nullable(),
  restrictions: z.string().max(2000).optional().nullable(),
  professional_notes: z.string().max(10000).optional().nullable(),
  priority: z.enum(["normal", "alta", "urgente"]).default("normal"),
});

export type PreAnalysisInput = z.infer<typeof preAnalysisSchema>;
