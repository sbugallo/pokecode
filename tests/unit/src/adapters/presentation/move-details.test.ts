import { describe, expect, test } from "bun:test"
import { presentMove } from "../../../../../src/adapters/presentation/move-details.js"

describe("move presentation", () => {
  test("formats localized move names, elemental types, categories, stats, and descriptions", () => {
    expect(presentMove({ id: "tackle", name: "Old name" }, "en")).toMatchObject({
      name: "Tackle",
      classification: "Normal · Physical",
      stats: "Pow 40 · Acc 100% · PP 35",
    })
    expect(presentMove({ id: "vine-whip", name: "Vine Whip" }, "es")).toMatchObject({
      name: "Látigo Cepa",
      classification: "Planta · Físico",
      stats: "Pot 45 · Prec 100% · PP 25",
      description: "Azota al objetivo con ramas finas.",
    })
  })

  test("shows zero power for status moves without inventing accuracy values", () => {
    expect(presentMove({ id: "growth", name: "Growth" }, "en")).toMatchObject({
      classification: "Normal · Status",
      stats: "Pow 0 · Acc — · PP 20",
    })
    expect(presentMove({ id: "tachyon-cutter", name: "Tachyon Cutter" }, "en").stats).toBe(
      "Pow 50 · Acc — · PP 10",
    )
  })

  test("preserves unknown move names and displays placeholders for unavailable metadata", () => {
    expect(presentMove({ id: "custom-move", name: "Custom Move" }, "es")).toMatchObject({
      name: "Custom Move",
      classification: "— · —",
      stats: "Pot — · Prec — · PP —",
      description: "",
    })
  })
})
