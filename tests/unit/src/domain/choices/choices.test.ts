import { describe, expect, test } from "bun:test"
import {
  decodeChoicePayload,
  decodeEvolutionChoiceProjection,
  decodeMoveChoiceProjection,
  decodeRegionChoiceProjection,
  encodeChoicePayload,
} from "../../../../../src/domain/choices/choices.js"

const pokemonId = "00000000-0000-4000-8000-000000000001"

describe("choice payload codec", () => {
  test("catch choices require an explicit encounter identity", () => {
    const choice = { kind: "catch", payload: { encounterId: pokemonId } } as const
    expect(decodeChoicePayload("catch", encodeChoicePayload(choice))).toEqual(choice)
    expect(decodeChoicePayload("catch", "{}")).toBeNull()
    expect(decodeChoicePayload("catch", '{"encounterId":"not-an-id"}')).toBeNull()
    expect(
      decodeChoicePayload("catch", JSON.stringify({ encounterId: pokemonId, extra: true })),
    ).toBeNull()
  })

  test("round-trips a valid move choice", () => {
    // GIVEN
    const choice = {
      kind: "move",
      payload: { pokemonId, move: { id: "ember", name: "Ember" } },
    } as const

    // WHEN
    const decoded = decodeChoicePayload("move", encodeChoicePayload(choice))

    // THEN
    expect(decoded).toEqual(choice)
  })

  test.each([
    { name: "an invalid payload shape", kind: "move", payload: "{}", expected: null },
    {
      name: "an unsupported choice kind",
      kind: "future-choice",
      payload: "not-json",
      expected: null,
    },
  ])("returns null for $name", ({ kind, payload, expected }) => {
    // GIVEN
    // WHEN
    const decoded = decodeChoicePayload(kind, payload)

    // THEN
    expect(decoded).toBe(expected)
  })

  test.each([
    { name: "a recognized choice kind", decode: () => decodeChoicePayload("move", "not-json") },
    { name: "a UI choice projection", decode: () => decodeRegionChoiceProjection("not-json") },
  ])("surfaces malformed JSON for $name", ({ decode }) => {
    // GIVEN
    // WHEN
    const result = () => decode()

    // THEN
    expect(result).toThrow(SyntaxError)
  })

  test("projects only the fields the move interface consumes", () => {
    // GIVEN
    const payload = JSON.stringify({
      pokemonId,
      move: { id: "ember", name: "Ember", extra: true },
      extra: true,
    })

    // WHEN
    const projection = decodeMoveChoiceProjection(payload)

    // THEN
    expect(projection).toEqual({ pokemonId, move: { id: "ember", name: "Ember" } })
  })

  test("projects a region choice and ignores unrelated fields", () => {
    // GIVEN
    const regionPayload = '{"region":"kanto","extra":true}'
    // WHEN
    const region = decodeRegionChoiceProjection(regionPayload)

    // THEN
    expect(region).toEqual({ region: "kanto" })
  })

  test("projects valid evolution choices and ignores unrelated fields", () => {
    // GIVEN
    const payload = `{"pokemonId":"${pokemonId}","options":[{"speciesId":"vaporeon","name":"Vaporeon","extra":true},{"speciesId":"jolteon","name":"Jolteon"}],"extra":true}`

    // WHEN
    const projection = decodeEvolutionChoiceProjection(payload)

    // THEN
    expect(projection).toEqual({
      pokemonId,
      options: [
        { speciesId: "vaporeon", name: "Vaporeon" },
        { speciesId: "jolteon", name: "Jolteon" },
      ],
    })
  })

  test("rejects evolution choices with fewer than two options", () => {
    // GIVEN
    const payload = `{"pokemonId":"${pokemonId}","options":[{"speciesId":"vaporeon","name":"Vaporeon"}]}`

    // WHEN
    const projection = decodeEvolutionChoiceProjection(payload)

    // THEN
    expect(projection).toBeNull()
  })

  test("rejects evolution choices without the source Pokémon identity", () => {
    const payload =
      '{"options":[{"speciesId":"vaporeon","name":"Vaporeon"},{"speciesId":"jolteon","name":"Jolteon"}]}'
    expect(decodeEvolutionChoiceProjection(payload)).toBeNull()
  })
})
