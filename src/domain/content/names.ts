import type { Language } from "../shared/language.js"

type Localization = Readonly<Record<string, string>>

/** Canonical fallback order shared by domain content lookups and presentation. */
export function localizedName(
  localization: Localization,
  language: Language,
  fallback: string,
): string {
  // TypeScript requires brackets for the open string index signature.
  // biome-ignore lint/complexity/useLiteralKeys: the catalog is intentionally open-ended.
  return localization[language] ?? localization["en"] ?? fallback
}
