import type { GameState } from "../../application/contracts/game.js"
import { regionsCatalog } from "../../domain/content/catalogs/regions-catalog.js"
import type { PendingEncounter } from "../../domain/encounters/encounter.js"
import {
  type Language,
  localizedLocationName,
  localizedName,
  localizedPokemonName,
  localizePokemon,
} from "./localization.js"
import { uiCopy } from "./ui-copy.js"

export type GameNotification = {
  readonly title: string
  readonly message: string
  readonly variant: "info" | "success" | "warning" | "error"
}

type NotificationCopy = {
  readonly level: (name: string, from: number, to: number) => string
  readonly evolution: (from: string, to: string) => string
  readonly unlocked: (name: string) => string
  readonly travel: (name: string) => string
  readonly party: string
  readonly move: string
  readonly capture: (name: string, destination: "party" | "pc") => string
}

const copies: Readonly<Record<Language, NotificationCopy>> = {
  en: {
    level: (name, from, to) => `${name}: Lv.${from} → Lv.${to}`,
    evolution: (from, to) => `${from} evolved into ${to}.`,
    unlocked: (name) => `Location unlocked: ${name}.`,
    travel: (name) => `Arrived at ${name}.`,
    party: "Your party has changed.",
    move: "A new move choice is available.",
    capture: (name, destination) =>
      `${name} caught! ${destination === "pc" ? "Sent to the PC." : "Added to your party."}`,
  },
  es: {
    level: (name, from, to) => `${name}: Nv.${from} → Nv.${to}`,
    evolution: (from, to) => `${from} evolucionó a ${to}.`,
    unlocked: (name) => `Ubicación desbloqueada: ${name}.`,
    travel: (name) => `Has llegado a ${name}.`,
    party: "Tu equipo ha cambiado.",
    move: "Hay una nueva elección de movimiento.",
    capture: (name, destination) =>
      `¡${name} capturado! ${destination === "pc" ? "Enviado al PC." : "Añadido a tu equipo."}`,
  },
} as const

function notificationCopy(language: Language): NotificationCopy {
  return copies[language]
}

function regionName(id: string, language: Language): string {
  const region = regionsCatalog.find((entry) => entry.id === id)
  return region === undefined ? id : localizedName(region.localization, language, id)
}

/** Only compare established snapshots; the parent installs the initial status silently. */
export function gameNotifications(
  previous: GameState,
  next: GameState,
): readonly GameNotification[] {
  if (previous.phase !== "active" || next.phase !== "active") return []
  const language = next.locale
  const ui = uiCopy(language)
  const copy = notificationCopy(language)
  // Accumulate descriptors in a stable order without changing either snapshot.
  const notifications: GameNotification[] = []
  const add = (message: string, variant: GameNotification["variant"]): void => {
    notifications.push({ title: ui.title, message, variant })
  }
  const encounter = next.pendingEncounter
  if (encounter !== null && encounter.id !== previous.pendingEncounter?.id) {
    add(
      ui.encounter({
        ...encounter,
        name: localizedPokemonName(encounter.speciesId, language, encounter.name),
        genderSymbol: encounter.gender === "male" ? "♂" : encounter.gender === "female" ? "♀" : "",
      }),
      encounter.kind === "special" || encounter.shiny ? "warning" : "info",
    )
  }
  const previousParty = new Map(
    previous.party.flatMap(({ pokemon }) => (pokemon === null ? [] : [[pokemon.id, pokemon]])),
  )
  const nextParty = new Map(
    next.party.flatMap(({ pokemon }) => (pokemon === null ? [] : [[pokemon.id, pokemon]])),
  )
  for (const pokemon of nextParty.values()) {
    const before = previousParty.get(pokemon.id)
    if (before === undefined) continue
    const name = localizePokemon(pokemon, language).name
    if (pokemon.level > before.level) {
      add(copy.level(name, before.level, pokemon.level), "success")
    }
    if (pokemon.speciesId !== before.speciesId) {
      add(copy.evolution(localizePokemon(before, language).name, name), "success")
    }
  }
  const previousChoices = new Set(previous.pendingChoices.map((choice) => choice.id))
  for (const choice of next.pendingChoices) {
    if (previousChoices.has(choice.id)) continue
    if (choice.kind === "move") add(copy.move, "info")
    if (choice.kind === "evolution") add(ui.chooseEvolution, "info")
  }
  if (
    previous.region === next.region &&
    previous.exploration !== null &&
    next.exploration !== null
  ) {
    const unlocked = new Set(
      previous.exploration.locations.filter((location) => location.unlocked).map(({ id }) => id),
    )
    for (const location of next.exploration.locations) {
      if (location.unlocked && !unlocked.has(location.id)) {
        add(copy.unlocked(localizedLocationName(location.id, language, location.name)), "success")
      }
    }
    if (!previous.exploration.regionComplete && next.exploration.regionComplete) {
      add(ui.regionComplete(regionName(next.region ?? "", language)), "success")
    }
    if (
      next.exploration.regions.length > 0 &&
      next.exploration.regions.every((region) => region.completed) &&
      !previous.exploration.regions.every((region) => region.completed)
    ) {
      add(ui.allRegionsComplete, "success")
    }
  }
  if (
    (previous.region !== next.region || previous.location !== next.location) &&
    next.location !== null
  ) {
    const name = next.exploration?.locations.find(({ id }) => id === next.location)?.name
    add(copy.travel(localizedLocationName(next.location, language, name ?? next.location)), "info")
  }
  if (
    previousParty.size !== nextParty.size ||
    [...nextParty.keys()].some((id) => !previousParty.has(id))
  ) {
    add(copy.party, "info")
  }
  return notifications
}

/** Call only for a confirmed RPC `caught` result, using the pre-resolution encounter. */
export function captureNotification(
  encounter: PendingEncounter,
  destination: "party" | "pc",
  language: Language,
): GameNotification {
  return {
    title: uiCopy(language).title,
    message: notificationCopy(language).capture(
      localizedPokemonName(encounter.speciesId, language, encounter.name),
      destination,
    ),
    variant: "success",
  }
}
