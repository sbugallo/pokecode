import { RGBA } from "@opentui/core"

/** Semantic colors of one theme surface (base view or dialog view). */
export type PokecodeSurface = {
  readonly text: RGBA
  readonly muted: RGBA
  readonly accent: RGBA
  readonly success: RGBA
  readonly error: RGBA
  readonly info: RGBA
  readonly background: RGBA
  readonly raised: RGBA
  readonly highlight: RGBA
  readonly border: RGBA
  readonly primary: PokecodeActionColors
  readonly secondary: PokecodeActionColors
}

export type PokecodeActionColors = {
  readonly background: RGBA
  readonly backgroundHovered: RGBA
  readonly label: RGBA
  readonly labelHovered: RGBA
}

/** Structural subset of the resolved host theme that Pokecode surfaces consume. */
export type PokecodeTheme = {
  /** Colors for surfaces rendered on the base view (sidebar, cards). */
  readonly current: PokecodeSurface
  /** Colors re-resolved on the raised dialog surface. */
  readonly dialog: PokecodeSurface
}

type StatefulColor = {
  readonly base: RGBA
  readonly state: (states: { readonly hovered?: boolean }) => RGBA | undefined
}

/** Structural subset of the v2 resolved theme (`context.theme`). */
export type PokecodeResolvedTheme = {
  readonly hue: {
    /** Named hue scales (100-900); `accent` is mandatory in every theme. */
    readonly accent: Readonly<Partial<Record<number, RGBA>>>
  }
  readonly text: {
    readonly base: RGBA
    readonly muted: RGBA
    readonly action: {
      readonly primary: StatefulColor
      readonly secondary: StatefulColor
    }
    readonly feedback: {
      readonly error: { readonly base: RGBA }
      readonly success: { readonly base: RGBA }
      readonly info: { readonly base: RGBA }
    }
  }
  readonly background: {
    readonly base: RGBA
    readonly raised: {
      readonly base: RGBA
      readonly max: RGBA
    }
    readonly action: {
      readonly primary: StatefulColor
      readonly secondary: StatefulColor
    }
  }
  readonly border: { readonly base: RGBA }
  readonly surface: (name: "dialog") => PokecodeResolvedTheme
}

const hovered = (color: StatefulColor): RGBA => color.state({ hovered: true }) ?? color.base

const toActionColors = (background: StatefulColor, label: StatefulColor): PokecodeActionColors => ({
  background: background.base,
  backgroundHovered: hovered(background),
  label: label.base,
  labelHovered: hovered(label),
})

const toSurface = (theme: PokecodeResolvedTheme): PokecodeSurface => ({
  text: theme.text.base,
  muted: theme.text.muted,
  // Level 200 is the accent shade OpenCode's own UI uses for emphasis text; fall back to the
  // primary action color if a theme ever ships without that shade.
  accent: theme.hue.accent[200] ?? theme.text.action.primary.base,
  success: theme.text.feedback.success.base,
  error: theme.text.feedback.error.base,
  info: theme.text.feedback.info.base,
  background: theme.background.base,
  raised: theme.background.raised.base,
  highlight: theme.background.raised.max,
  border: theme.border.base,
  primary: toActionColors(theme.background.action.primary, theme.text.action.primary),
  secondary: toActionColors(theme.background.action.secondary, theme.text.action.secondary),
})

export const toPokecodeTheme = (theme: PokecodeResolvedTheme): PokecodeTheme => ({
  current: toSurface(theme),
  dialog: toSurface(theme.surface("dialog")),
})

const transparent = RGBA.fromInts(0, 0, 0, 0)
const flat = (color: RGBA) => ({ base: color, state: () => color })

const fallbackResolvedTheme: PokecodeResolvedTheme = (() => {
  const text = RGBA.fromHex("#d4d4d4")
  const muted = RGBA.fromHex("#808080")
  const theme: PokecodeResolvedTheme = {
    hue: { accent: { 200: RGBA.fromHex("#a78bfa") } },
    text: {
      base: text,
      muted,
      action: {
        primary: flat(text),
        secondary: flat(muted),
      },
      feedback: {
        error: { base: RGBA.fromHex("#ef4444") },
        success: { base: RGBA.fromHex("#22c55e") },
        info: { base: RGBA.fromHex("#3b82f6") },
      },
    },
    background: {
      base: RGBA.fromHex("#111827"),
      raised: { base: RGBA.fromHex("#1f2937"), max: RGBA.fromHex("#374151") },
      action: {
        primary: flat(transparent),
        secondary: flat(transparent),
      },
    },
    border: { base: RGBA.fromHex("#4b5563") },
    surface: () => theme,
  }
  return theme
})()

/** Fallback tokens for components rendered without an explicit theme accessor. */
export const fallbackPokecodeTheme: PokecodeTheme = toPokecodeTheme(fallbackResolvedTheme)
