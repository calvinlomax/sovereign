import { inhabitedPlanets } from './context.js';
import type { TurnContext } from './context.js';

export function updateConstruction({ state, emit }: TurnContext): void {
  for (const planet of inhabitedPlanets(state)) {
    // Prior turn's manufactured work is available once, in this phase; unused capacity expires.
    let work = planet.lastEconomy?.industrialCapacity ?? 0;
    while (work > 0 && planet.projects.length > 0) {
      const project = planet.projects[0]!;
      const progress = Math.min(work, project.remainingWork);
      project.remainingWork -= progress; work -= progress;
      if (project.remainingWork > 1e-9) break;
      planet.infrastructure[project.facility] += 10;
      planet.projects.shift();
      emit({ type: 'construction', planetId: planet.id, message: `${planet.name} expanded ${project.facility} infrastructure.`, causes: { capacityAdded: 10 } });
    }
  }
}
