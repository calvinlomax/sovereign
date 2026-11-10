# Sovereign: Beyond the Stars

A deterministic, headless civilization simulation, based on [the initial design document](design.md). This first increment builds the central engine and a working planetary governance model. The interface and later strategy systems will be built on this foundation.

## Run it

Requires Node.js 22.12 or newer and npm.

```sh
npm ci
npm run check
npm run demo
npm run demo -- --seed haven --turns 50 --compare
```

The demo starts a civilization on Haven, queues computing infrastructure and energy research, advances time, and prints resources, social indicators, and events. `--compare` separately compares unchanged institutions against an algorithmic technocracy from the same starting state.

```sh
npm run demo -- --turns 20 --save campaign.save.json --csv campaign.history.csv
npm run demo -- --load campaign.save.json --turns 20
```

Each turn represents one year. Simulation speed is how often a future interface requests a turn; changing wall-clock speed does not change simulation results.

## Included

- Atomic turns through the design's eleven ordered phases; rejected orders or failed systems leave the campaign untouched.
- Seeded, lazy world generation: one inhabited homeworld and 3–5 total planets in the home system, within a sparse cosmic hierarchy.
- Cohort population, labor, energy, matter, food, industrial work, computing capacity, and research.
- Six configurable institutional dimensions with six starting templates and explicit mechanisms.
- Construction queues, a small data-defined research tree, and contextual crisis events.
- Per-turn resource ledgers, metrics, persistent events, and an order journal.
- Versioned JSON saves, CSV history exports, deterministic replay, and independent counterfactual branches.
- Synchronous extension systems with an explicit phase and saved version identity.

Trade, transportation networks, migration, factions, diplomacy, warfare, colonization, rival AI, and cosmic progression are future systems. Trade and conflict currently have reserved phases; exploration exposes deterministic world structure without travel costs or technological gates. The counterfactual helper compares simulations; it is not yet the in-game multi-world experiment laboratory.

## Engine API

After `npm run build`, the root package exposes the simulation and its supporting modules:

```ts
import { GameEngine } from 'sovereign-engine';
import { createInstitutions } from 'sovereign-engine/social-systems';
import { serializeGame, loadGame } from 'sovereign-engine/persistence';

const engine = GameEngine.create({ seed: 'first-light' });
const state = engine.state;
const homeworld = state.civilizations[state.playerCivilizationId]!.homeworldId;

const result = engine.advance([
  {
    type: 'reform',
    planetId: homeworld,
    institutions: createInstitutions('cooperativeCommonwealth'),
  },
  { type: 'research', technologyId: 'efficient-grids' },
]);

engine.run(20);
const saved = serializeGame(engine.state);
const restored = loadGame(saved);
const alternative = restored.fork();
console.log(result.events, restored.state.history.at(-1));
```

`engine.state` is a detached snapshot. Use orders to change a running game. An order batch is applied sequentially and committed together with the turn. Order variants are `reform`, `allocate`, `construct`, `research`, and `explore`; full types and runtime schemas are exported from `sovereign-engine/shared-types`.

`resolveTurn(state, orders)` provides a pure transition for workers and external state stores. `replay(checkpoint, journalSuffix)` reconstructs a campaign from a checkpoint and consecutive orders. No simulation module imports React, browser storage, Node file APIs, clocks, or global random generators.

## Project layout

```text
apps/
  headless/              CLI demo and file-system adapter
  game/                  Future browser/desktop integration notes
packages/
  simulation/src/        Turn engine and domain systems
    economy/
    population/
    politics/
    technology/
    events/
  worldgen/src/          Address-based, lazy generation
  social-systems/src/    Institution templates and mechanisms
  shared-types/src/      Types, runtime schemas, invariants, deterministic utilities
  persistence/src/       Versioned JSON and CSV; storage-neutral
  experiments/src/       Counterfactual branch comparisons
data/ruleset.json        Validated economic constants and technology definitions
tests/                  Engine, model, persistence, and generation regressions
docs/                   Architecture and simulation specification
```

These are logical package boundaries in one TypeScript project, with root subpath exports. They are not separately published npm workspaces. `npm run build` emits JavaScript and declarations into `dist/`; no bundler is required for the headless engine.

Read [the architecture](docs/architecture.md) before adding a system and [the simulation specification](docs/simulation-model.md) before changing equations or balancing. Model coefficients are provisional gameplay assumptions, not empirical claims about real political or economic systems.
