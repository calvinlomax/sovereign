import { gameStateSchema, nodeKinds, phases } from './schema.js';
import type { GameState } from './schema.js';

export class StateValidationError extends Error {
  override name = 'StateValidationError';
}

/** Runtime shape validation plus the cross-entity invariants JSON schemas cannot express. */
export function validateState(input: unknown): GameState {
  const parsed = gameStateSchema.safeParse(input);
  if (!parsed.success) throw new StateValidationError(parsed.error.message);
  const state = parsed.data;
  const check = (condition: unknown, message: string): void => {
    if (!condition) throw new StateValidationError(message);
  };
  const unique = (values: string[], label: string): void => check(new Set(values).size === values.length, `Duplicate ${label}`);
  const { nodes, planets } = state.world;
  check(state.civilizations[state.playerCivilizationId], 'Player civilization is missing');
  const roots = Object.values(nodes).filter(n => n.parentId === null);
  check(roots.length === 1 && roots[0]?.kind === 'multiverse', 'World must have one multiverse root');
  for (const [id, node] of Object.entries(nodes)) {
    check(id === node.id, `Node key mismatch: ${id}`);
    unique(node.children, `children in ${id}`);
    if (node.parentId !== null) {
      const parent = nodes[node.parentId];
      check(parent?.children.includes(id), `Missing parent link: ${id}`);
      check(parent && nodeKinds.indexOf(node.kind) === nodeKinds.indexOf(parent.kind) + 1, `Invalid hierarchy: ${id}`);
    }
    for (const childId of node.children) check(nodes[childId]?.parentId === id, `Missing child link: ${childId}`);
    if (node.kind === 'planet') check(planets[id] && node.children.length === 0 && node.expanded, `Invalid planet node: ${id}`);
  }
  for (const [id, planet] of Object.entries(planets)) {
    check(id === planet.id && planet.nodeId === id && nodes[id]?.kind === 'planet', `Invalid planet link: ${id}`);
    unique(planet.cohorts.map(c => c.id), `cohort in ${id}`);
    unique(planet.projects.map(p => p.id), `project in ${id}`);
    if (planet.ownerId !== null) check(state.civilizations[planet.ownerId]?.planetIds.includes(id), `Invalid planet owner: ${id}`);
    else check(planet.cohorts.length === 0 && planet.projects.length === 0, `Unowned world has population or projects: ${id}`);
    if (planet.lastEconomy) {
      for (const resource of ['energy', 'matter', 'food'] as const) {
        const ledger = planet.lastEconomy;
        const expected = ledger.opening[resource] + ledger.produced[resource] - ledger.consumed[resource];
        check(Math.abs(expected - ledger.closing[resource]) < 1e-7 * Math.max(1, expected), `Unbalanced ${resource} ledger: ${id}`);
      }
    }
  }
  const technologies = new Map(state.ruleset.technologies.map(t => [t.id, t]));
  for (const [id, civ] of Object.entries(state.civilizations)) {
    check(civ.id === id, `Civilization key mismatch: ${id}`);
    unique(civ.planetIds, `territory in ${id}`);
    check(civ.planetIds.includes(civ.homeworldId), `Homeworld outside territory: ${id}`);
    for (const planetId of civ.planetIds) check(planets[planetId]?.ownerId === id, `Invalid territory: ${planetId}`);
    unique(civ.research.completed, `completed research in ${id}`);
    for (const techId of civ.research.completed) {
      const tech = technologies.get(techId);
      check(tech && tech.prerequisites.every(p => civ.research.completed.includes(p)), `Invalid completed technology: ${techId}`);
    }
    if (civ.research.focus !== null) {
      const tech = technologies.get(civ.research.focus);
      check(tech && !civ.research.completed.includes(tech.id) && tech.prerequisites.every(p => civ.research.completed.includes(p)), 'Invalid research focus');
    }
  }
  unique(state.systems.map(s => s.id), 'system ID');
  let lastPhase = -1;
  for (const system of state.systems) {
    check(phases.indexOf(system.phase) >= lastPhase, 'System phases are out of order');
    lastPhase = phases.indexOf(system.phase);
  }
  check(state.history.length === state.turn + 1 && state.journal.length === state.turn, 'Missing turn history or journal');
  state.history.forEach((row, turn) => {
    check(row.turn === turn && row.year === state.clock.startYear + turn, 'Invalid history chronology');
    for (const id of Object.keys(row.planets)) check(planets[id], `History references unknown planet: ${id}`);
  });
  state.journal.forEach((row, index) => check(row.turn === index + 1, 'Invalid journal chronology'));
  unique(state.events.map(e => e.id), 'event ID');
  let lastTurn = 0;
  for (const event of state.events) {
    check(event.turn >= lastTurn && event.turn <= state.turn, 'Invalid event chronology');
    check(event.planetId === null || planets[event.planetId], 'Event references unknown planet');
    lastTurn = event.turn;
  }
  return state;
}
