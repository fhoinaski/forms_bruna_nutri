import { describe, expect, it } from "vitest";
import { practicalPortionsForFood } from "@/lib/nutrition/practical-portions";

describe("practicalPortionsForFood", () => {
  it("offers a clearly estimated household unit for eggs when no official portion exists", () => {
    expect(practicalPortionsForFood("Ovo de galinha cozido")).toEqual([
      expect.objectContaining({ unit: "unidade", gramWeight: 50, estimated: true }),
    ]);
  });

  it("uses a slice for loaf bread and a unit for French bread", () => {
    expect(practicalPortionsForFood("Pão integral")[0]).toMatchObject({ unit: "fatia", gramWeight: 25 });
    expect(practicalPortionsForFood("Pão francês")[0]).toMatchObject({ unit: "unidade", gramWeight: 50 });
  });
});
