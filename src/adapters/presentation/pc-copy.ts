import type { Language } from "../../domain/shared/language.js"

const english = {
  title: "Pokemon PC",
  nature: "Nature",
  ability: "Ability",
  moves: "Moves",
  stats: { name: "Stat", value: "Value" },
  statNames: ["HP", "Attack", "Defense", "Sp. Atk", "Sp. Def", "Speed"],
  empty: "No Pokemon in storage.",
  minimum: "Select at least one Pokemon.",
  maximum: "Your team can contain at most six Pokemon.",
  saving: "Saving team...",
  failed: "Team could not be saved. Please try again.",
  navigation: "Up/Down: Inspect | Space: Toggle",
  actions: "Enter: Save team | Esc: Cancel",
  rename: "Rename",
  release: "Free Pokemon",
  renamePrompt: "New name (1–30 characters):",
  releasePrompt: "Free this Pokemon permanently? This cannot be undone.",
  editActions: "Enter: Confirm | Esc: Back",
  invalidName: "Use 1–30 characters, without control characters.",
  lastPartyPokemon: "You cannot free your last party Pokemon. Save a different team first.",
  managing: "Saving Pokemon...",
  managementFailed: "Pokemon could not be updated. Please try again.",
  renamed: "Pokemon renamed.",
  released: "Pokemon freed.",
}

const spanish: typeof english = {
  title: "PC Pokémon",
  nature: "Naturaleza",
  ability: "Habilidad",
  moves: "Movimientos",
  stats: { name: "Estad.", value: "Valor" },
  statNames: ["PS", "Ataque", "Defensa", "At. Esp", "Def. Esp", "Velocidad"],
  empty: "No hay Pokémon almacenados.",
  minimum: "Selecciona al menos un Pokémon.",
  maximum: "El equipo puede tener hasta seis Pokémon.",
  saving: "Guardando equipo...",
  failed: "No se pudo guardar el equipo. Inténtalo de nuevo.",
  navigation: "Arriba/Abajo: Ver | Espacio: Elegir",
  actions: "Enter: Guardar | Esc: Cancelar",
  rename: "Renombrar",
  release: "Liberar Pokémon",
  renamePrompt: "Nuevo nombre (1–30 caracteres):",
  releasePrompt: "¿Liberar este Pokémon para siempre? No se puede deshacer.",
  editActions: "Enter: Confirmar | Esc: Volver",
  invalidName: "Usa entre 1 y 30 caracteres, sin caracteres de control.",
  lastPartyPokemon: "No puedes liberar tu último Pokémon del equipo. Guarda otro equipo primero.",
  managing: "Guardando Pokémon...",
  managementFailed: "No se pudo actualizar el Pokémon. Inténtalo de nuevo.",
  renamed: "Pokémon renombrado.",
  released: "Pokémon liberado.",
}

export function pcCopy(language: Language) {
  return language === "es" ? spanish : english
}
