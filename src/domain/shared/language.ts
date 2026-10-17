import { z } from "zod"

export const languageSchema = z.enum(["en", "es"]).default("en")
export type Language = z.infer<typeof languageSchema>
