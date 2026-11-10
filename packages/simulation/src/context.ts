import type { GameEvent, GameState, Order, Phase, Planet, SystemDescriptor } from '../../shared-types/src/index.js';
import { randomFor } from '../../shared-types/src/index.js';

export interface TurnContext {
  state: GameState;
  orders: readonly Order[];
  emit: (event: Omit<GameEvent, 'id' | 'turn'>) => void;
  random: (systemId: string, entityId: string) => () => number;
}

/** Systems are synchronous and may mutate only their working state, never external state. */
export interface SimulationSystem extends SystemDescriptor {
  update: (context: TurnContext) => void;
}

export interface TurnResult {
  turn: number;
  events: GameEvent[];
  phases: Phase[];
}

export const inhabitedPlanets = (state: GameState): Planet[] => Object.keys(state.world.planets).sort()
  .map(id => state.world.planets[id]!).filter(planet => planet.ownerId !== null);

export function makeContext(state: GameState, orders: readonly Order[]): TurnContext {
  return {
    state, orders,
    emit: event => state.events.push({ ...event, id: `event:${state.turn}:${state.events.length}`, turn: state.turn }),
    random: (systemId, entityId) => randomFor(state.seed, 'turn', state.turn, systemId, entityId),
  };
}
