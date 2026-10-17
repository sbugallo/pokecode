import { describe, expect, test } from "bun:test"
import {
  experienceForNextLevel,
  moveLearningDecision,
  moveReplacementDecision,
  nextLevelAdvance,
  normalizeGrowthRate,
  regionalEvolutionTarget,
} from "../../../../../src/domain/progression/policies.js"

describe("progression policies", () => {
  test.each([
    { name: "medium-fast growth", growthRate: "medium-fast" as const, expected: 91 },
    { name: "medium-slow growth", growthRate: "medium-slow" as const, expected: 44 },
  ])("calculates the level-five cost for $name", ({ growthRate, expected }) => {
    // GIVEN
    // WHEN
    const cost = experienceForNextLevel(growthRate, 5)

    // THEN
    expect(cost).toBe(expected)
  })

  test.each([
    {
      name: "insufficient experience",
      input: { level: 5, experience: 90, growthRate: "medium-fast" as const },
      expected: null,
    },
    {
      name: "exact experience threshold",
      input: { level: 5, experience: 91, growthRate: "medium-fast" as const },
      expected: { level: 6, experience: 0, experienceCost: 91 },
    },
    {
      name: "the level cap",
      input: { level: 100, experience: 999999, growthRate: "medium" as const },
      expected: null,
    },
    {
      name: "invalid experience",
      input: { level: 5, experience: Number.NaN, growthRate: "medium-fast" as const },
      expected: null,
    },
  ])("returns the $name level-advance result", ({ input, expected }) => {
    // GIVEN
    // WHEN
    const advance = nextLevelAdvance(input)

    // THEN
    expect(advance).toEqual(expected)
  })

  test.each([
    {
      name: "already-known move",
      current: [{ id: "tackle" }],
      learned: { id: "tackle" },
      expected: { kind: "already-known" },
    },
    {
      name: "available move slot",
      current: [{ id: "tackle" }],
      learned: { id: "growl" },
      expected: { kind: "learn", position: 2 },
    },
    {
      name: "full move set",
      current: [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }],
      learned: { id: "5" },
      expected: { kind: "choice" },
    },
  ] as const)("decides how to handle the $name case", ({ current, learned, expected }) => {
    // GIVEN
    // WHEN
    const decision = moveLearningDecision(current, learned)

    // THEN
    expect(decision).toEqual(expected)
  })

  test.each([
    { name: "declining the offered move", selected: "razor-leaf", expected: { kind: "decline" } },
    {
      name: "selecting a known move",
      selected: "growl",
      expected: { kind: "replace", position: 2 },
    },
    { name: "selecting an unknown move", selected: "unknown", expected: { kind: "invalid" } },
  ] as const)("returns the $name replacement decision", ({ selected, expected }) => {
    // GIVEN
    const currentMoves = [
      { id: "tackle", position: 1 },
      { id: "growl", position: 2 },
    ]

    // WHEN
    const decision = moveReplacementDecision(currentMoves, "razor-leaf", selected)

    // THEN
    expect(decision).toEqual(expected)
  })

  test("normalizes unknown source growth rates to medium", () => {
    // GIVEN
    // WHEN
    const known = normalizeGrowthRate("medium-fast")
    const unknown = normalizeGrowthRate("unrecognized-source-rate")

    // THEN
    expect(known).toBe("medium-fast")
    expect(unknown).toBe("medium")
  })

  test.each([
    { region: "alola", source: "pikachu", target: "raichu", expected: "raichu-alola" },
    { region: "kanto", source: "pikachu", target: "raichu", expected: "raichu" },
  ])(
    "resolves the regional evolution target in $region",
    ({ region, source, target, expected }) => {
      // GIVEN
      // WHEN
      const resolved = regionalEvolutionTarget(region, source, target)

      // THEN
      expect(resolved).toBe(expected)
    },
  )
})
