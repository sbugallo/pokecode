import { describe, expect, test } from "bun:test"
import {
  missingPokemonSpriteUrl,
  spriteSourcesForSpecies,
  spriteUrlForSpecies,
} from "../../../../../src/domain/content/sprites.js"

const spritesBase =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white"

describe("sprite lookup", () => {
  test.each([
    { name: "normal male", shiny: false, gender: "male" as const, path: "668.png" },
    { name: "shiny male", shiny: true, gender: "male" as const, path: "shiny/668.png" },
    { name: "normal female", shiny: false, gender: "female" as const, path: "female/668.png" },
    { name: "shiny female", shiny: true, gender: "female" as const, path: "shiny/female/668.png" },
    { name: "shiny genderless", shiny: true, gender: "genderless" as const, path: "shiny/668.png" },
  ])("selects the $name species sprite", ({ shiny, gender, path }) => {
    // GIVEN
    // WHEN
    const url = spriteUrlForSpecies("pyroar", shiny, gender)

    // THEN
    expect(url).toBe(`${spritesBase}/${path}`)
  })

  test("falls back to the default appearance for a female without a separate sprite", () => {
    // GIVEN
    // WHEN
    const url = spriteUrlForSpecies("bulbasaur", true, "female")

    // THEN
    expect(url).toBe(`${spritesBase}/shiny/1.png`)
  })

  test("uses the form-specific Alolan Raichu sprite", () => {
    // GIVEN
    // WHEN
    const alolanRaichu = spriteUrlForSpecies("raichu-alola", true, "female")

    // THEN
    expect(alolanRaichu).toBe(`${spritesBase}/shiny/10100.png`)
  })

  test("uses Oinkologne's separate female variety sprite", () => {
    // GIVEN
    // WHEN
    const femaleOinkologne = spriteUrlForSpecies("oinkologne", true, "female")

    // THEN
    expect(femaleOinkologne).toBe(`${spritesBase}/shiny/10254.png`)
  })

  test("offers shiny, normal, then missing-sprite fallbacks", () => {
    // GIVEN
    // WHEN
    const sources = spriteSourcesForSpecies("pyroar", true, "female")

    // THEN
    expect(sources).toEqual([
      `${spritesBase}/shiny/female/668.png`,
      `${spritesBase}/female/668.png`,
      missingPokemonSpriteUrl,
    ])
  })

  test("uses only the missing-sprite fallback for an unknown species", () => {
    // GIVEN
    // WHEN
    const url = spriteUrlForSpecies("not-a-pokemon", true, "female")
    const sources = spriteSourcesForSpecies("not-a-pokemon", true, "female")

    // THEN
    expect(url).toBeNull()
    expect(sources).toEqual([missingPokemonSpriteUrl])
  })
})
