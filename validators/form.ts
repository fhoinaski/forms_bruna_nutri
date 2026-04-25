import { z } from 'zod';

export const FormResponseSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  idade: z.string().optional(),
  nascimento: z.string().optional(),
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
});

export type FormResponseInput = z.infer<typeof FormResponseSchema>;
