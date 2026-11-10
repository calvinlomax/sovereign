# Ruleset data

`ruleset.json` is the initial, versioned content bundle. It supplies economic/population constants, construction costs, and the small research tree. The runtime validates values, duplicate technology IDs, missing prerequisites, and dependency cycles.

Pass a validated custom `Ruleset` to `GameEngine.create` for a scenario. Each campaign embeds a copy of its ruleset. Editing this file changes new games only. A ruleset version identifies content; `modelVersion` identifies the mathematical implementation.

Institution templates currently live in the typed social-systems module. Split technologies, institutions, policies, civilizations, and events into their own data catalogs when those content systems are introduced; do not create unconsumed definitions just to fill directories.
