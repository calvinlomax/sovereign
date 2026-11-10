import { describe, expect, it } from 'vitest';
import { GameEngine, defaultRuleset, observe } from '../packages/simulation/src/index.js';
import { distributeFood } from '../packages/simulation/src/economy/index.js';
import { createInstitutions } from '../packages/social-systems/src/index.js';
import { HOMEWORLD_ID } from '../packages/worldgen/src/index.js';
import { populationOf, rulesetSchema, validateState } from '../packages/shared-types/src/index.js';
import { compareBranches } from '../packages/experiments/src/index.js';

describe('resource and social mechanisms', () => {
  it('balances every stored resource for every simulated turn', () => {
    const engine = GameEngine.create({ seed: 'ledger' });
    for (let turn = 0; turn < 50; turn++) {
      engine.advance();
      const planet = engine.state.world.planets[HOMEWORLD_ID]!;
      const ledger = planet.lastEconomy!;
      for (const resource of ['energy', 'matter', 'food'] as const) {
        expect(ledger.opening[resource] + ledger.produced[resource] - ledger.consumed[resource]).toBeCloseTo(ledger.closing[resource], 8);
        expect(planet.stock[resource]).toBe(ledger.closing[resource]);
        expect(planet.stock[resource]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('redistributes scarce food without creating it or exceeding cohort needs', () => {
    const market = distributeFood([80, 20], [1, 5], 50, 0);
    const universal = distributeFood([80, 20], [1, 5], 50, 1);
    expect(market.reduce((a, b) => a + b, 0)).toBeCloseTo(50);
    expect(universal).toEqual([40, 10]);
    expect(universal[0]!).toBeGreaterThan(market[0]!);
    expect(market[1]!).toBeLessThanOrEqual(20);
    expect(distributeFood([80, 20], [1, 5], 200, 0)).toEqual([80, 20]);
    expect(distributeFood([0, 0], [1, 5], 200, 1)).toEqual([0, 0]);
  });

  it('turns food scarcity into cohort deprivation, population loss, unrest and a contextual event', () => {
    const state = GameEngine.create({ seed: 'famine' }).state;
    const home = state.world.planets[HOMEWORLD_ID]!;
    home.stock.food = 0; home.infrastructure.agriculture = 0;
    const engine = GameEngine.fromState(state);
    engine.run(12);
    const after = engine.state.world.planets[HOMEWORLD_ID]!;
    expect(after.lastEconomy!.unmetFood).toBeGreaterThan(0);
    expect(populationOf(after.cohorts)).toBeLessThan(1000);
    expect(after.indicators.welfare).toBeLessThan(home.indicators.welfare);
    expect(after.indicators.unrest).toBeGreaterThan(home.indicators.unrest);
    expect(engine.state.events.filter(e => e.type === 'shortage')).toHaveLength(1);
    expect(after.stock.food).toBe(0);
  });

  it('makes automation depend on computation, and produces nothing without labor', () => {
    const state = GameEngine.create({ seed: 'compute' }).state;
    const home = state.world.planets[HOMEWORLD_ID]!;
    home.infrastructure.computation = 0; home.institutions.automation = 1;
    const engine = GameEngine.fromState(state); engine.advance();
    expect(engine.state.world.planets[HOMEWORLD_ID]!.lastEconomy!.automationUsed).toBe(0);
    for (const cohort of home.cohorts) cohort.population = 0;
    const empty = GameEngine.fromState(state); empty.advance();
    expect(empty.state.world.planets[HOMEWORLD_ID]!.lastEconomy!.produced).toEqual({ energy: 0, matter: 0, food: 0 });
    expect(empty.state.events.some(e => e.type === 'collapse')).toBe(true);
    expect(() => validateState(empty.state)).not.toThrow();
  });

  it('charges construction once and waits for manufactured capacity before completing', () => {
    const engine = GameEngine.create({ seed: 'construction' });
    engine.advance([{ type: 'construct', planetId: HOMEWORLD_ID, facility: 'computation' }]);
    const first = engine.state.world.planets[HOMEWORLD_ID]!;
    expect(first.projects).toHaveLength(1);
    expect(first.lastEconomy!.opening.matter).toBe(92);
    expect(first.lastEconomy!.opening.energy).toBe(155);
    expect(first.infrastructure.computation).toBe(45);
    engine.advance();
    expect(engine.state.world.planets[HOMEWORLD_ID]!.projects).toHaveLength(0);
    expect(engine.state.world.planets[HOMEWORLD_ID]!.infrastructure.computation).toBe(55);
    engine.run(5);
    expect(engine.state.events.filter(e => e.type === 'construction')).toHaveLength(1);
  });

  it('completes research once, spends knowledge and applies its effect next turn', () => {
    const engine = GameEngine.create({ seed: 'research' });
    const control = engine.fork();
    engine.advance([{ type: 'research', technologyId: 'efficient-grids' }]); control.advance();
    while (!engine.state.civilizations['civilization:player']!.research.completed.includes('efficient-grids') && engine.turn < 30) {
      engine.advance(); control.advance();
    }
    expect(engine.state.civilizations['civilization:player']!.research.completed).toContain('efficient-grids');
    const spent = control.state.civilizations['civilization:player']!.research.knowledge - engine.state.civilizations['civilization:player']!.research.knowledge;
    expect(spent).toBeCloseTo(35);
    engine.advance(); control.advance();
    expect(engine.state.world.planets[HOMEWORLD_ID]!.lastEconomy!.produced.energy).toBeGreaterThan(control.state.world.planets[HOMEWORLD_ID]!.lastEconomy!.produced.energy);
    expect(engine.state.events.filter(e => e.type === 'research')).toHaveLength(1);
    expect(() => engine.advance([{ type: 'research', technologyId: 'efficient-grids' }])).toThrow(/already completed/);
  });

  it('compares independent branches from the same baseline and produces measurable reform effects', () => {
    const initial = GameEngine.create({ seed: 'comparison' }).state;
    const before = structuredClone(initial);
    const result = compareBranches(initial, { turns: 25, treatmentOrders: [
      { type: 'reform', planetId: HOMEWORLD_ID, institutions: createInstitutions('algorithmicTechnocracy') },
    ] });
    expect(initial).toEqual(before);
    expect(result.control.seed).toBe(result.treatment.seed);
    expect(result.difference.legitimacy).not.toBe(0);
    expect(result.difference.output).not.toBe(0);
    expect(result.difference.welfare).toBeCloseTo(observe(result.treatment).civilization.welfare - observe(result.control).civilization.welfare);
  });

  it('rejects invalid data definitions and cyclic research prerequisites', () => {
    const rules = defaultRuleset();
    rules.technologies[0]!.prerequisites = ['distributed-computing'];
    expect(() => rulesetSchema.parse(rules)).toThrow(/cycle/);
    const missing = defaultRuleset(); missing.technologies[0]!.prerequisites = ['unknown'];
    expect(() => rulesetSchema.parse(missing)).toThrow(/Unknown prerequisite/);
  });

  it.each(['long-a', 'long-b', 'long-c'])('keeps all state finite and bounded over 200 turns for %s', seed => {
    const engine = GameEngine.create({ seed });
    engine.run(200);
    expect(() => validateState(engine.state)).not.toThrow();
    expect(engine.state.history).toHaveLength(201);
    expect(engine.state.world.planets[HOMEWORLD_ID]!.indicators.welfare).toBeGreaterThan(0);
  });
});
