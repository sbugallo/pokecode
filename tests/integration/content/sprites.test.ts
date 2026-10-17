import { describe, expect, test } from "bun:test"
import { generatedContentCatalog } from "../../../src/domain/content/catalog.js"
import { generatedCatalogSchema } from "../../../src/domain/content/schema.js"

const spriteBase =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white"

describe("catalog sprite contracts", () => {
  test("provides complete normal and shiny sprite pairs for every species and regional form", () => {
    // GIVEN
    const species = [...generatedContentCatalog.species, ...generatedContentCatalog.regionalForms]

    // WHEN
    const completePairs = species.every(
      (entry) =>
        entry.sprites.default.normal.startsWith(`${spriteBase}/`) &&
        entry.sprites.default.shiny.startsWith(`${spriteBase}/shiny/`) &&
        (entry.sprites.female === null ||
          (entry.sprites.female.normal.startsWith(`${spriteBase}/`) &&
            entry.sprites.female.shiny.startsWith(`${spriteBase}/shiny/`))),
    )

    // THEN
    expect(species).toHaveLength(1066)
    expect(completePairs).toBe(true)
    for (const entry of species) expect(entry).not.toHaveProperty("spriteUrl")
  })

  test("rejects a catalog entry with an incomplete female sprite pair", () => {
    // GIVEN
    const first = generatedContentCatalog.species[0]
    if (first === undefined) throw new Error("Expected catalog species")
    const invalidCatalog = {
      ...generatedContentCatalog,
      species: [
        {
          ...first,
          sprites: {
            default: first.sprites.default,
            female: { normal: `${spriteBase}/female/668.png`, shiny: null },
          },
        },
      ],
    }

    // WHEN
    const result = generatedCatalogSchema.safeParse(invalidCatalog)

    // THEN
    expect(result.success).toBe(false)
  })
})
