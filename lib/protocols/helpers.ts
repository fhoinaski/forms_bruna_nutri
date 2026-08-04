export function parseProtocolActions(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function getPhaseDueInDays(days: string | null, phaseIndex: number): number {
  const dayNumbers = days?.match(/\d+/g)?.map(Number) ?? [];
  return dayNumbers.length ? dayNumbers[dayNumbers.length - 1] : (phaseIndex + 1) * 7;
}
