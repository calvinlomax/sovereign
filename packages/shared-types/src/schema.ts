import { z } from 'zod';

export const MODEL_VERSION = '0.1.0' as const;
export const SCHEMA_VERSION = 1 as const;
export const idSchema = z.string().min(1).max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9:._/-]*$/);
const amount = z.number().finite().min(0);
const unit = z.number().finite().min(0).max(1);
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const resources = ['energy', 'matter', 'food'] as const;
export const resourceSchema = z.enum(resources);
export const stockSchema = z.object({ energy: amount, matter: amount, food: amount }).strict();
export const sectors = ['energy', 'mining', 'agriculture', 'industry', 'research', 'services'] as const;
export const sectorSchema = z.enum(sectors);
export const allocationSchema = z.object({
  energy: unit, mining: unit, agriculture: unit, industry: unit, research: unit, services: unit,
}).strict().refine(v => Math.abs(Object.values(v).reduce((a, b) => a + b, 0) - 1) < 1e-9,
  'Labor allocations must sum to 1');

export const institutionSchema = z.object({
  centralization: unit,
  participation: unit,
  redistribution: unit,
  publicServices: unit,
  automation: unit,
  transparency: unit,
}).strict();

const infrastructureSchema = z.object({
  energy: amount, mining: amount, agriculture: amount, industry: amount,
  research: amount, services: amount, computation: amount,
}).strict();
export const facilitySchema = z.enum([...sectors, 'computation']);
export const rulesetSchema = z.object({
  schemaVersion: z.literal(1),
  id: idSchema,
  version: z.string().min(1),
  economy: z.object({
    laborParticipation: unit, foodPerPerson: amount.positive(), energyPerPerson: amount.positive(),
    sectorEnergy: amount.positive(), matterPerIndustry: amount.positive(),
    foodYield: amount.positive(), energyYield: amount.positive(), miningYield: amount.positive(),
    knowledgeYield: amount.positive(), computationPerLevel: amount.positive(),
    automationLabor: amount, serviceDemand: amount.positive(),
  }).strict(),
  population: z.object({ birthRate: unit, deathRate: unit, shortageMortality: unit }).strict(),
  construction: z.object({ matterCost: amount.positive(), energyCost: amount.positive(), workCost: amount.positive() }).strict(),
  technologies: z.array(z.object({
    id: idSchema, name: z.string().min(1), cost: amount.positive(), prerequisites: z.array(idSchema),
    effect: z.enum(['energyYield', 'foodYield', 'computationPerLevel', 'knowledgeYield']),
    multiplier: z.number().finite().min(1).max(10),
  }).strict()).min(1),
}).strict().superRefine((rules, ctx) => {
  const ids = new Set(rules.technologies.map(t => t.id));
  if (ids.size !== rules.technologies.length) ctx.addIssue({ code: 'custom', message: 'Duplicate technology ID' });
  for (const tech of rules.technologies) {
    for (const prereq of tech.prerequisites) {
      if (!ids.has(prereq)) ctx.addIssue({ code: 'custom', message: `Unknown prerequisite: ${prereq}` });
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    const tech = rules.technologies.find(t => t.id === id);
    if (tech?.prerequisites.some(p => !visit(p))) return false;
    visiting.delete(id); visited.add(id); return true;
  };
  if (rules.technologies.some(t => !visit(t.id))) ctx.addIssue({ code: 'custom', message: 'Technology prerequisites contain a cycle' });
});

const cohortSchema = z.object({
  id: idSchema, name: z.string(), population: amount, education: unit,
  wealthWeight: amount.positive(), autonomyPreference: unit, participationPreference: unit,
  foodAccess: unit, satisfaction: unit,
}).strict();
const indicatorsSchema = z.object({
  welfare: unit, legitimacy: unit, unrest: unit, inequality: unit,
  education: unit, serviceCoverage: unit, administrativeCapacity: unit,
}).strict();
const ledgerSchema = z.object({
  opening: stockSchema, produced: stockSchema, consumed: stockSchema, closing: stockSchema,
  foodDemand: amount, unmetFood: amount, energyDemand: amount, unmetEnergy: amount,
  labor: amount, industrialCapacity: amount, computation: amount, knowledge: amount,
  coordinationCost: unit, automationUsed: unit,
}).strict();

export const planetSchema = z.object({
  id: idSchema, nodeId: idSchema, name: z.string().min(1), ownerId: idSchema.nullable(),
  environment: z.object({ habitability: unit, fertility: unit, minerals: unit, energyPotential: unit }).strict(),
  cohorts: z.array(cohortSchema), stock: stockSchema, infrastructure: infrastructureSchema,
  institutions: institutionSchema, allocation: allocationSchema, indicators: indicatorsSchema,
  projects: z.array(z.object({
    id: idSchema, facility: facilitySchema, remainingWork: amount,
  }).strict()),
  lastEconomy: ledgerSchema.nullable(),
  crisis: z.enum(['none', 'shortage', 'unrest', 'collapse']),
}).strict();

export const nodeKinds = ['multiverse', 'universe', 'cluster', 'galaxy', 'region', 'system', 'planet'] as const;
const nodeSchema = z.object({
  id: idSchema, kind: z.enum(nodeKinds), name: z.string(), parentId: idSchema.nullable(),
  children: z.array(idSchema), expanded: z.boolean(),
}).strict();

const civilizationSchema = z.object({
  id: idSchema, name: z.string().min(1), homeworldId: idSchema, planetIds: z.array(idSchema).min(1),
  research: z.object({ knowledge: amount, completed: z.array(idSchema), focus: idSchema.nullable() }).strict(),
}).strict();

export const phases = ['orders', 'transportation', 'economy', 'trade', 'population', 'institutions',
  'politics', 'conflict', 'research', 'events', 'history'] as const;
export const phaseSchema = z.enum(phases);
const systemDescriptorSchema = z.object({ id: idSchema, version: z.string().min(1), phase: phaseSchema }).strict();

export const orderSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('reform'), planetId: idSchema, institutions: institutionSchema }).strict(),
  z.object({ type: z.literal('allocate'), planetId: idSchema, allocation: allocationSchema }).strict(),
  z.object({ type: z.literal('construct'), planetId: idSchema, facility: facilitySchema }).strict(),
  z.object({ type: z.literal('research'), technologyId: idSchema.nullable() }).strict(),
  z.object({ type: z.literal('explore'), nodeId: idSchema }).strict(),
]);
export const eventSchema = z.object({
  id: idSchema, turn: integer, type: z.enum(['reform', 'construction', 'research', 'exploration', 'shortage', 'unrest', 'recovery', 'collapse']),
  planetId: idSchema.nullable(), message: z.string(),
  causes: z.record(z.string(), z.number().finite()),
}).strict();
export const metricsSchema = z.object({
  population: amount, welfare: unit, legitimacy: unit, unrest: unit, inequality: unit,
  energy: amount, matter: amount, food: amount, output: amount, knowledge: amount,
}).strict();
const observationSchema = z.object({
  turn: integer, year: z.number().finite(), civilization: metricsSchema,
  planets: z.record(idSchema, metricsSchema),
}).strict();
const turnRecordSchema = z.object({ turn: integer, orders: z.array(orderSchema) }).strict();

export const gameStateSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION), modelVersion: z.literal(MODEL_VERSION),
  seed: z.string().min(1).max(200), turn: integer,
  clock: z.object({ startYear: z.number().finite(), yearsPerTurn: z.literal(1) }).strict(),
  ruleset: rulesetSchema, systems: z.array(systemDescriptorSchema),
  playerCivilizationId: idSchema,
  civilizations: z.record(idSchema, civilizationSchema),
  world: z.object({ nodes: z.record(idSchema, nodeSchema), planets: z.record(idSchema, planetSchema) }).strict(),
  history: z.array(observationSchema).min(1), events: z.array(eventSchema), journal: z.array(turnRecordSchema),
}).strict();

export type ResourceStock = z.infer<typeof stockSchema>;
export type Resource = z.infer<typeof resourceSchema>;
export type Sector = z.infer<typeof sectorSchema>;
export type Facility = z.infer<typeof facilitySchema>;
export type Allocation = z.infer<typeof allocationSchema>;
export type Institutions = z.infer<typeof institutionSchema>;
export type Ruleset = z.infer<typeof rulesetSchema>;
export type Cohort = z.infer<typeof cohortSchema>;
export type Planet = z.infer<typeof planetSchema>;
export type WorldNode = z.infer<typeof nodeSchema>;
export type Civilization = z.infer<typeof civilizationSchema>;
export type GameState = z.infer<typeof gameStateSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Phase = z.infer<typeof phaseSchema>;
export type SystemDescriptor = z.infer<typeof systemDescriptorSchema>;
export type GameEvent = z.infer<typeof eventSchema>;
export type Metrics = z.infer<typeof metricsSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type EconomyLedger = z.infer<typeof ledgerSchema>;
