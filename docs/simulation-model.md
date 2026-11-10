# Planetary model v0.1.0

This is the formal initial model for the first engine increment. The coefficients are explicit, provisional game rules. The model is intended to produce understandable tradeoffs, not forecast real societies or prove one institutional arrangement best.

## State and units

One turn is one year. Population is measured in millions; Haven begins with 1,000 million people across workers, specialists, and capital owners. These are aggregate cohorts with fixed initial wealth weights and political preferences, not individual agents. Education, satisfaction, habitat quality, and social indicators are normalized to `[0, 1]`.

Energy, matter, and food are abstract stock units that persist between turns. Knowledge is a civilization stock spent on research. Labor, industrial work, service provision, and computation are flows/capacities, not endlessly accumulating resources. Infrastructure caps sector work. A completed construction project adds 10 capacity units to one facility.

The starting scenario represents the design's Type I civilization narratively; this prototype does not yet calculate Kardashev energy in watts. Neighbor planets have seeded habitat, fertility, minerals, and energy potential. Haven's habitat and production potential are constrained to support a viable opening for every seed.

## Labor and coordination

Let `P` be population and `E` population-weighted education. Available effective human labor is:

```text
labor = P × laborParticipation × (0.5 + 0.5 × E) × (1 − coordinationCost)

deliberation = participation × 0.16 × (1 − 0.5 × E)
localCoordination = (1 − centralization) × 0.10
mismatch = population-weighted |autonomyPreference − (1 − centralization)|
informationLoad = centralization × (0.12 × mismatch + 0.025 × (territoryCount − 1))
coordinationCost = clamp(deliberation + localCoordination + informationLoad, 0, 0.6)
```

This models deliberation time, decentralized coordination, and central information burden. It does not grant a blanket production bonus to an ideology. The territory component prepares for later multi-world states, but there is no colonization order yet.

The six sector allocations must sum to 1 within floating-point tolerance. They allocate labor to power, mining, agriculture, industry, research, and services. A sector's work is capped by its infrastructure. Changing allocation can cause shortages or stall construction/research.

## Production sequence and accounting

1. Produce power from human labor, energy infrastructure, and planetary energy potential.
2. Satisfy household power demand first.
3. Power computing capacity, consuming `0.2` energy per compute unit.
4. Allocate computation to administration, then automation, then research.
5. Add supported automation to non-power sector labor.
6. Share remaining power proportionally across sector workloads.
7. Produce matter and food; consume matter for industrial work.
8. Produce knowledge and deploy public services.
9. Allocate and consume food.

```text
administrationDemand = P × (0.015 + centralization × territoryCount × 0.008 + transparency × 0.006)
automationDemand = labor × automation × 0.1
automationUsed = automation × min(1, remainingComputation / automationDemand)
effectiveNonPowerLabor = labor × (1 + automationUsed × automationLabor)

foodProduced = poweredAgriculturalWork × foodYield × fertility
matterProduced = poweredMiningWork × miningYield × minerals
industrialWork = min(poweredIndustrialWork, availableMatter / matterPerIndustry)
researchSupport = min(1, remainingComputation / (poweredResearchWork × 0.2))
knowledgeProduced = poweredResearchWork × researchSupport × knowledgeYield × E
serviceCoverage = clamp(poweredServiceWork × publicServices / (P × serviceDemand))
```

Zero denominators have explicit zero-output behavior. Automation cannot create its own initial power, and no population means no production. Industry and research may waste allocated energy when their matter or computation inputs are insufficient. This ordering is a visible assumption, not an optimal economic planner.

For each stored resource the ledger satisfies:

```text
closing = opening + produced − consumed
```

Ledger `opening` is measured after order costs and before the economy phase. Construction costs are visible in accepted orders and deducted once; they are not double-counted in the economy ledger. `unmetEnergy` and `unmetFood` expose shortfalls. `output` in observations is a simple sum of physical production units for prototype comparisons, not GDP or a claim that energy and food have equal economic value.

## Food distribution and institutions

Food demand is population times the ruleset's per-person requirement. Available food is capped at total need. The `redistribution` fraction of the available pool is distributed equally per person. The remainder follows cohort population multiplied by its `wealthWeight`, with saturated cohorts removed and surplus redistributed until supply is exhausted or all needs are met. Thus no cohort receives more than its demand and no food is created by policy.

With abundant food, all cohorts can meet their needs. Under scarcity, redistribution changes which cohorts face deprivation. Wealth weights are fixed in this increment; property ownership, wages, prices, taxation, investment, and wealth accumulation remain future models.

`publicServices` is the fraction of service-sector work deployed for universal services. It uses labor and power already committed to that sector. It is not a tax rate or a free healthcare bonus. Low public deployment leaves service capacity idle; private service markets are not modeled yet. Consequently this parameter by itself is monotonic for welfare in v0.1. The engine does not yet satisfy the full design's goal of meaningful competing economic organizations.

`participation` and `centralization` affect both coordination and cohort preference fit. `transparency` increases administration demand but supports trust when administration has enough computation. `automation` competes for computation with research. Six templates are starting parameter combinations, not mechanically special regime types. Use overrides or full custom institution objects to test particular dimensions.

## Population and society

For each cohort, given current food access `F`, service coverage `H`, and habitability `B`:

```text
birthRate = configuredBirthRate × F × B × (0.7 + 0.3 × H)
deathRate = configuredDeathRate × (1 − 0.25 × H) + shortageMortality × (1 − F)
nextPopulation = max(0, population × (1 + birthRate − deathRate))
nextEducation = clamp(education + H × 0.015 × (1 − education) − (1 − F) × 0.01)
```

Cohorts remain fractional aggregates. There are no aging, inter-cohort mobility, species, migration, or household processes yet. Population change happens after consumption, so new births start consuming next turn.

Welfare is `0.65 × meanFoodAccess + 0.25 × serviceCoverage + 0.10 × habitability`. Inequality is the population-weighted Gini coefficient of food access, not wealth inequality. Education is cohort-weighted.

```text
voiceFit = 1 − |participationPreference − participation|
autonomyFit = 1 − |autonomyPreference − (1 − centralization)|
trust = transparency × administrativeCapacity
targetSatisfaction = 0.40 × foodAccess + 0.15 × serviceCoverage
                   + 0.20 × voiceFit + 0.15 × autonomyFit + 0.10 × trust
satisfaction = 0.75 × previousSatisfaction + 0.25 × targetSatisfaction
legitimacy = 0.80 × previousLegitimacy + 0.20 × meanSatisfaction
unrest = 0.75 × previousUnrest
       + 0.25 × (0.65 × (1 − meanSatisfaction) + 0.35 × meanFoodShortage)
```

These smoothing terms encode institutional memory. Politics currently records consequences but does not yet feed unrest back into strikes, rebellion, or faction behavior. Empty populations have zero welfare, legitimacy, and unrest, and never regenerate spontaneously.

## Construction, research, and events

Construction charges configured energy and matter when the order is accepted. Projects consume the previous turn's industrial work FIFO in the transportation phase. Unused work expires; it cannot be banked. There is no prior work at turn zero, so the earliest project completes on turn two. Queue length is limited to 20 per planet. Cancellation/refunds, maintenance, and technology-gated structures are deferred.

Technology definitions contain costs, prerequisites, and a specific physical yield or computing effect. Prerequisite references and cycles are validated. Knowledge accumulates even with no focus. A focus completes when sufficient knowledge exists, spends its cost once, and clears itself. Surplus knowledge remains. Effects enter production on the next turn; there is no automatic research selection.

Events announce entry into shortage (over 10% unmet food), unrest (over 0.45), collapse (under one million people), or recovery. Collapse takes precedence over shortage, which takes precedence over unrest. The crisis state prevents repeating the same alert every turn. Effects arise from the simulation, so events do not apply a second arbitrary penalty. Construction, reforms, exploration, and discoveries also create persistent events.

## Comparisons and validation

`compareBranches` clones one validated state, applies each branch's orders on the first simulated turn, then advances both for the same number of turns. Results include the baseline, complete branch states, and final treatment-minus-control metrics. Identical address-based random streams provide matched external conditions if stochastic systems are added. A one-run model comparison is not statistical confidence, real-world causal evidence, or proof of a universally optimal policy.

Tests cover deterministic seeds and replay, immutable boundaries, whole-turn rollback, schema errors, ownership, prerequisite checks, accounting identities, limited food allocation, resource deprivation, construction timing, research spending/effects, branch divergence, save continuation, corruption rejection, exploration order, and multi-seed 200-turn runs.
