import { describe, expect, it } from 'vitest';
import { canonicalJson, phases, validateState } from '../packages/shared-types/src/index.js';
import { GameEngine, OrderValidationError, createCampaign, replay, resolveTurn } from '../packages/simulation/src/index.js';
import type { SimulationSystem } from '../packages/simulation/src/index.js';
import { createInstitutions } from '../packages/social-systems/src/index.js';
import { HOMEWORLD_ID } from '../packages/worldgen/src/index.js';

const start = () => GameEngine.create({ seed: 'engine-tests' });

describe('deterministic turn engine', () => {
  it('starts a viable homeworld with cohorts, one civilization and a sparse universe', () => {
    const engine = start();
    const state = engine.state;
    expect(state.world.planets[HOMEWORLD_ID]!.cohorts).toHaveLength(3);
    expect(Object.keys(state.world.planets).length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(state.world.planets).length).toBeLessThanOrEqual(5);
    expect(Object.keys(state.world.nodes).length).toBeLessThan(12);
    expect(state.history[0]!.civilization.population).toBe(1000);
    expect(() => validateState(state)).not.toThrow();
  });

  it('reproduces identical seeds and order histories exactly', () => {
    const a = start(); const b = start();
    const orders = [{ type: 'research', technologyId: 'efficient-grids' }];
    a.advance(orders); b.advance(orders);
    a.run(40); b.run(40);
    expect(canonicalJson(a.state)).toBe(canonicalJson(b.state));
    expect(replay(createCampaign({ seed: 'engine-tests' }), a.state.journal)).toEqual(a.state);
  });

  it('runs all eleven phases and records one observation and journal entry per turn', () => {
    const engine = start();
    expect(engine.advance().phases).toEqual(phases);
    engine.run(4);
    expect(engine.state.history.map(row => row.turn)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(engine.state.journal.map(row => row.turn)).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not leak mutable state or mutate pure transition inputs', () => {
    const engine = start(); const source = engine.state; const before = structuredClone(source);
    resolveTurn(source);
    expect(source).toEqual(before);
    source.world.planets[HOMEWORLD_ID]!.stock.energy = 0;
    expect(engine.state.world.planets[HOMEWORLD_ID]!.stock.energy).toBe(160);
    const fork = engine.fork(); fork.advance();
    expect(engine.turn).toBe(0); expect(fork.turn).toBe(1);
  });

  it('rolls back an entire batch when a later order is invalid', () => {
    const engine = start(); const before = engine.state;
    expect(() => engine.advance([
      { type: 'construct', planetId: HOMEWORLD_ID, facility: 'energy' },
      { type: 'reform', planetId: 'unknown', institutions: createInstitutions('commandState') },
    ])).toThrow(OrderValidationError);
    expect(engine.state).toEqual(before);
    engine.advance(); expect(engine.turn).toBe(1);
  });

  it.each([
    { type: 'allocate', planetId: HOMEWORLD_ID, allocation: { energy: 1, mining: 1, agriculture: 0, industry: 0, research: 0, services: 0 } },
    { type: 'reform', planetId: HOMEWORLD_ID, institutions: { ...createInstitutions(), automation: Number.NaN } },
    { type: 'reform', planetId: HOMEWORLD_ID, institutions: { ...createInstitutions(), participation: 2 } },
    { type: 'construct', planetId: HOMEWORLD_ID, facility: 'magic' },
    { type: 'research', technologyId: 'distributed-computing' },
    { type: 'research', technologyId: 'nonexistent' },
    { type: 'cheat' },
  ])('rejects invalid or unavailable orders without advancing: %j', order => {
    const engine = start();
    expect(() => engine.advance([order])).toThrow(OrderValidationError);
    expect(engine.turn).toBe(0);
  });

  it('rejects orders for uncontrolled planets', () => {
    const engine = start();
    const unowned = Object.values(engine.state.world.planets).find(p => p.ownerId === null)!;
    expect(() => engine.advance([{ type: 'construct', planetId: unowned.id, facility: 'energy' }])).toThrow(/not controlled/);
  });

  it('reserves construction costs sequentially to prevent overspending', () => {
    const engine = start(); const before = engine.state;
    const orders = Array.from({ length: 13 }, () => ({ type: 'construct', planetId: HOMEWORLD_ID, facility: 'energy' }));
    expect(() => engine.advance(orders)).toThrow(/Insufficient/);
    expect(engine.state).toEqual(before);
  });

  it('executes extensions deterministically, pins their versions and rolls back failed systems', () => {
    const called: string[] = [];
    const extension: SimulationSystem = { id: 'example.audit', version: '1', phase: 'trade', update: context => {
      called.push('trade'); context.random('example.audit', HOMEWORLD_ID)();
    } };
    const engine = GameEngine.create({ seed: 'extension', systems: [extension] });
    expect(() => GameEngine.fromState(engine.state)).toThrow(/System versions/);
    engine.advance(); expect(called).toEqual(['trade']);
    engine.fork().advance(); expect(called).toEqual(['trade', 'trade']);
    const failure: SimulationSystem = { id: 'example.failure', version: '1', phase: 'events', update: ({ state }) => {
      state.world.planets[HOMEWORLD_ID]!.stock.energy = 0;
      throw new Error('System failed');
    } };
    const broken = GameEngine.create({ seed: 'failure', systems: [failure] }); const before = broken.state;
    expect(() => broken.advance()).toThrow('System failed'); expect(broken.state).toEqual(before);
  });

  it('rejects invalid run counts and discontinuous replay', () => {
    const engine = start();
    for (const turns of [-1, 1.5, Number.NaN, Infinity]) expect(() => engine.run(turns)).toThrow(RangeError);
    expect(() => replay(engine.state, [{ turn: 2, orders: [] }])).toThrow(/expected turn 1/);
  });

  it('rejects asynchronous extensions and preserves the committed state', async () => {
    const extension: SimulationSystem = { id: 'example.async', version: '1', phase: 'trade', update: async ({ state }) => {
      await Promise.resolve();
      state.world.planets[HOMEWORLD_ID]!.stock.energy = 0;
      throw new Error('Late failure');
    } };
    const engine = GameEngine.create({ seed: 'async', systems: [extension] });
    const before = engine.state;
    expect(() => engine.advance()).toThrow(/must be synchronous/);
    await Promise.resolve();
    expect(engine.state).toEqual(before);
  });

  it('replays stochastic extensions with the same keyed random streams', () => {
    const extension: SimulationSystem = { id: 'example.climate', version: '1', phase: 'population', update: ({ state, random }) => {
      const rng = random('example.climate', HOMEWORLD_ID);
      state.world.planets[HOMEWORLD_ID]!.environment.habitability = 0.7 + rng() * 0.3;
    } };
    const options = { seed: 'stochastic', systems: [extension] };
    const engine = GameEngine.create(options); engine.run(10);
    expect(replay(createCampaign(options), engine.state.journal, [extension])).toEqual(engine.state);
    expect(() => GameEngine.fromState(engine.state, [{ ...extension, version: '2' }])).toThrow(/System versions/);
  });
});
