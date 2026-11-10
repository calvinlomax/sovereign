import { describe, expect, it } from 'vitest';
import { GameEngine, replay } from '../packages/simulation/src/index.js';
import { deserializeGame, exportHistoryCsv, loadGame, serializeGame } from '../packages/persistence/src/index.js';
import { HOME_SYSTEM_ID, HOMEWORLD_ID, expandNode, generateWorld } from '../packages/worldgen/src/index.js';
import { canonicalJson } from '../packages/shared-types/src/index.js';
import type { GameState } from '../packages/shared-types/src/index.js';

type MutableSaveFixture = { format: string; version: number; state: Omit<GameState, 'modelVersion'> & { modelVersion: string } };

describe('persistence and lazy world generation', () => {
  it('resumes identically after save/load and replays from a checkpoint', () => {
    const engine = GameEngine.create({ seed: 'round-trip' });
    engine.advance([{ type: 'research', technologyId: 'efficient-grids' }]); engine.run(9);
    const checkpoint = engine.state;
    const save = serializeGame(checkpoint);
    expect(serializeGame(deserializeGame(save))).toBe(save);
    const restored = loadGame(save);
    engine.run(30); restored.run(30);
    expect(restored.state).toEqual(engine.state);
    expect(replay(checkpoint, engine.state.journal.slice(10))).toEqual(engine.state);
  });

  it('preserves the exact ruleset used by the campaign', () => {
    const state = GameEngine.create({ seed: 'custom-data' }).state;
    state.ruleset.economy.foodYield = 1.9;
    const engine = GameEngine.fromState(state); engine.run(3);
    const loaded = loadGame(serializeGame(engine.state));
    expect(loaded.state.ruleset.economy.foodYield).toBe(1.9);
    loaded.run(3); engine.run(3); expect(loaded.state).toEqual(engine.state);
  });

  it.each([
    (save: MutableSaveFixture) => { save.version = 99; },
    (save: MutableSaveFixture) => { save.state.modelVersion = '99.0.0'; },
    (save: MutableSaveFixture) => { save.state.world.planets[HOMEWORLD_ID]!.stock.food = -1; },
    (save: MutableSaveFixture) => { save.state.world.planets[HOMEWORLD_ID]!.ownerId = 'missing'; },
    (save: MutableSaveFixture) => { save.state.world.nodes[HOME_SYSTEM_ID]!.children = []; },
    (save: MutableSaveFixture) => { save.state.turn = 20; },
  ])('rejects corrupt or incompatible saves', corrupt => {
    const saved = JSON.parse(serializeGame(GameEngine.create({ seed: 'corrupt' }).state)) as MutableSaveFixture;
    corrupt(saved); expect(() => deserializeGame(JSON.stringify(saved))).toThrow(/Invalid or unsupported save/);
  });

  it('rejects malformed JSON and exports a complete CSV history', () => {
    expect(() => deserializeGame('{broken')).toThrow(/Invalid or unsupported save/);
    const engine = GameEngine.create({ seed: 'csv' }); engine.run(5);
    const lines = exportHistoryCsv(engine.state).trim().split('\n');
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe('turn,year,planetId,population,welfare,legitimacy,unrest,inequality,energy,matter,food,output,knowledge');
    expect(lines[6]!.startsWith(`5,2205,${HOMEWORLD_ID},`)).toBe(true);
  });

  it('generates the same addresses regardless of discovery order and does not overwrite inhabited worlds', () => {
    const a = generateWorld('lazy', 'civilization:player');
    const b = generateWorld('lazy', 'civilization:player');
    const regionId = a.nodes[HOME_SYSTEM_ID]!.parentId!;
    expandNode(a, 'lazy', regionId); expandNode(b, 'lazy', regionId);
    const otherSystems = a.nodes[regionId]!.children.filter(id => id !== HOME_SYSTEM_ID);
    for (const id of otherSystems) expandNode(a, 'lazy', id);
    for (const id of [...otherSystems].reverse()) expandNode(b, 'lazy', id);
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    const home = structuredClone(a.planets[HOMEWORLD_ID]);
    expect(expandNode(a, 'lazy', HOME_SYSTEM_ID)).toEqual([]);
    expect(a.planets[HOMEWORLD_ID]).toEqual(home);
    expect(canonicalJson(generateWorld('other-seed', 'civilization:player'))).not.toBe(canonicalJson(generateWorld('lazy', 'civilization:player')));
  });

  it('surveys known nodes through validated orders and records discoveries', () => {
    const engine = GameEngine.create({ seed: 'survey' });
    const region = engine.state.world.nodes[HOME_SYSTEM_ID]!.parentId!;
    engine.advance([{ type: 'explore', nodeId: region }]);
    const target = engine.state.world.nodes[region]!.children.find(id => id !== HOME_SYSTEM_ID)!;
    engine.advance([{ type: 'explore', nodeId: target }]);
    expect(Object.keys(engine.state.world.planets).length).toBeGreaterThan(5);
    expect(engine.state.events.filter(e => e.type === 'exploration')).toHaveLength(2);
  });
});
