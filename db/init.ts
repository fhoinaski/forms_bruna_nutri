import { db } from './index';
import { sql } from 'drizzle-orm';

export function initializeDatabase() {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS form_responses (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      idade TEXT,
      nascimento TEXT,
      whatsapp TEXT NOT NULL,
      email TEXT NOT NULL,
      profissao TEXT,
      cidade TEXT,
      
      motivacao TEXT,
      objetivo TEXT,
      incomodo TEXT,
      
      diagnostico TEXT,
      medicacao TEXT,
      anticoncepcional TEXT,
      gestante TEXT,
      sintomas TEXT,
      
      suplementos TEXT,
      suplementos_negativo TEXT,
      
      rotina TEXT,
      sem_comer TEXT,
      comer_emocao TEXT,
      fome_dia TEXT,
      
      sono_horas TEXT,
      descansada TEXT,
      estresse TEXT,
      atividade_fisica TEXT,
      
      intestino_freq TEXT,
      desconforto TEXT,
      
      nao_gosta TEXT,
      favoritos TEXT,
      
      dia_alimentar TEXT,
      expectativas TEXT,
      disposicao TEXT,
      espaco_livre TEXT,
      
      created_at TEXT NOT NULL
    );
  `);
}

// execute if run directly
if (require.main === module) {
  initializeDatabase();
  console.log("Database initialized.");
}
