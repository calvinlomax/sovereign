import { populationOf, sum } from '../../shared-types/src/index.js';
import type { GameState, Metrics, Observation, Planet } from '../../shared-types/src/index.js';
import type { TurnContext } from './context.js';

export function planetMetrics(planet: Planet): Metrics {
  return {
    population: populationOf(planet.cohorts), welfare: planet.indicators.welfare,
    legitimacy: planet.indicators.legitimacy, unrest: planet.indicators.unrest, inequality: planet.indicators.inequality,
    ...planet.stock, output: sum(Object.values(planet.lastEconomy?.produced ?? {})), knowledge: planet.lastEconomy?.knowledge ?? 0,
  };
}

export function observe(state: GameState): Observation {
  const civ = state.civilizations[state.playerCivilizationId]!;
  const planets = Object.fromEntries([...civ.planetIds].sort().map(id => [id, planetMetrics(state.world.planets[id]!)]));
  const rows = Object.values(planets);
  const population = sum(rows.map(row => row.population));
  const total = (key: keyof Metrics): number => sum(rows.map(row => row[key]));
  const mean = (key: keyof Metrics): number => population > 0 ? sum(rows.map(row => row[key] * row.population)) / population : 0;
  return {
    turn: state.turn, year: state.clock.startYear + state.turn,
    planets,
    civilization: { population, welfare: mean('welfare'), legitimacy: mean('legitimacy'), unrest: mean('unrest'), inequality: mean('inequality'),
      energy: total('energy'), matter: total('matter'), food: total('food'), output: total('output'), knowledge: civ.research.knowledge },
  };
}

export function recordHistory({ state, orders }: TurnContext): void {
  state.history.push(observe(state));
  state.journal.push({ turn: state.turn, orders: structuredClone([...orders]) });
}
