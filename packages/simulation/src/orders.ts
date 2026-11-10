import { institutionSchema, orderSchema, canonicalJson } from '../../shared-types/src/index.js';
import type { Order, Planet } from '../../shared-types/src/index.js';
import { expandNode } from '../../worldgen/src/index.js';
import type { TurnContext } from './context.js';

export class OrderValidationError extends Error {
  override name = 'OrderValidationError';
  constructor(message: string, public readonly orderIndex: number) { super(`Order ${orderIndex + 1}: ${message}`); }
}

export function parseOrders(input: readonly unknown[]): Order[] {
  if (!Array.isArray(input)) throw new OrderValidationError('Expected an array of orders', 0);
  return input.map((order, index) => {
    const parsed = orderSchema.safeParse(order);
    if (!parsed.success) throw new OrderValidationError(parsed.error.message, index);
    return parsed.data;
  });
}

/** Orders resolve sequentially on a disposable state. Any invalid order rolls back the whole turn. */
export function applyOrders(context: TurnContext): void {
  const { state, orders, emit } = context;
  const civilization = state.civilizations[state.playerCivilizationId]!;
  orders.forEach((order, index) => {
    const reject = (message: string): never => { throw new OrderValidationError(message, index); };
    let planet: Planet | undefined;
    if ('planetId' in order) {
      planet = state.world.planets[order.planetId];
      if (!planet || planet.ownerId !== civilization.id) reject('Planet is not controlled by the player');
    }
    switch (order.type) {
      case 'reform': {
        const target = planet!;
        if (canonicalJson(target.institutions) === canonicalJson(order.institutions)) break;
        const before = target.institutions;
        target.institutions = institutionSchema.parse(order.institutions);
        const changes = Object.fromEntries(Object.entries(target.institutions).map(([key, value]) => [key, value - before[key as keyof typeof before]]));
        emit({ type: 'reform', planetId: target.id, message: `${target.name} adopted new institutions.`, causes: changes });
        break;
      }
      case 'allocate': planet!.allocation = { ...order.allocation }; break;
      case 'construct': {
        const target = planet!;
        const costs = state.ruleset.construction;
        if (target.stock.energy < costs.energyCost || target.stock.matter < costs.matterCost) reject('Insufficient energy or matter for construction');
        if (target.projects.length >= 20) reject('Construction queue is full (20 projects)');
        target.stock.energy -= costs.energyCost; target.stock.matter -= costs.matterCost;
        target.projects.push({ id: `project:${state.turn}:${index}`, facility: order.facility, remainingWork: costs.workCost });
        break;
      }
      case 'research': {
        if (order.technologyId === null) { civilization.research.focus = null; break; }
        const tech = state.ruleset.technologies.find(t => t.id === order.technologyId);
        if (!tech) reject('Unknown technology');
        if (civilization.research.completed.includes(tech!.id)) reject('Technology already completed');
        if (!tech!.prerequisites.every(p => civilization.research.completed.includes(p))) reject('Research prerequisites are not met');
        civilization.research.focus = tech!.id;
        break;
      }
      case 'explore': {
        if (!state.world.nodes[order.nodeId]) reject('Unknown exploration target');
        const added = expandNode(state.world, state.seed, order.nodeId);
        if (added.length) emit({ type: 'exploration', planetId: null, message: `Surveyed ${state.world.nodes[order.nodeId]!.name}.`, causes: { discovered: added.length } });
        break;
      }
    }
  });
}
