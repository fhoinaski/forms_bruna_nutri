import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";

export const formResponses = sqliteTable('form_responses', {
  id: text('id').primaryKey(), // We use uuid for IDs
  nome: text('nome').notNull(),
  idade: text('idade'),
  nascimento: text('nascimento'),
  whatsapp: text('whatsapp').notNull(),
  email: text('email').notNull(),
  profissao: text('profissao'),
  cidade: text('cidade'),
  
  motivacao: text('motivacao'),
  objetivo: text('objetivo'),
  incomodo: text('incomodo'),
  
  diagnostico: text('diagnostico'),
  medicacao: text('medicacao'),
  anticoncepcional: text('anticoncepcional'),
  gestante: text('gestante'),
  sintomas: text('sintomas'),
  
  suplementos: text('suplementos'),
  suplementosNegativo: text('suplementos_negativo'),
  
  rotina: text('rotina'),
  semComer: text('sem_comer'),
  comerEmocao: text('comer_emocao'),
  fomeDia: text('fome_dia'),
  
  sonoHoras: text('sono_horas'),
  descansada: text('descansada'),
  estresse: text('estresse'),
  atividadeFisica: text('atividade_fisica'),
  
  intestinoFreq: text('intestino_freq'),
  desconforto: text('desconforto'),
  
  naoGosta: text('nao_gosta'),
  favoritos: text('favoritos'),
  
  diaAlimentar: text('dia_alimentar'),
  expectativas: text('expectativas'),
  disposicao: text('disposicao'),
  espacoLivre: text('espaco_livre'),
  
  createdAt: text('created_at').notNull(),
});
