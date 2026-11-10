import { clamp } from '../../../shared-types/src/index.js';
import { inhabitedPlanets } from '../context.js';
import type { TurnContext } from '../context.js';

export function updatePopulation({ state }: TurnContext): void {
  const rates = state.ruleset.population;
  for (const planet of inhabitedPlanets(state)) {
    for (const cohort of planet.cohorts) {
      const healthcare = planet.indicators.serviceCoverage;
      const births = rates.birthRate * cohort.foodAccess * planet.environment.habitability * (0.7 + healthcare * 0.3);
      const deaths = rates.deathRate * (1 - healthcare * 0.25) + rates.shortageMortality * (1 - cohort.foodAccess);
      cohort.population = Math.max(0, cohort.population * (1 + births - deaths));
      cohort.education = clamp(cohort.education + healthcare * 0.015 * (1 - cohort.education) - (1 - cohort.foodAccess) * 0.01);
    }
  }
}
