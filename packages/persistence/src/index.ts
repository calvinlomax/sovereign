import { z } from 'zod';
import { canonicalJson, validateState } from '../../shared-types/src/index.js';
import type { GameState } from '../../shared-types/src/index.js';
import { GameEngine } from '../../simulation/src/index.js';
import type { SimulationSystem } from '../../simulation/src/index.js';

const saveSchema = z.object({ format: z.literal('sovereign-save'), version: z.literal(1), state: z.unknown() }).strict();

export class SaveValidationError extends Error {
  override name = 'SaveValidationError';
}

/** Storage-neutral JSON. File system and IndexedDB adapters belong outside the engine. */
export function serializeGame(state: GameState): string {
  return canonicalJson({ format: 'sovereign-save', version: 1, state: validateState(state) });
}

export function deserializeGame(json: string): GameState {
  try {
    const envelope = saveSchema.parse(JSON.parse(json) as unknown);
    return validateState(envelope.state);
  } catch (error) {
    throw new SaveValidationError(`Invalid or unsupported save: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function loadGame(json: string, extensions: readonly SimulationSystem[] = []): GameEngine {
  return GameEngine.fromState(deserializeGame(json), extensions);
}

export function exportHistoryCsv(state: GameState): string {
  const validated = validateState(state);
  const fields = ['population', 'welfare', 'legitimacy', 'unrest', 'inequality', 'energy', 'matter', 'food', 'output', 'knowledge'] as const;
  const rows = [['turn', 'year', 'planetId', ...fields].join(',')];
  for (const observation of validated.history) {
    for (const id of Object.keys(observation.planets).sort()) {
      const metrics = observation.planets[id]!;
      rows.push([observation.turn, observation.year, id, ...fields.map(key => metrics[key])].join(','));
    }
  }
  return `${rows.join('\n')}\n`;
}
