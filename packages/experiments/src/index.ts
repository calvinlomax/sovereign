import { GameEngine, observe } from '../../simulation/src/index.js';
import type { SimulationSystem } from '../../simulation/src/index.js';
import type { GameState, Metrics, Order } from '../../shared-types/src/index.js';

export interface ComparisonOptions {
  turns: number;
  controlOrders?: readonly Order[];
  treatmentOrders: readonly Order[];
  systems?: readonly SimulationSystem[];
}

export interface BranchComparison {
  baseline: Metrics;
  control: GameState;
  treatment: GameState;
  difference: Metrics;
}

/** Matched initial state, seed, and ruleset. Orders are applied once on the first turn. */
export function compareBranches(initial: GameState, options: ComparisonOptions): BranchComparison {
  if (!Number.isSafeInteger(options.turns) || options.turns < 1) throw new RangeError('Comparison requires at least one whole turn');
  const control = GameEngine.fromState(initial, options.systems);
  const treatment = GameEngine.fromState(initial, options.systems);
  const baseline = observe(control.state).civilization;
  control.advance(options.controlOrders ?? []);
  treatment.advance(options.treatmentOrders);
  control.run(options.turns - 1);
  treatment.run(options.turns - 1);
  const controlState = control.state;
  const treatmentState = treatment.state;
  const a = observe(controlState).civilization;
  const b = observe(treatmentState).civilization;
  const difference = Object.fromEntries(Object.keys(a).map(key => [key, b[key as keyof Metrics] - a[key as keyof Metrics]])) as Metrics;
  return { baseline, control: controlState, treatment: treatmentState, difference };
}
