import { describe, expect, test } from "bun:test"
import { movesCatalog } from "../../../src/domain/content/catalogs/moves-catalog.js"

describe("move catalog metadata", () => {
  test("provides current stats and bilingual descriptions for every existing move", () => {
    expect(movesCatalog).toHaveLength(805)
    expect(new Set(movesCatalog.map(({ id }) => id)).size).toBe(movesCatalog.length)
    for (const move of movesCatalog) {
      expect(move).not.toHaveProperty("descriptionSources")
      expect(move).not.toHaveProperty("descriptionVersionGroups")
      expect(["physical", "special", "status"]).toContain(move.category)
      expect([
        "normal",
        "fire",
        "water",
        "electric",
        "grass",
        "ice",
        "fighting",
        "poison",
        "ground",
        "flying",
        "psychic",
        "bug",
        "rock",
        "ghost",
        "dragon",
        "dark",
        "steel",
        "fairy",
      ]).toContain(move.type)
      if (move.power !== null) {
        expect(Number.isInteger(move.power)).toBe(true)
        expect(move.power).toBeGreaterThanOrEqual(0)
      }
      if (move.accuracy !== null) {
        expect(Number.isInteger(move.accuracy)).toBe(true)
        expect(move.accuracy).toBeGreaterThanOrEqual(0)
        expect(move.accuracy).toBeLessThanOrEqual(100)
      }
      expect(Number.isInteger(move.pp)).toBe(true)
      expect(move.pp).toBeGreaterThan(0)
      for (const language of ["es", "en"] as const) {
        expect(move.descriptions[language].trim().length).toBeGreaterThan(0)
        expect(move.descriptions[language]).not.toMatch(/[\n\r\f]/u)
      }
    }
  })

  test("uses modern stats and categories instead of historical values", () => {
    expect(movesCatalog.find(({ id }) => id === "tackle")).toMatchObject({
      power: 40,
      accuracy: 100,
      category: "physical",
      type: "normal",
      pp: 35,
    })
    expect(movesCatalog.find(({ id }) => id === "vine-whip")).toMatchObject({
      power: 45,
      type: "grass",
      pp: 25,
    })
    expect(movesCatalog.find(({ id }) => id === "water-shuriken")?.category).toBe("special")
  })

  test("preserves null power and accuracy rather than inventing zeroes or percentages", () => {
    expect(movesCatalog.find(({ id }) => id === "swords-dance")).toMatchObject({
      power: null,
      accuracy: null,
      category: "status",
      pp: 20,
    })
    expect(movesCatalog.find(({ id }) => id === "swift")).toMatchObject({
      power: 60,
      accuracy: null,
      category: "special",
    })
  })

  test("includes Spanish translation fallbacks where PokéAPI descriptions are unavailable", () => {
    expect(movesCatalog.find(({ id }) => id === "rage-fist")).toMatchObject({
      power: 50,
      accuracy: 100,
      category: "physical",
      pp: 10,
      descriptions: {
        es: "Convierte su ira en energía para atacar. Cuantas más veces haya recibido ataques el usuario, mayor será la potencia del movimiento.",
      },
    })
  })
})
