import { inhabitedPlanets } from '../context.js';
import type { TurnContext } from '../context.js';

export function updateResearch({ state, emit }: TurnContext): void {
  for (const planet of inhabitedPlanets(state)) {
    state.civilizations[planet.ownerId!]!.research.knowledge += planet.lastEconomy?.knowledge ?? 0;
  }
  for (const id of Object.keys(state.civilizations).sort()) {
    const civ = state.civilizations[id]!;
    const tech = state.ruleset.technologies.find(t => t.id === civ.research.focus);
    if (!tech || civ.research.knowledge < tech.cost) continue;
    civ.research.knowledge -= tech.cost;
    civ.research.completed.push(tech.id);
    civ.research.completed.sort();
    civ.research.focus = null;
    emit({ type: 'research', planetId: null, message: `${civ.name} completed ${tech.name}.`, causes: { knowledgeSpent: tech.cost } });
  }
}
