import { describe, expect, test } from "bun:test"
import { generatedContentCatalog } from "../../../src/domain/content/catalog.js"
import { evolutionAtLevel } from "../../../src/domain/progression/catalog.js"
import { levelForEvolution } from "../../../src/domain/progression/level-evolution.js"

const species = [...generatedContentCatalog.species, ...generatedContentCatalog.regionalForms]
const regions = generatedContentCatalog.regions.map(({ id }) => id)

describe("level-only evolution policy", () => {
  test.each([
    ["kirlia", 30, "male", ["gardevoir", "gallade"]],
    ["kirlia", 30, "female", ["gardevoir"]],
    ["snorunt", 42, "male", ["glalie"]],
    ["snorunt", 42, "female", ["glalie", "froslass"]],
    ["burmy", 20, "male", ["mothim"]],
    ["burmy", 20, "female", ["wormadam"]],
    ["combee", 21, "male", []],
    ["combee", 21, "female", ["vespiquen"]],
    ["salandit", 30, "male", []],
    ["salandit", 30, "female", ["salazzle"]],
    ["combee", 21, "genderless", []],
    ["salandit", 30, "genderless", []],
  ] as const)("filters %s evolutions at level %i for %s", (id, level, gender, targets) => {
    for (const region of regions) {
      expect(evolutionAtLevel(id, level - 1, gender, region)).toBeNull()
      for (const eligibleLevel of [level, 100]) {
        expect(
          evolutionAtLevel(id, eligibleLevel, gender, region)?.targets.map((t) => t.speciesId) ??
            [],
        ).toEqual([...targets])
      }
    }
  })

  test("offers every gender-eligible branch at a shared milestone in every region", () => {
    // GIVEN
    const branching = species.filter((entry) => entry.evolutions.length > 1)

    // WHEN / THEN
    for (const entry of branching) {
      const levels = entry.evolutions.map((evolution) =>
        levelForEvolution({ ...evolution, sourceSpeciesId: entry.id }),
      )
      expect(new Set(levels).size).toBe(1)
      const level = levels[0]
      if (level === undefined) throw new Error(`Missing milestone for ${entry.id}`)
      for (const region of regions) {
        for (const availableGender of entry.availableGenders) {
          const gender = availableGender === "unknown" ? "genderless" : availableGender
          expect(evolutionAtLevel(entry.id, level - 1, gender, region)).toBeNull()
          expect(
            evolutionAtLevel(entry.id, level, gender, region)?.targets.map((t) => t.speciesId),
          ).toEqual(
            entry.evolutions
              .filter((e) => e.conditions.every((c) => c.kind !== "gender" || c.value === gender))
              .map((e) => e.targetSpeciesId),
          )
        }
      }
    }
  })

  test.each([
    ["poliwhirl", 36, ["poliwrath", "politoed"]],
    ["slowpoke", 37, ["slowbro", "slowking"]],
    ["scyther", 45, ["scizor", "kleavor"]],
    ["nincada", 20, ["ninjask", "shedinja"]],
    ["applin", 28, ["flapple", "appletun", "dipplin"]],
    ["slowpoke-galar", 36, ["slowbro-galar", "slowking-galar"]],
  ] as const)("offers %s branches together at level %i", (id, level, targets) => {
    // GIVEN / WHEN / THEN
    expect(evolutionAtLevel(id, level - 1, "male")).toBeNull()
    expect(evolutionAtLevel(id, level, "male")?.targets.map((target) => target.speciesId)).toEqual([
      ...targets,
    ])
  })

  test.each([
    ["meowth", 28, "persian"],
    ["meowth-alola", 30, "persian-alola"],
    ["meowth-galar", 28, "perrserker"],
    ["wooper", 20, "quagsire"],
    ["wooper-paldea", 20, "clodsire"],
    ["yamask", 34, "cofagrigus"],
    ["yamask-galar", 34, "runerigus"],
    ["farfetchd-galar", 40, "sirfetchd"],
    ["corsola-galar", 38, "cursola"],
    ["linoone-galar", 35, "obstagoon"],
    ["mr-mime-galar", 42, "mr-rime"],
    ["graveler-alola", 45, "golem-alola"],
    ["grimer-alola", 32, "muk-alola"],
  ] as const)("keeps %s evolution tied to its source form", (id, level, target) => {
    // GIVEN / WHEN / THEN
    for (const region of regions) {
      expect(evolutionAtLevel(id, level - 1, "male", region)).toBeNull()
      expect(evolutionAtLevel(id, level, "male", region)?.targets.map((t) => t.speciesId)).toEqual([
        target,
      ])
    }
  })

  test.each(["farfetchd", "corsola", "linoone", "mr-mime"])(
    "does not evolve ordinary %s through its regional form's route",
    (id) => {
      // GIVEN / WHEN / THEN
      for (const region of regions) expect(evolutionAtLevel(id, 100, "male", region)).toBeNull()
    },
  )

  test.each([
    ["pikachu", 36, "alola", "raichu-alola", "raichu"],
    ["cubone", 28, "alola", "marowak-alola", "marowak"],
    ["exeggcute", 36, "alola", "exeggutor-alola", "exeggutor"],
    ["koffing", 30, "galar", "weezing-galar", "weezing"],
    ["mime-jr", 20, "galar", "mr-mime-galar", "mr-mime"],
  ] as const)(
    "routes %s by region without changing its milestone",
    (id, level, region, form, base) => {
      // GIVEN / WHEN / THEN
      expect(evolutionAtLevel(id, level - 1, "male", region)).toBeNull()
      expect(evolutionAtLevel(id, level, "male", region)?.targets.map((t) => t.speciesId)).toEqual([
        form,
      ])
      expect(evolutionAtLevel(id, level, "male", "kanto")?.targets.map((t) => t.speciesId)).toEqual(
        [base],
      )
    },
  )

  test("retains overdue evolutions, including all Eevee options", () => {
    // GIVEN / WHEN / THEN
    expect(evolutionAtLevel("staryu", 40, "genderless")?.targets.map((t) => t.speciesId)).toEqual([
      "starmie",
    ])
    expect(evolutionAtLevel("nidorino", 44, "male")?.targets.map((t) => t.speciesId)).toEqual([
      "nidoking",
    ])
    expect(evolutionAtLevel("eevee", 100, "male")?.targets).toHaveLength(8)
  })

  test("preserves the unsupported-form availability shortcuts", () => {
    // GIVEN / WHEN / THEN
    expect(evolutionAtLevel("sneasel", 38, "male")?.targets.map((t) => t.speciesId)).toEqual([
      "weavile",
      "sneasler",
    ])
    expect(evolutionAtLevel("qwilfish", 40, "male")?.targets[0]?.speciesId).toBe("overqwil")
    expect(evolutionAtLevel("basculin", 40, "male")?.targets[0]?.speciesId).toBe("basculegion")
  })
})
