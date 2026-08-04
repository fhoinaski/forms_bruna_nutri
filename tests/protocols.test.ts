import { describe, expect, it } from "vitest";
import { getPhaseDueInDays, parseProtocolActions } from "../lib/protocols/helpers";

describe("protocol management helpers", () => {
  it("keeps only valid action strings from stored phases", () => {
    expect(parseProtocolActions('["Planejar refeições",42,null,"Revisar hidratação"]')).toEqual([
      "Planejar refeições",
      "Revisar hidratação",
    ]);
    expect(parseProtocolActions("invalid-json")).toEqual([]);
  });

  it("uses the last day of a phase as the task deadline", () => {
    expect(getPhaseDueInDays("1-14", 0)).toBe(14);
    expect(getPhaseDueInDays("dias 15 a 30", 1)).toBe(30);
  });

  it("falls back to weekly deadlines when the period is omitted", () => {
    expect(getPhaseDueInDays(null, 0)).toBe(7);
    expect(getPhaseDueInDays("", 2)).toBe(21);
  });
});
