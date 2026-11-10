import { phases } from '../../shared-types/src/index.js';
import type { SimulationSystem } from './context.js';
import { applyOrders } from './orders.js';
import { updateConstruction } from './construction.js';
import { updateEconomy } from './economy/index.js';
import { updatePopulation } from './population/index.js';
import { updateInstitutions, updatePolitics } from './politics/index.js';
import { updateResearch } from './technology/index.js';
import { updateEvents } from './events/index.js';
import { recordHistory } from './history.js';

const reserved: SimulationSystem['update'] = () => {};

export const CORE_SYSTEMS: readonly SimulationSystem[] = Object.freeze(([
  { id: 'core.orders', version: '1', phase: 'orders', update: applyOrders },
  { id: 'core.construction', version: '1', phase: 'transportation', update: updateConstruction },
  { id: 'core.economy', version: '1', phase: 'economy', update: updateEconomy },
  { id: 'core.trade', version: '1', phase: 'trade', update: reserved },
  { id: 'core.population', version: '1', phase: 'population', update: updatePopulation },
  { id: 'core.institutions', version: '1', phase: 'institutions', update: updateInstitutions },
  { id: 'core.politics', version: '1', phase: 'politics', update: updatePolitics },
  { id: 'core.conflict', version: '1', phase: 'conflict', update: reserved },
  { id: 'core.research', version: '1', phase: 'research', update: updateResearch },
  { id: 'core.events', version: '1', phase: 'events', update: updateEvents },
  { id: 'core.history', version: '1', phase: 'history', update: recordHistory },
] satisfies SimulationSystem[]).map(system => Object.freeze(system)));

export function buildPipeline(extensions: readonly SimulationSystem[] = []): SimulationSystem[] {
  const ids = new Set(CORE_SYSTEMS.map(s => s.id));
  for (const extension of extensions) {
    if (extension.id.startsWith('core.')) throw new Error('The core. system namespace is reserved');
    if (ids.has(extension.id)) throw new Error(`Duplicate system ID: ${extension.id}`);
    if (!phases.includes(extension.phase) || extension.phase === 'orders' || extension.phase === 'history') {
      throw new Error('Extensions must use a simulation phase between transportation and events');
    }
    if (typeof extension.update !== 'function') throw new Error(`System has no update function: ${extension.id}`);
    ids.add(extension.id);
  }
  return phases.flatMap(phase => [
    ...CORE_SYSTEMS.filter(s => s.phase === phase),
    ...extensions.filter(s => s.phase === phase).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  ]).map(system => ({ ...system }));
}
