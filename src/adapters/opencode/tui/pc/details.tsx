import { stringWidth } from "bun"
import { For } from "solid-js"
import type { PokemonInstance } from "../../../../domain/pokemon/model.js"
import { pokemonNatureModifiers } from "../../../../domain/pokemon/nature.js"
import { pokemonStats } from "../../../../domain/pokemon/stats.js"
import type { Language } from "../../../../domain/shared/language.js"
import { pcCopy } from "../../../presentation/pc-copy.js"
import type { SpriteResolver } from "../../../sprites/contracts.js"
import type { ImageProtocolAccessor } from "../components/image-protocol.js"
import { MoveList } from "../components/move-list.js"
import { Sprite } from "../components/sprite.js"
import { fallbackPokecodeTheme, type PokecodeSurface } from "../theme.js"

const stats = ["hp", "attack", "defense", "specialAttack", "specialDefense", "speed"] as const

export function PcDetails(properties: {
  readonly pokemon: PokemonInstance
  readonly language: Language
  readonly theme?: (() => PokecodeSurface) | undefined
  readonly resolveSprite: SpriteResolver
  readonly imageProtocol: ImageProtocolAccessor
}) {
  const copy = () => pcCopy(properties.language)
  const surface = () => properties.theme?.() ?? fallbackPokecodeTheme.current
  const values = () => pokemonStats(properties.pokemon)
  const nature = () => pokemonNatureModifiers(properties.pokemon.nature)
  const gender = () => properties.pokemon.gender
  const symbol = () => (gender() === "male" ? "♂" : gender() === "female" ? "♀" : "—")
  const statLine = (
    [name, value, ev, iv]: readonly [string, string, string, string],
    indicator = " ",
  ) =>
    `${indicator} ${name}${" ".repeat(11 - stringWidth(name))}${" ".repeat(6 - stringWidth(value))}${value} ${ev.padStart(2)} ${iv.padStart(2)}`
  return (
    <box alignItems="center" flexDirection="column" gap={1} width="100%" minWidth={0}>
      <box alignItems="center" flexDirection="column">
        <Sprite
          language={() => properties.language}
          resolve={properties.resolveSprite}
          protocol={properties.imageProtocol}
          theme={surface}
          shiny={properties.pokemon.shiny}
          gender={properties.pokemon.gender}
          speciesId={properties.pokemon.speciesId}
        />
        <text
          fg={surface().text}
        >{`${properties.pokemon.shiny ? "★ " : ""}${properties.pokemon.name} ${symbol()} Lv.${properties.pokemon.level}`}</text>
      </box>
      <box alignItems="center" flexDirection="column">
        <text fg={surface().text}>{`${copy().nature}: ${properties.pokemon.nature}`}</text>
        <text fg={surface().text}>{`${copy().ability}: ${properties.pokemon.ability}`}</text>
      </box>
      <box alignItems="center" flexDirection="column">
        <text fg={surface().muted}>
          {statLine([copy().stats.name, copy().stats.value, "EV", "IV"])}
        </text>
        <For each={stats}>
          {(stat, index) => {
            const name = () => copy().statNames[index()] ?? stat
            return (
              <text
                fg={
                  stat === nature().increased
                    ? surface().error
                    : stat === nature().decreased
                      ? surface().info
                      : surface().text
                }
              >
                {statLine(
                  [
                    name(),
                    String(values()[stat]),
                    String(properties.pokemon.evs[stat]),
                    String(properties.pokemon.ivs[stat]),
                  ],
                  stat === nature().increased ? "↑" : stat === nature().decreased ? "↓" : " ",
                )}
              </text>
            )
          }}
        </For>
      </box>
      <box alignItems="center" flexDirection="column" width="100%" gap={1}>
        <text fg={surface().muted}>{copy().moves}</text>
        {properties.pokemon.moves.length === 0 ? (
          <text fg={surface().muted}>—</text>
        ) : (
          <MoveList
            moves={properties.pokemon.moves}
            language={properties.language}
            theme={surface}
          />
        )}
      </box>
    </box>
  )
}
