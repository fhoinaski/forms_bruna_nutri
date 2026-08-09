import { z } from 'zod';

function isPediatricProfile(value: string | undefined) {
  const normalized = (value ?? "").toLowerCase();
  return normalized.includes("infantil") || normalized.includes("tea") || normalized.includes("introdu") || normalized.includes("seletividade");
}

export const FormResponseSchema = z.object({
  tipoAtendimento: z.string().optional(),
  nome: z.string().min(2, "Nome é obrigatório"),
  idade: z.string().optional(),
  nascimento: z.string().optional(),
  child_name: z.string().optional(),
  child_age: z.string().optional(),
  child_weight_kg: z.string().optional(),
  child_height_cm: z.string().optional(),
  child_birth_date: z.string().optional(),
  child_breastfeeding: z.string().optional(),
  child_food_repertoire: z.string().optional(),
  child_feeding_difficulties: z.string().optional(),
  child_school_routine: z.string().optional(),
  whatsapp: z.string().min(8, "WhatsApp é obrigatório"),
  email: z.string().email("E-mail inválido").min(1, "E-mail é obrigatório"),
  profissao: z.string().optional(),
  cidade: z.string().optional(),
  
  motivacao: z.string().optional(),
  objetivo: z.string().optional(),
  incomodo: z.string().optional(),
  
  diagnostico: z.string().optional(),
  medicacao: z.string().optional(),
  anticoncepcional: z.string().optional(),
  gestante: z.string().optional(),
  sintomas: z.string().optional(),
  
  suplementos: z.string().optional(),
  suplementosNegativo: z.string().optional(),
  
  rotina: z.string().optional(),
  semComer: z.string().optional(),
  comerEmocao: z.string().optional(),
  fomeDia: z.string().optional(),
  
  sonoHoras: z.string().optional(),
  descansada: z.string().optional(),
  estresse: z.string().optional(),
  atividadeFisica: z.string().optional(),
  
  intestinoFreq: z.string().optional(),
  desconforto: z.string().optional(),
  
  naoGosta: z.string().optional(),
  favoritos: z.string().optional(),
  
  diaAlimentar: z.string().optional(),
  expectativas: z.string().optional(),
  disposicao: z.string().optional(),
  espacoLivre: z.string().optional(),
  privacyAccepted: z.literal(true, {
    error: "Confirme que leu a Política de Privacidade para continuar",
  }),
  companyWebsite: z.string().max(0).optional(),
}).superRefine((data, ctx) => {
  if (!isPediatricProfile(data.tipoAtendimento)) {
    return;
  }

  if (!data.child_name?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["child_name"],
      message: "Nome da criança é obrigatório",
    });
  }

  if (!data.child_age?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["child_age"],
      message: "Idade da criança é obrigatória",
    });
  }
});

export type FormResponseInput = z.infer<typeof FormResponseSchema>;
