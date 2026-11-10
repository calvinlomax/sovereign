import rulesJson from '../../../data/ruleset.json' with { type: 'json' };
import { canonicalJson, MODEL_VERSION, phases, rulesetSchema, SCHEMA_VERSION, validateState } from '../../shared-types/src/index.js';
import type { GameState, Ruleset, SystemDescriptor } from '../../shared-types/src/index.js';
import { generateWorld, HOMEWORLD_ID } from '../../worldgen/src/index.js';
import { makeContext } from './context.js';
import type { SimulationSystem, TurnResult } from './context.js';
import { observe } from './history.js';
import { parseOrders } from './orders.js';
import { buildPipeline } from './systems.js';

export interface CampaignOptions {
  seed: string;
  civilizationName?: string;
  startYear?: number;
  ruleset?: Ruleset;
  systems?: readonly SimulationSystem[];
}

const descriptors = (systems: readonly SimulationSystem[]): SystemDescriptor[] => systems.map(({ id, version, phase }) => ({ id, version, phase }));
export const defaultRuleset = (): Ruleset => rulesetSchema.parse(rulesJson);

export function createCampaign(options: CampaignOptions): GameState {
  const pipeline = buildPipeline(options.systems);
  const playerCivilizationId = 'civilization:player';
  const state: GameState = {
    schemaVersion: SCHEMA_VERSION, modelVersion: MODEL_VERSION,
    seed: options.seed, turn: 0, clock: { startYear: options.startYear ?? 2200, yearsPerTurn: 1 },
    ruleset: rulesetSchema.parse(options.ruleset ?? defaultRuleset()), systems: descriptors(pipeline),
    playerCivilizationId,
    civilizations: { [playerCivilizationId]: {
      id: playerCivilizationId, name: options.civilizationName ?? 'Sovereign Union', homeworldId: HOMEWORLD_ID, planetIds: [HOMEWORLD_ID],
      research: { knowledge: 0, completed: [], focus: null },
    } },
    world: generateWorld(options.seed, playerCivilizationId), history: [], events: [], journal: [],
  };
  state.history.push(observe(state));
  return validateState(state);
}

function assertPipeline(state: GameState, systems: readonly SimulationSystem[]): void {
  if (canonicalJson(state.systems) !== canonicalJson(descriptors(systems))) {
    throw new Error('System versions do not match the campaign. Restore the same extensions before continuing.');
  }
}

function processTurn(source: GameState, rawOrders: readonly unknown[], pipeline: readonly SimulationSystem[]): { state: GameState; result: TurnResult } {
  const orders = parseOrders(rawOrders);
  const working = structuredClone(source);
  working.turn++;
  const eventOffset = working.events.length;
  const context = makeContext(working, orders);
  for (const system of pipeline) {
    const result: unknown = system.update(context);
    if (result !== null && typeof result === 'object' && 'then' in result) {
      // TypeScript permits async callbacks where void is expected. Reject them at
      // runtime as well, and observe rejections so they cannot crash the host later.
      void Promise.resolve(result).catch(() => {});
      throw new Error(`System ${system.id} returned a promise; simulation systems must be synchronous`);
    }
  }
  const state = validateState(working);
  return { state, result: { turn: state.turn, events: structuredClone(state.events.slice(eventOffset)), phases: [...phases] } };
}

/** Pure state transition; input state and orders are never mutated. */
export function resolveTurn(input: GameState, orders: readonly unknown[] = [], extensions: readonly SimulationSystem[] = []): { state: GameState; result: TurnResult } {
  const state = validateState(input);
  const pipeline = buildPipeline(extensions);
  assertPipeline(state, pipeline);
  return processTurn(state, orders, pipeline);
}

export class GameEngine {
  #state: GameState;
  readonly #pipeline: readonly SimulationSystem[];
  #advancing = false;

  private constructor(state: GameState, extensions: readonly SimulationSystem[]) {
    this.#state = validateState(state);
    this.#pipeline = buildPipeline(extensions);
    assertPipeline(this.#state, this.#pipeline);
  }

  static create(options: CampaignOptions): GameEngine {
    return new GameEngine(createCampaign(options), options.systems ?? []);
  }

  static fromState(state: unknown, extensions: readonly SimulationSystem[] = []): GameEngine {
    return new GameEngine(validateState(state), extensions);
  }

  get turn(): number { return this.#state.turn; }
  get state(): GameState { return structuredClone(this.#state); }

  advance(orders: readonly unknown[] = []): TurnResult {
    if (this.#advancing) throw new Error('Cannot advance the engine while a turn is resolving');
    this.#advancing = true;
    try {
      const { state, result } = processTurn(this.#state, orders, this.#pipeline);
      this.#state = state;
      return result;
    } finally { this.#advancing = false; }
  }

  run(turns: number): void {
    if (!Number.isSafeInteger(turns) || turns < 0) throw new RangeError('Turns must be a nonnegative safe integer');
    for (let index = 0; index < turns; index++) this.advance();
  }

  fork(): GameEngine {
    return GameEngine.fromState(this.#state, this.#pipeline.filter(s => !s.id.startsWith('core.')));
  }
}

/** Replay a journal suffix from a saved checkpoint, preserving turn numbers. */
export function replay(checkpoint: GameState, records: GameState['journal'], extensions: readonly SimulationSystem[] = []): GameState {
  const engine = GameEngine.fromState(checkpoint, extensions);
  for (const record of records) {
    if (record.turn !== engine.turn + 1) throw new Error(`Replay expected turn ${engine.turn + 1}, received ${record.turn}`);
    engine.advance(record.orders);
  }
  return engine.state;
}
