import type { Language } from "../../domain/shared/language.js"

type EncounterCopy = {
  readonly genderSymbol: string
  readonly kind: "ordinary" | "special"
  readonly level: number
  readonly name: string
  readonly shiny: boolean
}

export type UiCopy = {
  readonly title: string
  readonly locationsCommand: string
  readonly pcCommand: string
  readonly dexCommand: string
  readonly exportCommand: string
  readonly commandGroup: string
  readonly locationsDialog: string
  readonly noLocationPokemon: string
  readonly dexDialog: string
  readonly selectParty: (count: number) => string
  readonly confirmParty: string
  readonly exportInactiveTitle: string
  readonly exportInactiveMessage: string
  readonly exportTitle: string
  readonly exportSuccessMessage: string
  readonly exportFailedTitle: string
  readonly clipboardUnavailable: string
  readonly chooseStarter: string
  readonly movePrompt: (pokemon: string) => string
  readonly moveDescription: string
  readonly travel: string
  readonly chooseEvolution: string
  readonly evolutionPrompt: (pokemon: string) => string
  readonly regionComplete: (region: string) => string
  readonly allRegionsComplete: string
  readonly chooseNextRegion: string
  readonly dismiss: string
  readonly location: string
  readonly nextLocation: string
  readonly unknown: string
  readonly encounter: (input: EncounterCopy) => string
  readonly catch: string
  readonly run: string
  readonly loadingSprite: string
  readonly spriteUnavailable: string
  readonly queueCounts: (decisions: number, encounters: number) => string
}

const english: UiCopy = {
  title: "PokéCode",
  locationsCommand: "Pokemon locations",
  pcCommand: "Pokemon PC",
  dexCommand: "Pokemon Dex",
  exportCommand: "Pokemon export",
  commandGroup: "PokéCode",
  locationsDialog: "Pokemon locations",
  noLocationPokemon: "No catalogued Pokémon appear here.",
  dexDialog: "National Dex",
  selectParty: (count) => `Select party (${count}/6)`,
  confirmParty: "Confirm party",
  exportInactiveTitle: "Pokemon export",
  exportInactiveMessage: "Choose a starter before exporting a team.",
  exportTitle: "Pokemon export",
  exportSuccessMessage: "Team copied as a Gen 9 National Dex Showdown paste.",
  exportFailedTitle: "Pokemon export failed",
  clipboardUnavailable: "Clipboard access is unavailable in this environment.",
  chooseStarter: "Choose a regional starter",
  movePrompt: (pokemon) => `${pokemon} wants to learn\na new move`,
  moveDescription: "Choose a move to forget:",
  travel: "Travel",
  chooseEvolution: "Choose an evolution",
  evolutionPrompt: (pokemon) => `${pokemon} is evolving!`,
  regionComplete: (region) => `You've completed ${region}!`,
  allRegionsComplete: "You've completed all nine regions! Keep exploring your unlocked locations.",
  chooseNextRegion: "Choose your next region.",
  dismiss: "Dismiss",
  location: "Location",
  nextLocation: "Next location",
  unknown: "Unknown",
  encounter: ({ genderSymbol, level, name, shiny }) =>
    `${shiny ? "✨ " : ""}Wild ${name} ${genderSymbol} Lv.${level}`,
  catch: "Catch",
  run: "Run",
  loadingSprite: "Loading sprite...",
  spriteUnavailable: "Sprite unavailable offline",
  queueCounts: (decisions, encounters) =>
    `Pending: ${decisions} decision${decisions === 1 ? "" : "s"} · ${encounters} encounter${encounters === 1 ? "" : "s"}`,
}

const spanish: UiCopy = {
  ...english,
  title: "PokéCode",
  locationsCommand: "Ubicaciones Pokémon",
  pcCommand: "PC Pokémon",
  dexCommand: "Pokédex",
  exportCommand: "Exportar Pokémon",
  commandGroup: "PokéCode",
  locationsDialog: "Ubicaciones Pokémon",
  noLocationPokemon: "No hay Pokémon catalogados aquí.",
  dexDialog: "Pokédex Nacional",
  selectParty: (count) => `Selecciona el equipo (${count}/6)`,
  confirmParty: "Confirmar equipo",
  exportInactiveTitle: "Exportar Pokémon",
  exportInactiveMessage: "Elige un inicial antes de exportar un equipo.",
  exportTitle: "Exportar Pokémon",
  exportSuccessMessage: "Equipo copiado como formato de Showdown Nacional Dex de Gen 9.",
  exportFailedTitle: "Error al exportar Pokémon",
  clipboardUnavailable: "El portapapeles no está disponible en este entorno.",
  chooseStarter: "Elige un inicial regional",
  movePrompt: (pokemon) => `${pokemon} quiere aprender\nun nuevo movimiento`,
  moveDescription: "Elige un movimiento que olvidar:",
  travel: "Viajar",
  chooseEvolution: "Elige una evolución",
  evolutionPrompt: (pokemon) => `¡${pokemon} está evolucionando!`,
  regionComplete: (region) => `¡Has completado ${region}!`,
  allRegionsComplete:
    "¡Has completado las nueve regiones! Sigue explorando las ubicaciones desbloqueadas.",
  chooseNextRegion: "Elige tu próxima región.",
  dismiss: "Cerrar",
  location: "Ubicación",
  nextLocation: "Siguiente ubicación",
  unknown: "Desconocido",
  encounter: ({ genderSymbol, level, name, shiny }) =>
    `${shiny ? "✨ " : ""}${name} salvaje ${genderSymbol} Nv.${level}`,
  catch: "Capturar",
  run: "Huir",
  loadingSprite: "Cargando sprite...",
  spriteUnavailable: "Sprite no disponible sin conexión",
  queueCounts: (decisions, encounters) =>
    `Pendientes: ${decisions} ${decisions === 1 ? "decisión" : "decisiones"} · ${encounters} encuentro${encounters === 1 ? "" : "s"}`,
}

export function uiCopy(language: Language): UiCopy {
  return language === "es" ? spanish : english
}
