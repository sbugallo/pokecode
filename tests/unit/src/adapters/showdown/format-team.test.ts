import { describe, expect, test } from "bun:test"
import { formatShowdownTeam } from "../../../../../src/adapters/showdown/format-team.js"
import { pokemonInstanceSchema } from "../../../../../src/domain/pokemon/model.js"

function pokemon(speciesId: string, name: string, ability: string) {
  return pokemonInstanceSchema.parse({
    id: "00000000-0000-4000-8000-000000000001",
    speciesId,
    name,
    level: 5,
    experience: 0,
    ability,
    nature: "Modest",
    shiny: true,
    ivs: { hp: 31, attack: 2, defense: 30, specialAttack: 29, specialDefense: 28, speed: 27 },
    evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
    moves: [
      { id: "tackle", name: "Tackle" },
      { id: "growl", name: "Growl" },
    ],
  })
}

describe("Showdown team formatting", () => {
  test("formats a generated team as a National Dex Showdown paste", () => {
    // GIVEN
    const bulbasaur = pokemon("bulbasaur", "Bulbasaur", "Overgrow")

    // WHEN
    const exported = formatShowdownTeam([bulbasaur])

    // THEN
    expect(exported).toBe(
      [
        "Bulbasaur (Shiny)",
        "Ability: Overgrow",
        "Level: 5",
        "Shiny: Yes",
        "EVs: 0 HP / 0 Atk / 0 Def / 0 SpA / 0 SpD / 0 Spe",
        "IVs: 31 HP / 2 Atk / 30 Def / 29 SpA / 28 SpD / 27 Spe",
        "Modest Nature",
        "- Tackle",
        "- Growl",
      ].join("\n"),
    )
  })

  test("uses Showdown's established regional-form identifier", () => {
    // GIVEN
    const raichu = pokemon("raichu-alola", "Alolan Raichu", "Surge Surfer")

    // WHEN
    const exported = formatShowdownTeam([raichu])

    // THEN
    expect(exported.split("\n")[0]).toBe("Raichu-Alola (Shiny)")
  })
})
