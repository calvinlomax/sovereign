import { clamp, institutionSchema, populationOf, weightedMean } from '../../shared-types/src/index.js';
import type { Institutions, Planet } from '../../shared-types/src/index.js';

/** Starting arrangements, not ideology bonuses. Every parameter enters a documented mechanism. */
export const templates = {
  participatoryFederation: { centralization: 0.3, participation: 0.85, redistribution: 0.65, publicServices: 0.7, automation: 0.3, transparency: 0.85 },
  algorithmicTechnocracy: { centralization: 0.8, participation: 0.3, redistribution: 0.5, publicServices: 0.6, automation: 0.9, transparency: 0.5 },
  commandState: { centralization: 0.95, participation: 0.15, redistribution: 0.8, publicServices: 0.65, automation: 0.35, transparency: 0.2 },
  cooperativeCommonwealth: { centralization: 0.4, participation: 0.8, redistribution: 0.9, publicServices: 0.85, automation: 0.4, transparency: 0.8 },
  corporateConsortium: { centralization: 0.5, participation: 0.35, redistribution: 0.1, publicServices: 0.25, automation: 0.65, transparency: 0.4 },
  distributedSociety: { centralization: 0.05, participation: 0.95, redistribution: 0.6, publicServices: 0.5, automation: 0.4, transparency: 0.9 },
} as const satisfies Record<string, Institutions>;

export function createInstitutions(template: keyof typeof templates = 'participatoryFederation', overrides: Partial<Institutions> = {}): Institutions {
  return institutionSchema.parse({ ...templates[template], ...overrides });
}

export function institutionalDemand(planet: Planet, territorySize: number): { coordinationCost: number; administrationDemand: number } {
  const institutions = planet.institutions;
  const education = weightedMean(planet.cohorts, c => c.education);
  const diversity = weightedMean(planet.cohorts, c => Math.abs(c.autonomyPreference - (1 - institutions.centralization)));
  // Participation consumes deliberation time. Centralization saves local coordination
  // but increases the information burden as territory and preference mismatch grow.
  const deliberation = institutions.participation * 0.16 * (1 - education * 0.5);
  const localCoordination = (1 - institutions.centralization) * 0.1;
  const informationLoad = institutions.centralization * (diversity * 0.12 + Math.max(0, territorySize - 1) * 0.025);
  return {
    coordinationCost: clamp(deliberation + localCoordination + informationLoad, 0, 0.6),
    administrationDemand: populationOf(planet.cohorts) * (0.015 + institutions.centralization * territorySize * 0.008 + institutions.transparency * 0.006),
  };
}
