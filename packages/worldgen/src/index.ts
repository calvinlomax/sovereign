import { emptyStock, randomFor } from '../../shared-types/src/index.js';
import type { GameState, Planet, WorldNode } from '../../shared-types/src/index.js';
import { createInstitutions } from '../../social-systems/src/index.js';

export const HOMEWORLD_ID = 'cosmos/universe-0/cluster-0/galaxy-0/region-0/system-0/planet-0';
export const HOME_SYSTEM_ID = HOMEWORLD_ID.slice(0, HOMEWORLD_ID.lastIndexOf('/'));

function uninhabitedPlanet(seed: string, id: string, name: string): Planet {
  const random = randomFor(seed, 'planet', id);
  return {
    id, nodeId: id, name, ownerId: null,
    environment: { habitability: random(), fertility: random(), minerals: 0.2 + random() * 0.8, energyPotential: 0.3 + random() * 0.7 },
    cohorts: [], stock: emptyStock(),
    infrastructure: { energy: 0, mining: 0, agriculture: 0, industry: 0, research: 0, services: 0, computation: 0 },
    institutions: createInstitutions(), allocation: { energy: 0.18, mining: 0.12, agriculture: 0.25, industry: 0.15, research: 0.15, services: 0.15 },
    indicators: { welfare: 0, legitimacy: 0, unrest: 0, inequality: 0, education: 0, serviceCoverage: 0, administrativeCapacity: 0 },
    projects: [], lastEconomy: null, crisis: 'none',
  };
}

const nextKind: Partial<Record<WorldNode['kind'], WorldNode['kind']>> = {
  multiverse: 'universe', universe: 'cluster', cluster: 'galaxy', galaxy: 'region', region: 'system', system: 'planet',
};

/** Expand only one known node. Address-derived randomness makes exploration order irrelevant. */
export function expandNode(world: GameState['world'], seed: string, nodeId: string): string[] {
  const node = world.nodes[nodeId];
  if (!node) throw new Error(`Unknown world node: ${nodeId}`);
  if (node.expanded) return [];
  const kind = nextKind[node.kind];
  if (!kind) return [];
  const random = randomFor(seed, 'children', nodeId);
  const count = kind === 'planet' ? 3 + Math.floor(random() * 3) : 2 + Math.floor(random() * 3);
  const added: string[] = [];
  for (let index = 0; index < count; index++) {
    const id = `${nodeId}/${kind}-${index}`;
    if (world.nodes[id]) continue;
    const name = `${kind[0]?.toUpperCase()}${kind.slice(1)} ${index + 1}`;
    world.nodes[id] = { id, kind, name, parentId: nodeId, children: [], expanded: kind === 'planet' };
    node.children.push(id);
    added.push(id);
    if (kind === 'planet') world.planets[id] = uninhabitedPlanet(seed, id, name);
  }
  node.children.sort();
  node.expanded = true;
  return added;
}

export function generateWorld(seed: string, civilizationId: string): GameState['world'] {
  const world: GameState['world'] = { nodes: {}, planets: {} };
  let parentId: string | null = null;
  let path = '';
  for (const kind of ['multiverse', 'universe', 'cluster', 'galaxy', 'region', 'system'] as const) {
    const id = kind === 'multiverse' ? 'cosmos' : `${path}/${kind}-0`;
    world.nodes[id] = { id, kind, name: kind === 'system' ? 'Origin' : kind, parentId, children: [], expanded: false };
    if (parentId) world.nodes[parentId]!.children.push(id);
    path = id; parentId = id;
  }
  expandNode(world, seed, HOME_SYSTEM_ID);
  const home = world.planets[HOMEWORLD_ID]!;
  home.name = 'Haven';
  world.nodes[HOMEWORLD_ID]!.name = home.name;
  home.ownerId = civilizationId;
  // The opening scenario is viable for every seed; neighbors remain unconstrained.
  home.environment.habitability = 0.9;
  home.environment.fertility = 0.7 + home.environment.fertility * 0.2;
  home.environment.energyPotential = 0.75 + home.environment.energyPotential * 0.2;
  home.stock = { energy: 160, matter: 100, food: 220 };
  home.infrastructure = { energy: 120, mining: 90, agriculture: 160, industry: 100, research: 90, services: 110, computation: 45 };
  home.cohorts = [
    { id: 'workers', name: 'Production workers', population: 650, education: 0.55, wealthWeight: 0.7, autonomyPreference: 0.55, participationPreference: 0.75, foodAccess: 1, satisfaction: 0.65 },
    { id: 'specialists', name: 'Technical specialists', population: 280, education: 0.9, wealthWeight: 1.5, autonomyPreference: 0.75, participationPreference: 0.8, foodAccess: 1, satisfaction: 0.7 },
    { id: 'owners', name: 'Capital owners', population: 70, education: 0.85, wealthWeight: 4, autonomyPreference: 0.8, participationPreference: 0.5, foodAccess: 1, satisfaction: 0.75 },
  ];
  home.indicators = { welfare: 0.7, legitimacy: 0.7, unrest: 0.2, inequality: 0, education: 0.669, serviceCoverage: 0.6, administrativeCapacity: 0.8 };
  return world;
}
