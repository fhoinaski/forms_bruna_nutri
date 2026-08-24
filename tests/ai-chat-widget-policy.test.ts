import { describe, expect, it } from "vitest";
import { shouldAutoOpenDailyBriefing } from "../lib/ai/presentation/assistant-widget-policy";

describe("shouldAutoOpenDailyBriefing", () => {
  it("auto-opens only on the operational dashboard", () => {
    expect(shouldAutoOpenDailyBriefing("dashboard")).toBe(true);
  });

  it("never auto-opens over clinical or settings workflows", () => {
    for (const page of ["client_record", "agenda", "protocol_detail", "settings", "other"]) {
      expect(shouldAutoOpenDailyBriefing(page)).toBe(false);
    }
  });
});
