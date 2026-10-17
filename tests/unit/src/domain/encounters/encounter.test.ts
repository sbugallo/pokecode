import { describe, expect, test } from "bun:test"
import {
  eligibleOrdinaryEncounters,
  eligibleSpecialEncounters,
  generateCapturedAttributes,
  generateEncounterAttributes,
  randomInteger,
  selectSpecialEncounter,
  selectWeightedEncounter,
} from "../../../../../src/domain/encounters/encounter.js"

describe("encounter rules", () => {
  test.each([
    { name: "the lower endpoint", roll: 0, expected: 3 },
    { name: "the upper endpoint", roll: 1, expected: 7 },
  ])("includes $name in the integer range", ({ roll, expected }) => {
    // GIVEN
    // WHEN
    const value = randomInteger(3, 7, () => roll)

    // THEN
    expect(value).toBe(expected)
  })

  test.each([
    { name: "the first weighted candidate", roll: 0, expected: "first" },
    { name: "the next candidate at an exact weight boundary", roll: 0.25, expected: "second" },
    { name: "the final candidate at the upper endpoint", roll: 1, expected: "second" },
  ])("selects $name", ({ roll, expected }) => {
    // GIVEN
    const candidates = [
      { id: "first", weight: 1 },
      { id: "second", weight: 3 },
    ]

    // WHEN
    const selected = selectWeightedEncounter(candidates, () => roll)

    // THEN
    expect(selected?.id).toBe(expected)
  })

  test.each([
    { name: "the first eligible special", roll: 0.0099, expected: "one" },
    { name: "the next special at its probability boundary", roll: 0.01, expected: "two" },
    { name: "no special at the exclusive probability limit", roll: 0.02, expected: null },
  ])("respects $name probability", ({ roll, expected }) => {
    // GIVEN
    const candidates = [
      { specialEncounterId: "one", minimumLevel: 1, maximumLevel: 80, weight: 1 },
      { specialEncounterId: "two", minimumLevel: 1, maximumLevel: 80, weight: 1 },
    ]

    // WHEN
    const selected = selectSpecialEncounter(candidates, () => roll)

    // THEN
    expect(selected?.specialEncounterId ?? null).toBe(expected)
  })

  test("caps eligible ordinary encounters and excludes unavailable or triggered specials", () => {
    // GIVEN
    const ordinary = [
      { id: "available", minimumLevel: 4, maximumLevel: 20, weight: 2 },
      { id: "too-high", minimumLevel: 21, maximumLevel: 30, weight: 1 },
    ]
    const specials = [
      { specialEncounterId: "triggered", minimumLevel: 2, maximumLevel: 80, weight: 1 },
      { specialEncounterId: "too-high", minimumLevel: 6, maximumLevel: 80, weight: 1 },
      { specialEncounterId: "available", minimumLevel: 5, maximumLevel: 80, weight: 1 },
    ]

    // WHEN
    const availableOrdinary = eligibleOrdinaryEncounters(ordinary, 10)
    const availableSpecials = eligibleSpecialEncounters(specials, 5, new Set(["triggered"]))

    // THEN
    expect(availableOrdinary).toEqual([
      { id: "available", minimumLevel: 4, maximumLevel: 10, weight: 2 },
    ])
    expect(availableSpecials.map(({ specialEncounterId }) => specialEncounterId)).toEqual([
      "available",
    ])
  })

  test.each([
    {
      name: "the lower level and gender endpoints",
      options: ["male", "female"] as const,
      rolls: [0, 0, 0],
      level: 3,
      gender: "male",
      shiny: true,
    },
    {
      name: "the upper level and gender endpoints",
      options: ["male", "female"] as const,
      rolls: [1, 1, 1],
      level: 7,
      gender: "female",
      shiny: false,
    },
    {
      name: "the middle gender boundary",
      options: ["male", "female"] as const,
      rolls: [0.5, 0.5, 0],
      level: 5,
      gender: "female",
      shiny: true,
    },
    {
      name: "an unknown catalog gender",
      options: ["unknown"] as const,
      rolls: [0, 0, 0],
      level: 3,
      gender: "genderless",
      shiny: true,
    },
  ])(
    "generates attributes at $name from injected boundary values",
    ({ options, rolls, level, gender, shiny }) => {
      // GIVEN
      const values = [...rolls]
      const random = () => values.shift() ?? 0

      // WHEN
      const attributes = generateEncounterAttributes(3, 7, options, random)

      // THEN
      expect(attributes).toEqual({ level, gender, shiny })
    },
  )

  test("rejects an encounter species with no available genders", () => {
    // GIVEN
    // WHEN
    const generate = () => generateEncounterAttributes(5, 5, [], () => 0)

    // THEN
    expect(generate).toThrow("no available genders")
  })

  test.each([
    { name: "at the shiny threshold", roll: 1 / 4096, shiny: false },
    { name: "zero", roll: 0, shiny: true },
  ])("applies the shiny comparison at $name", ({ roll, shiny }) => {
    // GIVEN
    const values = [0, 0, roll]

    // WHEN
    const attributes = generateEncounterAttributes(3, 7, ["male"], () => values.shift() ?? 0)

    // THEN
    expect(attributes.shiny).toBe(shiny)
  })

  test("generates captured nature and IV values from the supplied random source", () => {
    // GIVEN
    const values = [0, 0, 0.1, 0.2, 0.3, 0.4, 0.5]
    const natures = ["Hardy", "Lonely", "Brave"]

    // WHEN
    const attributes = generateCapturedAttributes(() => values.shift() ?? 0, natures)

    // THEN
    expect(attributes).toEqual({ nature: "Hardy", ivs: [0, 3, 6, 9, 12, 16] })
  })

  test("returns no weighted selection when the candidate list is empty", () => {
    // GIVEN
    // WHEN
    const selected = selectWeightedEncounter([], () => 0)

    // THEN
    expect(selected).toBeNull()
  })
})
