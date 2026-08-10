/**
 * Parsing de data/hora no formato brasileiro (DD/MM/AAAA[ HH:mm]) usado
 * pelas propostas de agendamento/tarefa. Mesma logica que ja existe em
 * AiChatWidget.tsx (client) — copia server-side pequena e pura, para o
 * endpoint de confirmacao de proposta nao depender de importar de dentro de
 * um componente "use client".
 */
export function parseBrDateTimeToIso(text: string): string | null {
  const match = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseBrDateToIsoDate(text: string): string | null {
  const match = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}
