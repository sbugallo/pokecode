import { z } from "zod"
import { locationIdSchema } from "../shared/identifiers.js"

export const locationStatusSchema = z.object({
  id: locationIdSchema,
  name: z.string().min(1),
  unlocked: z.boolean(),
  encounterless: z.boolean(),
})
export type LocationStatus = z.infer<typeof locationStatusSchema>

export const explorationStatusSchema = z.object({
  regions: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        visited: z.boolean(),
        completed: z.boolean(),
        locations: z.array(locationStatusSchema),
      }),
    )
    .default([]),
  locations: z.array(locationStatusSchema).min(1),
  locationUnlockProgress: z.number().int().nonnegative(),
  locationUnlockThreshold: z.number().int().positive(),
  regionComplete: z.boolean(),
})
export type ExplorationStatus = z.infer<typeof explorationStatusSchema>

export type UnlockProgressResult =
  | { readonly kind: "accumulating"; readonly tokenCount: number }
  | { readonly kind: "unlock"; readonly tokenCount: 0 }
  | { readonly kind: "complete-region"; readonly tokenCount: number }

export type LocationUnlockCurve = {
  readonly baseTokens: number
  readonly exponent: number
  readonly regionExponent: number
}

/**
 * Token cost to advance from the location at `index` to the next one.
 *
 * Follows a region-length-normalized power curve, T(I) = base·(I+1)^exponent·
 * (championIndex+1)^regionExponent, calibrated against main-series gymLeader and
 * champion ace levels so party level tracks story progress. Beyond the champion
 * (postgame/DLC locations) the cost is capped at the champion-approach cost:
 * the curve was fitted on story data only, and extrapolating it would price
 * Galar's DLC tail at tens of millions of tokens.
 */
export function locationUnlockThreshold(input: {
  readonly index: number
  readonly championIndex: number
  readonly curve: LocationUnlockCurve
}): number {
  const capped = Math.min(Math.max(input.index, 0), input.championIndex)
  const cumulative = (i: number) =>
    input.curve.baseTokens *
    (i + 1) ** input.curve.exponent *
    (input.championIndex + 1) ** input.curve.regionExponent
  return Math.round(cumulative(capped + 1) - cumulative(capped))
}

export function calculateUnlockProgress(input: {
  readonly currentTokens: number
  readonly gainedTokens: number
  readonly threshold: number
  readonly hasNextLocation: boolean
  readonly currentLocationIsLatestUnlocked: boolean
}): UnlockProgressResult | { readonly kind: "not-latest" } {
  if (!input.currentLocationIsLatestUnlocked) return { kind: "not-latest" }
  if (!input.hasNextLocation) return { kind: "complete-region", tokenCount: input.currentTokens }
  const tokenCount = input.currentTokens + input.gainedTokens
  return tokenCount < input.threshold
    ? { kind: "accumulating", tokenCount }
    : { kind: "unlock", tokenCount: 0 }
}

export type LocationTravelEligibility = "invalid-location" | "locked-location" | "allowed"
export function locationTravelEligibility(input: {
  readonly locationExists: boolean
  readonly unlocked: boolean
}): LocationTravelEligibility {
  if (!input.locationExists) return "invalid-location"
  return input.unlocked ? "allowed" : "locked-location"
}

export type RegionTravelEligibility =
  | "invalid-region"
  | "region-incomplete"
  | "already-visited"
  | "allowed"
export function regionTravelEligibility(input: {
  readonly regionExists: boolean
  readonly currentRegionComplete: boolean
  readonly targetAlreadyVisited: boolean
}): RegionTravelEligibility {
  if (!input.regionExists) return "invalid-region"
  if (!input.currentRegionComplete) return "region-incomplete"
  if (input.targetAlreadyVisited) return "already-visited"
  return "allowed"
}
