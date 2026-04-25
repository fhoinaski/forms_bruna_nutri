import { z } from "zod";

export const SubmissionSchema = z.object({
  patient_name: z
    .string()
    .min(2, "Nome é obrigatório")
    .max(200, "Nome muito longo"),
  patient_email: z
    .string()
    .email("E-mail inválido")
    .max(200)
    .optional()
    .or(z.literal("")),
  patient_phone: z.string().max(30).optional().or(z.literal("")),
  child_name: z.string().max(200).optional().or(z.literal("")),
  child_age: z.string().max(50).optional().or(z.literal("")),
  form_type: z.string().max(50).default("pre_consulta"),
  answers: z.record(z.string(), z.string().max(5000)).default({}),
});

export type SubmissionInput = z.infer<typeof SubmissionSchema>;

export const LegacyFormSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório").max(200),
  whatsapp: z.string().min(8, "WhatsApp é obrigatório").max(30),
  email: z.string().email("E-mail inválido").max(200),
  idade: z.string().max(10).optional().or(z.literal("")),
  nascimento: z.string().max(20).optional().or(z.literal("")),
  profissao: z.string().max(200).optional().or(z.literal("")),
  cidade: z.string().max(200).optional().or(z.literal("")),
  motivacao: z.string().max(5000).optional().or(z.literal("")),
  objetivo: z.string().max(500).optional().or(z.literal("")),
  incomodo: z.string().max(5000).optional().or(z.literal("")),
  diagnostico: z.string().max(2000).optional().or(z.literal("")),
  medicacao: z.string().max(2000).optional().or(z.literal("")),
  anticoncepcional: z.string().max(100).optional().or(z.literal("")),
  gestante: z.string().max(100).optional().or(z.literal("")),
  sintomas: z.string().max(2000).optional().or(z.literal("")),
  suplementos: z.string().max(2000).optional().or(z.literal("")),
  suplementosNegativo: z.string().max(2000).optional().or(z.literal("")),
  rotina: z.string().max(5000).optional().or(z.literal("")),
  semComer: z.string().max(100).optional().or(z.literal("")),
  comerEmocao: z.string().max(100).optional().or(z.literal("")),
  fomeDia: z.string().max(2000).optional().or(z.literal("")),
  sonoHoras: z.string().max(50).optional().or(z.literal("")),
  descansada: z.string().max(100).optional().or(z.literal("")),
  estresse: z.string().max(100).optional().or(z.literal("")),
  atividadeFisica: z.string().max(2000).optional().or(z.literal("")),
  intestinoFreq: z.string().max(100).optional().or(z.literal("")),
  desconforto: z.string().max(100).optional().or(z.literal("")),
  naoGosta: z.string().max(2000).optional().or(z.literal("")),
  favoritos: z.string().max(2000).optional().or(z.literal("")),
  diaAlimentar: z.string().max(10000).optional().or(z.literal("")),
  expectativas: z.string().max(5000).optional().or(z.literal("")),
  disposicao: z.string().max(10).optional().or(z.literal("")),
  espacoLivre: z.string().max(5000).optional().or(z.literal("")),
});

export type LegacyFormInput = z.infer<typeof LegacyFormSchema>;
