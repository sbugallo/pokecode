import { describe, expect, test } from "bun:test"
import { generateStarter, type StarterTemplate } from "../../../../../src/domain/pokemon/starter.js"

const starter: StarterTemplate = {
  speciesId: "bulbasaur",
  name: "Bulbasaur",
  ability: "Overgrow",
  initialMoves: [
    { id: "tackle", name: "Tackle" },
    { id: "growl", name: "Growl" },
  ],
}

describe("starter creation", () => {
  test("creates a level-five starter with deterministic attributes and defaults", () => {
    // GIVEN
    const values = [0.5, 0, 0, 0.1, 0.2, 0.3, 0.4, 31 / 32]

    // WHEN
    const creation = generateStarter(starter, () => values.shift() ?? 0)

    // THEN
    expect(creation).toEqual({
      speciesId: "bulbasaur",
      name: "Bulbasaur",
      gender: "female",
      ability: "Overgrow",
      nature: "Hardy",
      level: 5,
      experience: 0,
      shiny: false,
      ivs: { hp: 0, attack: 3, defense: 6, specialAttack: 9, specialDefense: 12, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
      moves: starter.initialMoves,
    })
  })
})
