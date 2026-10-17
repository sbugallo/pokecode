import { z } from "zod"

export const moveSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
})
export type Move = z.infer<typeof moveSchema>

export const ivsSchema = z.object({
  hp: z.number().int().min(0).max(31),
  attack: z.number().int().min(0).max(31),
  defense: z.number().int().min(0).max(31),
  specialAttack: z.number().int().min(0).max(31),
  specialDefense: z.number().int().min(0).max(31),
  speed: z.number().int().min(0).max(31),
})
export type Ivs = z.infer<typeof ivsSchema>

export const evsSchema = z.object({
  hp: z.literal(0),
  attack: z.literal(0),
  defense: z.literal(0),
  specialAttack: z.literal(0),
  specialDefense: z.literal(0),
  speed: z.literal(0),
})
export type Evs = z.infer<typeof evsSchema>

export const pokemonGenderSchema = z.enum(["male", "female", "genderless"])
export type PokemonGender = z.infer<typeof pokemonGenderSchema>

// Catalog terminology; "unknown" becomes "genderless" in stored Pokémon instances.
export const availablePokemonGendersSchema = z
  .array(z.enum(["male", "female", "unknown"]))
  .min(1)
  .max(2)
  .refine((genders) => new Set(genders).size === genders.length, "Genders must be unique")
  .refine(
    (genders) => !genders.includes("unknown") || genders.length === 1,
    "Unknown cannot be combined with male or female",
  )
export type AvailablePokemonGender = z.infer<typeof availablePokemonGendersSchema>[number]
