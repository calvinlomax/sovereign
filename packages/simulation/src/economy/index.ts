import { clamp, emptyStock, populationOf, sum, weightedMean } from '../../../shared-types/src/index.js';
import type { EconomyLedger, Planet, Resource, Ruleset } from '../../../shared-types/src/index.js';
import { institutionalDemand } from '../../../social-systems/src/index.js';
import { inhabitedPlanets } from '../context.js';
import type { TurnContext } from '../context.js';

/** Equal provision first; the remaining pool follows purchasing power, with needs capped. */
export function distributeFood(demands: readonly number[], weights: readonly number[], supply: number, redistribution: number): number[] {
  const totalDemand = sum(demands);
  const available = Math.min(supply, totalDemand);
  if (totalDemand === 0) return demands.map(() => 0);
  if (available >= totalDemand) return [...demands];
  const allocated = demands.map(d => available * redistribution * d / totalDemand);
  let remaining = available - sum(allocated);
  // Each capped pass removes at least one cohort, so at most n + 1 passes are needed.
  for (let pass = 0; pass <= demands.length && remaining > 1e-10; pass++) {
    const pending = demands.map((d, i) => Math.max(0, d - allocated[i]!));
    const weightSum = sum(pending.map((d, i) => d > 1e-10 ? demands[i]! * weights[i]! : 0));
    if (weightSum === 0) break;
    let used = 0;
    pending.forEach((need, i) => {
      if (need <= 1e-10) return;
      const share = Math.min(need, remaining * demands[i]! * weights[i]! / weightSum);
      allocated[i] = allocated[i]! + share;
      used += share;
    });
    remaining = Math.max(0, remaining - used);
  }
  return allocated;
}

function simulateEconomy(planet: Planet, rules: Ruleset, completed: readonly string[], territorySize: number): void {
  const economy = { ...rules.economy };
  for (const technology of rules.technologies) {
    if (completed.includes(technology.id)) economy[technology.effect] *= technology.multiplier;
  }
  const population = populationOf(planet.cohorts);
  const education = weightedMean(planet.cohorts, c => c.education);
  const { coordinationCost, administrationDemand } = institutionalDemand(planet, territorySize);
  const ledger: EconomyLedger = {
    opening: { ...planet.stock }, produced: emptyStock(), consumed: emptyStock(), closing: emptyStock(),
    foodDemand: population * economy.foodPerPerson, unmetFood: 0,
    energyDemand: 0, unmetEnergy: 0, labor: 0, industrialCapacity: 0, computation: 0, knowledge: 0,
    coordinationCost, automationUsed: 0,
  };
  const produce = (resource: Resource, amount: number): void => {
    ledger.produced[resource] += amount; planet.stock[resource] += amount;
  };
  const consume = (resource: Resource, demand: number): number => {
    const amount = Math.min(planet.stock[resource], demand);
    ledger.consumed[resource] += amount; planet.stock[resource] = Math.max(0, planet.stock[resource] - amount);
    if (resource === 'energy') { ledger.energyDemand += demand; ledger.unmetEnergy += demand - amount; }
    return amount;
  };
  const labor = population * economy.laborParticipation * (0.5 + education * 0.5) * (1 - coordinationCost);
  ledger.labor = labor;
  // Power generation uses human labor; this prevents automation from powering itself for free.
  const energyWork = Math.min(planet.infrastructure.energy, labor * planet.allocation.energy);
  produce('energy', energyWork * economy.energyYield * planet.environment.energyPotential);
  consume('energy', population * economy.energyPerPerson);

  const desiredComputation = population > 0 ? planet.infrastructure.computation * economy.computationPerLevel : 0;
  const computation = consume('energy', desiredComputation * 0.2) / 0.2;
  ledger.computation = computation;
  const administration = Math.min(computation, administrationDemand);
  let availableComputation = Math.max(0, computation - administration);
  planet.indicators.administrativeCapacity = administrationDemand > 0 ? clamp(administration / administrationDemand) : 0;
  const automationDemand = labor * planet.institutions.automation * 0.1;
  const automationCompute = Math.min(availableComputation, automationDemand);
  ledger.automationUsed = automationDemand > 0 ? planet.institutions.automation * automationCompute / automationDemand : 0;
  availableComputation = Math.max(0, availableComputation - automationCompute);
  const effectiveLabor = labor * (1 + ledger.automationUsed * economy.automationLabor);
  const work = Object.fromEntries(['mining', 'agriculture', 'industry', 'research', 'services'].map(sector => {
    const key = sector as 'mining' | 'agriculture' | 'industry' | 'research' | 'services';
    return [key, Math.min(planet.infrastructure[key], effectiveLabor * planet.allocation[key])];
  })) as Record<'mining' | 'agriculture' | 'industry' | 'research' | 'services', number>;
  const demand = sum(Object.values(work)) * economy.sectorEnergy;
  const energyRatio = demand > 0 ? consume('energy', demand) / demand : 0;
  for (const sector of Object.keys(work) as (keyof typeof work)[]) work[sector] *= energyRatio;

  produce('matter', work.mining * economy.miningYield * planet.environment.minerals);
  produce('food', work.agriculture * economy.foodYield * planet.environment.fertility);
  ledger.industrialCapacity = consume('matter', work.industry * economy.matterPerIndustry) / economy.matterPerIndustry;
  const researchComputeDemand = work.research * 0.2;
  const researchRatio = researchComputeDemand > 0 ? Math.min(1, availableComputation / researchComputeDemand) : 0;
  ledger.knowledge = work.research * researchRatio * economy.knowledgeYield * education;
  planet.indicators.serviceCoverage = population > 0
    ? clamp(work.services * planet.institutions.publicServices / (population * economy.serviceDemand)) : 0;

  const demands = planet.cohorts.map(c => c.population * economy.foodPerPerson);
  const food = distributeFood(demands, planet.cohorts.map(c => c.wealthWeight), planet.stock.food, planet.institutions.redistribution);
  const eaten = consume('food', sum(food));
  ledger.unmetFood = Math.max(0, ledger.foodDemand - eaten);
  planet.cohorts.forEach((cohort, i) => { cohort.foodAccess = demands[i]! > 0 ? clamp(food[i]! / demands[i]!) : 0; });
  ledger.closing = { ...planet.stock };
  planet.lastEconomy = ledger;
}

export function updateEconomy({ state }: TurnContext): void {
  for (const planet of inhabitedPlanets(state)) {
    const civilization = state.civilizations[planet.ownerId!]!;
    simulateEconomy(planet, state.ruleset, civilization.research.completed, civilization.planetIds.length);
  }
}
