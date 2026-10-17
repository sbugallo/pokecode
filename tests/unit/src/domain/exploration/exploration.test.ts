import { describe, expect, test } from "bun:test"
import {
  calculateUnlockProgress,
  locationTravelEligibility,
  regionTravelEligibility,
} from "../../../../../src/domain/exploration/exploration.js"

describe("exploration policies", () => {
  test.each([
    {
      name: "below the unlock threshold",
      input: {
        currentTokens: 8,
        gainedTokens: 1,
        threshold: 10,
        hasNextLocation: true,
        currentLocationIsLatestUnlocked: true,
      },
      expected: { kind: "accumulating", tokenCount: 9 },
    },
    {
      name: "at the unlock threshold",
      input: {
        currentTokens: 8,
        gainedTokens: 2,
        threshold: 10,
        hasNextLocation: true,
        currentLocationIsLatestUnlocked: true,
      },
      expected: { kind: "unlock", tokenCount: 0 },
    },
    {
      name: "at the end of the region",
      input: {
        currentTokens: 8,
        gainedTokens: 2,
        threshold: 10,
        hasNextLocation: false,
        currentLocationIsLatestUnlocked: true,
      },
      expected: { kind: "complete-region", tokenCount: 8 },
    },
    {
      name: "before the latest unlocked location",
      input: {
        currentTokens: 8,
        gainedTokens: 2,
        threshold: 10,
        hasNextLocation: true,
        currentLocationIsLatestUnlocked: false,
      },
      expected: { kind: "not-latest" },
    },
  ])("reports progress $name", ({ input, expected }) => {
    // GIVEN
    // WHEN
    const result = calculateUnlockProgress(input)

    // THEN
    expect(result).toEqual(expected)
  })

  test.each([
    {
      name: "missing location",
      input: { locationExists: false, unlocked: true },
      expected: "invalid-location",
    },
    {
      name: "locked location",
      input: { locationExists: true, unlocked: false },
      expected: "locked-location",
    },
    {
      name: "unlocked location",
      input: { locationExists: true, unlocked: true },
      expected: "allowed",
    },
  ] as const)("returns $name travel eligibility", ({ input, expected }) => {
    // GIVEN
    // WHEN
    const result = locationTravelEligibility(input)

    // THEN
    expect(result).toBe(expected)
  })

  test.each([
    {
      name: "an incomplete current region",
      input: { regionExists: true, currentRegionComplete: false, targetAlreadyVisited: false },
      expected: "region-incomplete",
    },
    {
      name: "a previously visited region",
      input: { regionExists: true, currentRegionComplete: true, targetAlreadyVisited: true },
      expected: "already-visited",
    },
    {
      name: "an unknown region",
      input: { regionExists: false, currentRegionComplete: true, targetAlreadyVisited: false },
      expected: "invalid-region",
    },
  ] as const)("returns $name travel eligibility", ({ input, expected }) => {
    // GIVEN
    // WHEN
    const result = regionTravelEligibility(input)

    // THEN
    expect(result).toBe(expected)
  })
})
