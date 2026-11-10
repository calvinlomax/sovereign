import { clamp, populationOf, weightedMean } from '../../../shared-types/src/index.js';
import { inhabitedPlanets } from '../context.js';
import type { TurnContext } from '../context.js';

export function updateInstitutions({ state }: TurnContext): void {
  for (const planet of inhabitedPlanets(state)) {
    const indicators = planet.indicators;
    const population = populationOf(planet.cohorts);
    const foodAccess = weightedMean(planet.cohorts, c => c.foodAccess);
    // Inequality measures unequal access to essentials, not an invented currency balance.
    let difference = 0;
    for (const a of planet.cohorts) for (const b of planet.cohorts) {
      difference += a.population * b.population * Math.abs(a.foodAccess - b.foodAccess);
    }
    indicators.inequality = population > 0 && foodAccess > 0 ? clamp(difference / (2 * population * population * foodAccess)) : 0;
    indicators.education = weightedMean(planet.cohorts, c => c.education);
    indicators.welfare = population > 0 ? clamp(foodAccess * 0.65 + indicators.serviceCoverage * 0.25 + planet.environment.habitability * 0.1) : 0;
  }
}

export function updatePolitics({ state }: TurnContext): void {
  for (const planet of inhabitedPlanets(state)) {
    const institutions = planet.institutions;
    for (const cohort of planet.cohorts) {
      const voice = 1 - Math.abs(cohort.participationPreference - institutions.participation);
      const autonomy = 1 - Math.abs(cohort.autonomyPreference - (1 - institutions.centralization));
      const trust = institutions.transparency * planet.indicators.administrativeCapacity;
      const target = cohort.foodAccess * 0.4 + planet.indicators.serviceCoverage * 0.15 + voice * 0.2 + autonomy * 0.15 + trust * 0.1;
      cohort.satisfaction = clamp(cohort.satisfaction * 0.75 + target * 0.25);
    }
    const population = populationOf(planet.cohorts);
    if (population === 0) {
      planet.indicators.legitimacy = 0; planet.indicators.unrest = 0;
      continue;
    }
    const satisfaction = weightedMean(planet.cohorts, c => c.satisfaction);
    planet.indicators.legitimacy = clamp(planet.indicators.legitimacy * 0.8 + satisfaction * 0.2);
    const shortage = 1 - weightedMean(planet.cohorts, c => c.foodAccess);
    planet.indicators.unrest = clamp(planet.indicators.unrest * 0.75 + ((1 - satisfaction) * 0.65 + shortage * 0.35) * 0.25);
  }
}
