import { describe, expect, test } from "bun:test"
import { availablePokemonGendersSchema } from "../../../../../src/domain/pokemon/types.js"

describe("available Pokémon gender schema", () => {
  test.each([
    { name: "a single unknown-gender option", genders: ["unknown"], valid: true },
    { name: "both selectable genders", genders: ["male", "female"], valid: true },
    { name: "an empty option list", genders: [], valid: false },
    { name: "duplicate options", genders: ["male", "male"], valid: false },
    {
      name: "unknown mixed with a selectable gender",
      genders: ["unknown", "female"],
      valid: false,
    },
    { name: "the stored-only genderless value", genders: ["genderless"], valid: false },
  ])("accepts $name according to the catalog schema", ({ genders, valid }) => {
    // GIVEN
    // WHEN
    const result = availablePokemonGendersSchema.safeParse(genders)

    // THEN
    expect(result.success).toBe(valid)
  })
})
