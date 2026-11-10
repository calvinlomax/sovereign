import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { GameEngine, observe } from '../../../packages/simulation/src/index.js';
import { compareBranches } from '../../../packages/experiments/src/index.js';
import { exportHistoryCsv, loadGame, serializeGame } from '../../../packages/persistence/src/index.js';
import { createInstitutions } from '../../../packages/social-systems/src/index.js';

function main(): void {
  const { values } = parseArgs({ options: {
    seed: { type: 'string', default: 'sovereign-first-light' }, turns: { type: 'string', default: '20' },
    save: { type: 'string' }, load: { type: 'string' }, csv: { type: 'string' }, compare: { type: 'boolean' },
  } });
  const turns = Number(values.turns);
  if (!Number.isSafeInteger(turns) || turns < 0 || turns > 10000) throw new Error('--turns must be a whole number between 0 and 10000');
  const engine = values.load ? loadGame(readFileSync(values.load, 'utf8')) : GameEngine.create({ seed: values.seed });
  const initial = engine.state;
  const homeId = initial.civilizations[initial.playerCivilizationId]!.homeworldId;
  if (!values.load && turns > 0) {
    engine.advance([{ type: 'research', technologyId: 'efficient-grids' }, { type: 'construct', planetId: homeId, facility: 'computation' }]);
    engine.run(turns - 1);
  } else engine.run(turns);
  const state = engine.state;
  const metrics = observe(state).civilization;
  console.log(`SOVEREIGN: BEYOND THE STARS | seed ${state.seed}`);
  console.log(`Turn ${state.turn} | year ${state.clock.startYear + state.turn} | ${Object.keys(state.world.planets).length} discovered planets`);
  console.table(Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, Number(value.toFixed(3))])));
  for (const event of state.events.slice(-8)) console.log(`[${event.turn}] ${event.message}`);
  if (values.compare) {
    const comparison = compareBranches(initial, { turns: Math.max(1, turns), treatmentOrders: [
      { type: 'reform', planetId: homeId, institutions: createInstitutions('algorithmicTechnocracy') },
    ] });
    console.log('Technocracy minus unchanged institutions, from identical starting conditions:');
    console.table(Object.fromEntries(Object.entries(comparison.difference).map(([key, value]) => [key, Number(value.toFixed(3))])));
  }
  if (values.save) { writeFileSync(values.save, serializeGame(state)); console.log(`Saved ${values.save}`); }
  if (values.csv) { writeFileSync(values.csv, exportHistoryCsv(state)); console.log(`Exported ${values.csv}`); }
}

try { main(); } catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
