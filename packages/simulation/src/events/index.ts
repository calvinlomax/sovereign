import { populationOf } from '../../../shared-types/src/index.js';
import type { Planet } from '../../../shared-types/src/index.js';
import { inhabitedPlanets } from '../context.js';
import type { TurnContext } from '../context.js';

/** Events report threshold transitions. Conditions already drive consequences in the models. */
export function updateEvents({ state, emit }: TurnContext): void {
  for (const planet of inhabitedPlanets(state)) {
    const ledger = planet.lastEconomy;
    const shortage = ledger && ledger.foodDemand > 0 ? ledger.unmetFood / ledger.foodDemand : 0;
    let crisis: Planet['crisis'] = 'none';
    if (populationOf(planet.cohorts) < 1) crisis = 'collapse';
    else if (shortage > 0.1) crisis = 'shortage';
    else if (planet.indicators.unrest > 0.45) crisis = 'unrest';
    if (crisis !== planet.crisis) {
      const type = crisis === 'none' ? 'recovery' : crisis;
      emit({ type, planetId: planet.id,
        message: crisis === 'none' ? `${planet.name} has recovered from its crisis.` : `${planet.name} faces ${crisis}.`,
        causes: { foodShortfall: shortage, unrest: planet.indicators.unrest, population: populationOf(planet.cohorts) },
      });
      planet.crisis = crisis;
    }
  }
}
