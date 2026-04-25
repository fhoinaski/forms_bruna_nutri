import { z } from "zod";

export const aiProtocolGenerateSchema = z.object({
  submissionId: z.string().min(1),
  preAnalysisId: z.string().optional().nullable(),
  extraInstructions: z.string().max(5000).optional().nullable(),
});

export type AiProtocolGenerateInput = z.infer<typeof aiProtocolGenerateSchema>;

export const aiProtocolDraftUpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  output_json: z.string().min(2).optional(),
  status: z.enum(["draft", "reviewed", "approved", "rejected"]).optional(),
});

export type AiProtocolDraftUpdateInput = z.infer<typeof aiProtocolDraftUpdateSchema>;

// Shape do JSON de saída da IA — usado para type-checking no frontend
export interface ProtocolPhase {
  title: string;
  days: string;
  objective: string;
  actions: string[];
  notes: string;
}

export interface ProtocolTask {
  title: string;
  description: string;
  dueInDays: number;
}

export interface ProtocolDraftOutput {
  title: string;
  caseSummary: string;
  mainGoals: string[];
  attentionPoints: string[];
  suggestedProtocol: {
    durationDays: number;
    phases: ProtocolPhase[];
  };
  tasks: ProtocolTask[];
  followUpQuestions: string[];
  educationalMaterials: string[];
  safetyNotes: string[];
  professionalReviewNotes: string;
  generatedWithoutExternalAi?: boolean;
}
