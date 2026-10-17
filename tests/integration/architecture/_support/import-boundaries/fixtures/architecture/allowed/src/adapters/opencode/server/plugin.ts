import { Plugin } from "@opencode/plugin"
import { database } from "../../sqlite/database.js"

export const serverPlugin = [database, Plugin]
