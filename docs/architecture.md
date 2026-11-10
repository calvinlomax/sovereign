# Engine architecture

## State ownership and public boundary

`GameEngine` owns one private, JSON-serializable `GameState`. Snapshots, restored games, and branches are deep copies. The engine executes synchronous turns; callers decide when to advance. There is no background loop and no dependence on frame rate, wall-clock time, I/O, or random global state.

Each turn parses orders, clones the last committed state, advances the turn counter, runs the pipeline, and validates the result. Only then does the engine replace its committed state. Any thrown error discards the entire working turn, including resource charges, events, discoveries, research, and history. A reentry guard prevents a system from recursively advancing its engine.

Order errors include the zero-based `orderIndex` and a human-readable message. Invalid ownership, research prerequisites, queue limits, allocations, institution ranges, unknown fields, and insufficient funds are rejected. Multiple orders in one batch see the effects of earlier orders, preventing double spending. This atomic policy is intentional: a future UI should show the error and let the player revise the batch.

## Pipeline

| Phase | Current implementation |
| --- | --- |
| Orders | Validate and apply player commands |
| Transportation | Consume last turn's industrial work to complete queued construction |
| Economy | Production, energy allocation, computing, services, and consumption |
| Trade | Reserved for logistics and exchange |
| Population | Cohort births, deaths, and education |
| Institutions | Derived welfare and inequality |
| Politics | Cohort satisfaction, legitimacy, and unrest |
| Conflict | Reserved for diplomacy and warfare |
| Research | Accumulate knowledge and complete selected technology |
| Events | Record crisis threshold transitions |
| History | Record observations and accepted orders |

Core systems run first within their phase. Extensions run afterward, sorted lexically by ID, independent of registration order. Orders and history are reserved boundaries. System descriptors contain `id`, `version`, and `phase`; the exact ordered descriptors are saved with the campaign. Loading requires matching extension implementations.

```ts
import { GameEngine, type SimulationSystem } from 'sovereign-engine';

const sample: SimulationSystem = {
  id: 'example.environment',
  version: '1',
  phase: 'population',
  update({ state, random }) {
    for (const id of Object.keys(state.world.planets).sort()) {
      const planet = state.world.planets[id]!;
      if (planet.ownerId === null) continue;
      const rng = random('example.environment', id);
      // Apply a deterministic, documented mechanism using rng() and planet.
      // No wall-clock reads, I/O, promises, global state, or Math.random().
      void rng;
    }
  },
};

const engine = GameEngine.create({ seed: 'extension-demo', systems: [sample] });
```

Extensions are trusted code, not a sandbox. Do not retain mutable state references, change identity/version metadata, mutate past observations, modify another system's invariants, or perform external side effects. Side effects cannot be rolled back. Added state fields, order variants, or event categories require an explicit schema/model change; arbitrary plugin payloads are intentionally unsupported in v0.1.

## Reproducibility

World generation uses `seed + entity address` to derive an independent random stream. Turn extensions receive streams derived from `seed + turn + system ID + entity ID`. A new stream starts at the beginning each time; obtain it once and reuse it for sequential draws. Visiting systems in a different order does not change their planets.

The hash is FNV-1a over UTF-16 code units, followed by Mulberry32. It is for simulation, not cryptography. Entity iteration and extension ordering are explicit. No elapsed times, timestamps, UUIDs, or locale-dependent sorting enter state.

A campaign records schema version, mathematical model version, full ruleset contents, system versions, seed, and order journal. Within the same implementation, identical starting states and accepted orders reproduce identical results. Floating-point arithmetic uses JavaScript numbers; this is not a fixed-point simulation or a guarantee of bitwise parity with a future Rust port.

## Persistence and history

The save envelope is `{ format: 'sovereign-save', version: 1, state }`. Save/load validates both shapes and cross-entity invariants: ownership, territory, hierarchy, research prerequisites, history continuity, ledgers, and finite bounded indicators. Canonical key ordering makes saved JSON stable and suitable for comparisons.

Schema/model versions without a migration are rejected. No historical save versions exist yet, so v0.1 deliberately has no guessed migrations. Bump the model version when equations or generation algorithms change, and add tested migrations when state schemas change. The ruleset snapshot makes saves independent of later edits to `data/ruleset.json`; it does not replace mathematical model versioning.

The engine preserves turn-zero observations, all subsequent observations, crisis and action events, and every accepted order batch. CSV exports contain planetary observations; JSON saves contain the full campaign. Failed commands are not in the replay journal.

The JSON helpers are storage-neutral. The CLI uses local files; the future game can store the same payload in IndexedDB. Files are written only when explicitly requested with CLI flags. There is no automatic autosave or corruption recovery UI yet.

## Scale and future interfaces

Campaign creation materializes only the path to the home system and its planets. Expanding a known node generates its immediate children, never an entire universe. Uninhabited worlds do not run demographic or economic systems. Inhabited worlds currently run at full detail.

This is the planetary engine, not the galactic performance implementation. Regional aggregates, adaptive detail, parallel simulation, streaming history, incremental validation, and compressed saves remain future work. Keeping all history and cloning/validating a whole state each turn trades performance for a small, auditable transactional core; long campaigns will eventually require storage and validation optimizations.

The future React application can own a `GameEngine` in a Web Worker, submit batches of typed orders, and receive `TurnResult` plus selected observations. Renderers should read snapshots rather than mutate live simulation objects. Keep wall-clock scheduling, audio, graphics, selection state, storage adapters, and networking outside `packages/simulation`.
