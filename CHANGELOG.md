# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of `@sbugallo/pokecode`, an OpenCode V2 plugin that brings a Pokémon adventure to
  the TUI sidebar: choose a regional starter, build a team, and discover wild Pokémon while you work.
- Bundled catalog of 1,025 base species and 41 regional forms across nine regions, browsable in the
  National Dex, with sprites downloaded on demand and cached for offline use.
- Token-based progression: active team members earn XP from counted tokens (1 XP per 1,000 tokens by
  default), learn level-up moves automatically, and evolve through curated level milestones, with
  player choice for branching evolutions.
- Exploration with manual travel, location unlocks, and random encounters with catch-or-run
  decisions, all configurable through plugin options.
- Persistent progress in a user-global SQLite database shared across OpenCode sessions, including
  pending decisions and encounter queues.
- `/pokecode-locations`, `/pokecode-dex`, `/pokecode-pc`, and `/pokecode-export` commands, with
  active-team export in Pokémon Showdown format.
- `npx @sbugallo/pokecode init` installer that registers the server and TUI plugin entrypoints, and
  English and Spanish localization.

