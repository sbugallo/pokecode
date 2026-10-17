import { localizedMoveName, moveDetails } from "../../domain/content/catalog.js"
import type { Move } from "../../domain/pokemon/types.js"
import type { Language } from "../../domain/shared/language.js"

const types: Readonly<Record<string, readonly [string, string]>> = {
  normal: ["Normal", "Normal"],
  fire: ["Fire", "Fuego"],
  water: ["Water", "Agua"],
  electric: ["Electric", "Eléctrico"],
  grass: ["Grass", "Planta"],
  ice: ["Ice", "Hielo"],
  fighting: ["Fighting", "Lucha"],
  poison: ["Poison", "Veneno"],
  ground: ["Ground", "Tierra"],
  flying: ["Flying", "Volador"],
  psychic: ["Psychic", "Psíquico"],
  bug: ["Bug", "Bicho"],
  rock: ["Rock", "Roca"],
  ghost: ["Ghost", "Fantasma"],
  dragon: ["Dragon", "Dragón"],
  dark: ["Dark", "Siniestro"],
  steel: ["Steel", "Acero"],
  fairy: ["Fairy", "Hada"],
}
const categories: Readonly<Record<string, readonly [string, string]>> = {
  physical: ["Physical", "Físico"],
  special: ["Special", "Especial"],
  status: ["Status", "Estado"],
}

export function presentMove(move: Move, language: Language) {
  const details = moveDetails(move.id)
  const locale = language === "es" ? 1 : 0
  const powerLabel = language === "es" ? "Pot" : "Pow"
  const accuracyLabel = language === "es" ? "Prec" : "Acc"
  // Zero accuracy is also used by PokéAPI for moves without a normal accuracy check.
  const accuracy = details?.accuracy ? `${details.accuracy}%` : "—"
  return {
    id: move.id,
    name: localizedMoveName(move.id, language, move.name),
    classification: `${types[details?.type ?? ""]?.[locale] ?? "—"} · ${categories[details?.category ?? ""]?.[locale] ?? "—"}`,
    stats: `${powerLabel} ${details === undefined ? "—" : (details.power ?? 0)} · ${accuracyLabel} ${accuracy} · PP ${details?.pp ?? "—"}`,
    description: details?.descriptions[language] ?? "",
  }
}

export function moveInspectionHint(language: Language) {
  return language === "es"
    ? "Pasa el ratón por encima de un movimiento para ver su descripción."
    : "Hover over a move to see its description."
}
