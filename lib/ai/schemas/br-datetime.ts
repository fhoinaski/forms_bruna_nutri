/**
 * Parsing de data/hora no formato brasileiro (DD/MM/AAAA[ HH:mm]) usado
 * pelas propostas de agendamento/tarefa, executado NO SERVIDOR (dentro do
 * handler de confirmacao) — nunca mais no navegador.
 *
 * IMPORTANTE: o horario digitado/proposto e sempre horario de Sao Paulo
 * (e o que a nutricionista ve e confirma). Construir a data com
 * `new Date(ano, mes, dia, hora, minuto)` (como uma implementacao anterior
 * deste arquivo fazia) interpreta os componentes no fuso horario LOCAL do
 * processo Node — em producao (Vercel), isso e UTC, nao America/Sao_Paulo,
 * o que deslocava todo agendamento confirmado em 3 horas. O mesmo padrao ja
 * usado em lib/repositories/availability.ts (offset explicito -03:00) e
 * usado aqui para o resultado ser independente do fuso horario do servidor.
 */
const SAO_PAULO_OFFSET = "-03:00";

export function parseBrDateTimeToIso(text: string): string | null {
  const match = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00${SAO_PAULO_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseBrDateToIsoDate(text: string): string | null {
  const match = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}
