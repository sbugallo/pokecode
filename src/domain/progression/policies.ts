import type { Move } from "../pokemon/types.js"

export type GrowthRate =
  | "fast"
  | "medium"
  | "medium-fast"
  | "medium-slow"
  | "slow"
  | "slow-then-very-fast"
  | "fast-then-very-slow"

export function experienceForNextLevel(growthRate: GrowthRate, level: number): number {
  return totalExperience(growthRate, level + 1) - totalExperience(growthRate, level)
}

function totalExperience(growthRate: GrowthRate, level: number): number {
  switch (growthRate) {
    case "medium":
    case "medium-fast":
      return level ** 3
    case "medium-slow":
      return Math.floor((6 * level ** 3) / 5 - 15 * level ** 2 + 100 * level - 140)
    case "slow":
      return Math.floor((5 * level ** 3) / 4)
    case "fast":
      return Math.floor((4 * level ** 3) / 5)
    case "slow-then-very-fast":
      return Math.floor((level ** 3 * (100 - level)) / 50)
    case "fast-then-very-slow":
      return Math.floor((level ** 3 * (level + 1)) / 50)
  }
}

export type LevelAdvance = {
  readonly level: number
  readonly experience: number
  readonly experienceCost: number
}

/** Advance one level at a time so each level's move and evolution choices can be resolved. */
export function nextLevelAdvance(input: {
  readonly level: number
  readonly experience: number
  readonly growthRate: GrowthRate
}): LevelAdvance | null {
  if (input.level >= 100) return null
  const experienceCost = experienceForNextLevel(input.growthRate, input.level)
  if (!(input.experience >= experienceCost)) return null
  return {
    level: input.level + 1,
    experience: input.experience - experienceCost,
    experienceCost,
  }
}

export type MoveLearningDecision =
  | { readonly kind: "already-known" }
  | { readonly kind: "learn"; readonly position: number }
  | { readonly kind: "choice" }

export function moveLearningDecision(
  currentMoves: readonly Pick<Move, "id">[],
  learnedMove: Pick<Move, "id">,
  maximumMoves = 4,
): MoveLearningDecision {
  if (currentMoves.some((move) => move.id === learnedMove.id)) return { kind: "already-known" }
  if (currentMoves.length < maximumMoves)
    return { kind: "learn", position: currentMoves.length + 1 }
  return { kind: "choice" }
}

export type MoveReplacementDecision =
  | { readonly kind: "invalid" }
  | { readonly kind: "decline" }
  | { readonly kind: "replace"; readonly position: number }

export function moveReplacementDecision(
  currentMoves: readonly { readonly id: string; readonly position: number }[],
  offeredMoveId: string,
  selectedMoveId: string,
): MoveReplacementDecision {
  if (selectedMoveId === offeredMoveId) return { kind: "decline" }
  const selected = currentMoves.find((move) => move.id === selectedMoveId)
  return selected === undefined
    ? { kind: "invalid" }
    : { kind: "replace", position: selected.position }
}

export function normalizeGrowthRate(value: string): GrowthRate {
  switch (value) {
    case "fast":
    case "medium":
    case "medium-fast":
    case "medium-slow":
    case "slow":
    case "slow-then-very-fast":
    case "fast-then-very-slow":
      return value
    default:
      return "medium"
  }
}

const regionalEvolutionTargets: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  alola: {
    "pikachu>raichu": "raichu-alola",
    "cubone>marowak": "marowak-alola",
    "exeggcute>exeggutor": "exeggutor-alola",
  },
  galar: {
    "koffing>weezing": "weezing-galar",
    "mime-jr>mr-mime": "mr-mime-galar",
  },
}

export function regionalEvolutionTarget(
  regionId: string | null | undefined,
  sourceSpeciesId: string,
  targetSpeciesId: string,
): string {
  return (
    regionalEvolutionTargets[regionId ?? ""]?.[`${sourceSpeciesId}>${targetSpeciesId}`] ??
    targetSpeciesId
  )
}
