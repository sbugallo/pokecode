import type { Evs, Ivs, Move, PokemonGender } from "./types.js"

export type StarterGender = Exclude<PokemonGender, "genderless">

export type StarterTemplate = {
  readonly speciesId: string
  readonly name: string
  readonly ability: string
  readonly initialMoves: readonly Move[]
}

export type StarterCreationData = {
  readonly speciesId: string
  readonly name: string
  readonly gender: StarterGender
  readonly ability: string
  readonly nature: string
  readonly level: 5
  readonly experience: 0
  readonly shiny: false
  readonly ivs: Ivs
  readonly evs: Evs
  readonly moves: readonly Move[]
}

const natures = [
  "Hardy",
  "Lonely",
  "Brave",
  "Adamant",
  "Naughty",
  "Bold",
  "Docile",
  "Relaxed",
  "Impish",
  "Lax",
  "Timid",
  "Hasty",
  "Serious",
  "Jolly",
  "Naive",
  "Modest",
  "Mild",
  "Quiet",
  "Bashful",
  "Rash",
  "Calm",
  "Gentle",
  "Sassy",
  "Careful",
  "Quirky",
] as const

export function generateStarter(
  starter: StarterTemplate,
  random: () => number,
): StarterCreationData {
  const gender: StarterGender = random() < 0.5 ? "male" : "female"
  const nature = natures[randomIndex(natures.length, random)] ?? "Hardy"
  const ivs = {
    hp: randomIv(random),
    attack: randomIv(random),
    defense: randomIv(random),
    specialAttack: randomIv(random),
    specialDefense: randomIv(random),
    speed: randomIv(random),
  }

  return {
    speciesId: starter.speciesId,
    name: starter.name,
    gender,
    ability: starter.ability,
    nature,
    level: 5,
    experience: 0,
    shiny: false,
    ivs,
    evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
    moves: starter.initialMoves,
  }
}

function randomIndex(length: number, random: () => number): number {
  return Math.min(Math.floor(random() * length), length - 1)
}

function randomIv(random: () => number): number {
  return Math.floor(random() * 32)
}
