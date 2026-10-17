import { localizedSpeciesName, speciesProgression } from "../content/catalog.js"
import type { Move, PokemonGender } from "../pokemon/types.js"
import { speciesIdSchema } from "../shared/identifiers.js"
import { levelForEvolution } from "./level-evolution.js"
import type { GrowthRate } from "./policies.js"
import { normalizeGrowthRate, regionalEvolutionTarget } from "./policies.js"

export type { GrowthRate } from "./policies.js"
export { experienceForNextLevel } from "./policies.js"

type LearnsetEntry = {
  readonly level: number
  readonly move: Move
}

type EvolutionTarget = {
  readonly speciesId: string
  readonly name: string
}

type EvolutionRule =
  | {
      readonly kind: "level"
      readonly level: number
      readonly targets: readonly [EvolutionTarget, ...EvolutionTarget[]]
    }
  | {
      readonly kind: "milestone"
      readonly milestoneLevel: number
      readonly source: string
      readonly reviewedAt: string
      readonly targets: readonly [EvolutionTarget, ...EvolutionTarget[]]
    }

type SpeciesProgression = {
  readonly growthRate: GrowthRate
  readonly learnset: readonly LearnsetEntry[]
  readonly evolution: EvolutionRule | null
}

const move = (id: string, name: string): Move => ({ id, name })

const catalog = {
  bulbasaur: {
    growthRate: "medium-slow",
    learnset: [
      { level: 1, move: move("tackle", "Tackle") },
      { level: 3, move: move("growl", "Growl") },
      { level: 7, move: move("vine-whip", "Vine Whip") },
      { level: 13, move: move("poison-powder", "Poison Powder") },
    ],
    evolution: {
      kind: "level",
      level: 16,
      targets: [{ speciesId: "ivysaur", name: "Ivysaur" }],
    },
  },
  ivysaur: {
    growthRate: "medium-slow",
    learnset: [{ level: 22, move: move("razor-leaf", "Razor Leaf") }],
    evolution: {
      kind: "level",
      level: 32,
      targets: [{ speciesId: "venusaur", name: "Venusaur" }],
    },
  },
  venusaur: { growthRate: "medium-slow", learnset: [], evolution: null },
  charmander: {
    growthRate: "medium-slow",
    learnset: [
      { level: 1, move: move("scratch", "Scratch") },
      { level: 1, move: move("growl", "Growl") },
      { level: 9, move: move("ember", "Ember") },
      { level: 15, move: move("smokescreen", "Smokescreen") },
    ],
    evolution: {
      kind: "level",
      level: 16,
      targets: [{ speciesId: "charmeleon", name: "Charmeleon" }],
    },
  },
  charmeleon: {
    growthRate: "medium-slow",
    learnset: [{ level: 24, move: move("dragon-rage", "Dragon Rage") }],
    evolution: {
      kind: "level",
      level: 36,
      targets: [{ speciesId: "charizard", name: "Charizard" }],
    },
  },
  charizard: { growthRate: "medium-slow", learnset: [], evolution: null },
  squirtle: {
    growthRate: "medium-slow",
    learnset: [
      { level: 1, move: move("tackle", "Tackle") },
      { level: 4, move: move("tail-whip", "Tail Whip") },
      { level: 7, move: move("water-gun", "Water Gun") },
      { level: 10, move: move("withdraw", "Withdraw") },
    ],
    evolution: {
      kind: "level",
      level: 16,
      targets: [{ speciesId: "wartortle", name: "Wartortle" }],
    },
  },
  wartortle: {
    growthRate: "medium-slow",
    learnset: [{ level: 18, move: move("bite", "Bite") }],
    evolution: {
      kind: "level",
      level: 36,
      targets: [{ speciesId: "blastoise", name: "Blastoise" }],
    },
  },
  blastoise: { growthRate: "medium-slow", learnset: [], evolution: null },
  pidgey: {
    growthRate: "medium-slow",
    learnset: [
      { level: 1, move: move("tackle", "Tackle") },
      { level: 5, move: move("sand-attack", "Sand Attack") },
      { level: 9, move: move("gust", "Gust") },
      { level: 13, move: move("quick-attack", "Quick Attack") },
    ],
    evolution: {
      kind: "level",
      level: 18,
      targets: [{ speciesId: "pidgeotto", name: "Pidgeotto" }],
    },
  },
  pidgeotto: {
    growthRate: "medium-slow",
    learnset: [{ level: 22, move: move("whirlwind", "Whirlwind") }],
    evolution: {
      kind: "level",
      level: 36,
      targets: [{ speciesId: "pidgeot", name: "Pidgeot" }],
    },
  },
  pidgeot: { growthRate: "medium-slow", learnset: [], evolution: null },
  rattata: {
    growthRate: "medium-fast",
    learnset: [
      { level: 1, move: move("tackle", "Tackle") },
      { level: 1, move: move("tail-whip", "Tail Whip") },
      { level: 7, move: move("quick-attack", "Quick Attack") },
      { level: 14, move: move("hyper-fang", "Hyper Fang") },
    ],
    evolution: {
      kind: "level",
      level: 20,
      targets: [{ speciesId: "raticate", name: "Raticate" }],
    },
  },
  raticate: { growthRate: "medium-fast", learnset: [], evolution: null },
  caterpie: {
    growthRate: "medium-fast",
    learnset: [
      { level: 1, move: move("tackle", "Tackle") },
      { level: 1, move: move("string-shot", "String Shot") },
      { level: 9, move: move("bug-bite", "Bug Bite") },
    ],
    evolution: {
      kind: "level",
      level: 7,
      targets: [{ speciesId: "metapod", name: "Metapod" }],
    },
  },
  metapod: {
    growthRate: "medium-fast",
    learnset: [{ level: 7, move: move("harden", "Harden") }],
    evolution: {
      kind: "level",
      level: 10,
      targets: [{ speciesId: "butterfree", name: "Butterfree" }],
    },
  },
  butterfree: { growthRate: "medium-fast", learnset: [], evolution: null },
  weedle: {
    growthRate: "medium-fast",
    learnset: [
      { level: 1, move: move("poison-sting", "Poison Sting") },
      { level: 1, move: move("string-shot", "String Shot") },
      { level: 9, move: move("bug-bite", "Bug Bite") },
    ],
    evolution: {
      kind: "level",
      level: 7,
      targets: [{ speciesId: "kakuna", name: "Kakuna" }],
    },
  },
  kakuna: {
    growthRate: "medium-fast",
    learnset: [{ level: 7, move: move("harden", "Harden") }],
    evolution: {
      kind: "level",
      level: 10,
      targets: [{ speciesId: "beedrill", name: "Beedrill" }],
    },
  },
  beedrill: { growthRate: "medium-fast", learnset: [], evolution: null },
  mewtwo: { growthRate: "slow", learnset: [], evolution: null },
  pikachu: {
    growthRate: "medium-fast",
    learnset: [],
    evolution: {
      kind: "milestone",
      milestoneLevel: 25,
      source: "PokéAPI evolution-chain #10 (Pikachu -> Raichu by thunder-stone)",
      reviewedAt: "2026-09-29",
      targets: [{ speciesId: "raichu", name: "Raichu" }],
    },
  },
  eevee: {
    growthRate: "medium-fast",
    learnset: [],
    evolution: {
      kind: "milestone",
      milestoneLevel: 25,
      source: "PokéAPI evolution-chain #67 (Eevee stone evolutions)",
      reviewedAt: "2026-09-29",
      targets: [
        { speciesId: "vaporeon", name: "Vaporeon" },
        { speciesId: "jolteon", name: "Jolteon" },
        { speciesId: "flareon", name: "Flareon" },
      ],
    },
  },
  raichu: { growthRate: "medium-fast", learnset: [], evolution: null },
  vaporeon: { growthRate: "medium-fast", learnset: [], evolution: null },
  jolteon: { growthRate: "medium-fast", learnset: [], evolution: null },
  flareon: { growthRate: "medium-fast", learnset: [], evolution: null },
} as const satisfies Record<string, SpeciesProgression>

export function progressionFor(speciesId: string): SpeciesProgression {
  const known = catalog[speciesId as keyof typeof catalog]
  if (known !== undefined) return known
  const generated = speciesProgression(speciesId)
  return generated === null
    ? { growthRate: "medium", learnset: [], evolution: null }
    : {
        growthRate: normalizeGrowthRate(generated.growthRate),
        learnset: generated.learnset.map((entry) => ({
          level: entry.level,
          move: move(entry.id, entry.name),
        })),
        evolution: null,
      }
}

export function initialMoves(speciesId: string, level: number): readonly Move[] {
  const learnset = progressionFor(speciesId).learnset
  const eligible = learnset
    .filter((entry) => entry.level <= level)
    .toSorted((left, right) => left.level - right.level)
  return (
    eligible.length > 0
      ? eligible
      : learnset
          .filter((entry) => entry.level === 1)
          .toSorted((left, right) => left.level - right.level)
  )
    .slice(-4)
    .map((entry) => entry.move)
}

export function movesAtLevel(speciesId: string, level: number): readonly Move[] {
  return progressionFor(speciesId)
    .learnset.filter((entry) => entry.level === level)
    .map((entry) => entry.move)
}

export function evolutionAtLevel(
  speciesId: string,
  level: number,
  gender: PokemonGender,
  regionId?: string | null,
): EvolutionRule | null {
  const progression = speciesProgression(speciesId)
  if (progression === null) return null
  const targets = progression.evolutions.flatMap((evolution) => {
    if (
      evolution.conditions.some(
        (condition) => condition.kind === "gender" && condition.value !== gender,
      )
    )
      return []
    const targetSpeciesId = regionalEvolutionTarget(regionId, speciesId, evolution.targetSpeciesId)
    return levelForEvolution({
      ...evolution,
      sourceSpeciesId: speciesId,
    }) <= level
      ? [{ speciesId: targetSpeciesId, name: localizedSpeciesName(targetSpeciesId) }]
      : []
  })
  const firstTarget = targets[0]
  if (firstTarget === undefined) return null
  return {
    kind: "level",
    level,
    targets: [firstTarget, ...targets.slice(1)],
  }
}

export function evolutionTargetSpeciesIds(rule: EvolutionRule): readonly string[] {
  return rule.targets.map((target) => speciesIdSchema.parse(target.speciesId))
}
