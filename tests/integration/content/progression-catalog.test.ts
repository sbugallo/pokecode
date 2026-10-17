import { describe, expect, test } from "bun:test"
import { generatedContentCatalog } from "../../../src/domain/content/catalog.js"
import { movesCatalog } from "../../../src/domain/content/catalogs/moves-catalog.js"
import { pokemonCatalog } from "../../../src/domain/content/catalogs/pokemon-catalog.js"
import { regionalFormsCatalog } from "../../../src/domain/content/catalogs/regional-forms-catalog.js"
import { evolutionAtLevel, initialMoves } from "../../../src/domain/progression/catalog.js"
import { levelForEvolution } from "../../../src/domain/progression/level-evolution.js"

describe("progression catalog contracts", () => {
  test("resolves every sourced catalog evolution at a valid level", () => {
    // GIVEN
    const evolutions = [
      ...generatedContentCatalog.species,
      ...generatedContentCatalog.regionalForms,
    ].flatMap((species) =>
      species.evolutions.map((evolution) => ({ sourceSpeciesId: species.id, ...evolution })),
    )

    // WHEN
    const resolved = evolutions.map((evolution) => {
      const level = levelForEvolution(evolution)
      return {
        evolution,
        level,
        rule: evolutionAtLevel(
          evolution.sourceSpeciesId,
          level,
          evolution.conditions.some((c) => c.kind === "gender" && c.value === "female")
            ? "female"
            : "male",
        ),
      }
    })

    // THEN
    expect(resolved).toHaveLength(497)
    for (const { evolution, level, rule } of resolved) {
      expect(level).toBeGreaterThanOrEqual(1)
      expect(level).toBeLessThanOrEqual(100)
      expect(rule?.targets.map(({ speciesId }) => speciesId)).toContain(evolution.targetSpeciesId)
    }
  })

  test("preserves independently reviewed Kadabra and Primeape evolution milestones", () => {
    // GIVEN
    const kadabra = generatedContentCatalog.species.find(({ id }) => id === "kadabra")
      ?.evolutions[0]
    const primeape = generatedContentCatalog.species.find(({ id }) => id === "primeape")
      ?.evolutions[0]

    // WHEN
    const kadabraLevel =
      kadabra === undefined ? null : levelForEvolution({ sourceSpeciesId: "kadabra", ...kadabra })
    const primeapeLevel =
      primeape === undefined
        ? null
        : levelForEvolution({ sourceSpeciesId: "primeape", ...primeape })

    // THEN
    expect(kadabraLevel).toBe(45)
    expect(primeapeLevel).toBe(44)
  })

  test("keeps every non-empty learnset tied to a version group and ordered by level then English name", () => {
    // GIVEN
    const entries = [...pokemonCatalog, ...regionalFormsCatalog]
    const moveNames = new Map(movesCatalog.map((move) => [move.id, move.localization.en]))

    // WHEN
    const groupedAndOrdered = entries.every((entry) => {
      const sorted = [...entry.learnset].sort(
        (left, right) =>
          left.level - right.level ||
          (moveNames.get(left.id) ?? left.id).localeCompare(
            moveNames.get(right.id) ?? right.id,
            "en",
          ),
      )
      return (
        (entry.learnset.length === 0 || entry.learnsetVersionGroup !== null) &&
        entry.learnset.every((move) => moveNames.has(move.id)) &&
        JSON.stringify(entry.learnset) === JSON.stringify(sorted)
      )
    })

    // THEN
    expect(groupedAndOrdered).toBe(true)
  })

  test("retains the reviewed current Scarlet/Violet Bulbasaur learnset", () => {
    // GIVEN
    const bulbasaur = pokemonCatalog.find((species) => species.id === "bulbasaur")

    // WHEN
    const version = bulbasaur?.learnsetVersionGroup
    const learnset = bulbasaur?.learnset

    // THEN
    expect(version).toBe("scarlet-violet")
    expect(learnset).toEqual([
      { id: "growl", level: 1 },
      { id: "tackle", level: 1 },
      { id: "vine-whip", level: 3 },
      { id: "growth", level: 6 },
      { id: "leech-seed", level: 9 },
      { id: "razor-leaf", level: 12 },
      { id: "poison-powder", level: 15 },
      { id: "sleep-powder", level: 15 },
      { id: "seed-bomb", level: 18 },
      { id: "take-down", level: 21 },
      { id: "sweet-scent", level: 24 },
      { id: "synthesis", level: 27 },
      { id: "worry-seed", level: 30 },
      { id: "power-whip", level: 33 },
      { id: "solar-beam", level: 36 },
    ])
  })

  test("keeps canonical Bulbasaur metadata normalized separately from display names", () => {
    // GIVEN
    const bulbasaur = generatedContentCatalog.species.find((species) => species.id === "bulbasaur")
    const vineWhip = movesCatalog.find((move) => move.id === "vine-whip")

    // WHEN
    const metadata = {
      pokedexNumber: bulbasaur?.pokedexNumber,
      types: bulbasaur?.types,
      abilities: bulbasaur?.abilities,
      firstEvolution: bulbasaur?.evolutions[0],
      moveLocalization: vineWhip?.localization,
    }

    // THEN
    expect(metadata).toMatchObject({
      pokedexNumber: 1,
      types: ["grass", "poison"],
      abilities: ["overgrow", "chlorophyll"],
      firstEvolution: {
        targetSpeciesId: "ivysaur",
        method: "level",
        conditions: [{ kind: "level", value: 16 }],
      },
      moveLocalization: { en: "Vine Whip", es: "Látigo Cepa" },
    })
    expect(bulbasaur).not.toHaveProperty("name")
    expect(vineWhip).not.toHaveProperty("name")
  })

  test("selects level-eligible Galarian Articuno moves in its catalog order", () => {
    // GIVEN
    // WHEN
    const moves = initialMoves("articuno-galar", 70)

    // THEN
    expect(moves.map(({ id }) => id)).toEqual([
      "hurricane",
      "double-team",
      "future-sight",
      "trick-room",
    ])
  })

  test("uses region context for regional form evolution targets", () => {
    // GIVEN
    // WHEN
    const alolanRattata = evolutionAtLevel("rattata-alola", 20, "male")?.targets[0]?.speciesId
    const alolanRaichu = evolutionAtLevel("pikachu", 36, "male", "alola")?.targets[0]?.speciesId
    const kantonianRaichu = evolutionAtLevel("pikachu", 36, "male", "kanto")?.targets[0]?.speciesId
    const paldeanWooper = evolutionAtLevel("wooper-paldea", 20, "male")?.targets[0]?.speciesId

    // THEN
    expect([alolanRattata, alolanRaichu, kantonianRaichu, paldeanWooper]).toEqual([
      "raticate-alola",
      "raichu-alola",
      "raichu",
      "clodsire",
    ])
  })
})
