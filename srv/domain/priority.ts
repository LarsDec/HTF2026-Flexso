/**
 * Repair ranking for the water keeper. Pure: no @sap/cds, no I/O.
 */
import type { HealthStatus } from './water-health';

/**
 * Order in which statuses are repaired first. Maren: severity always wins, an alarm comes before
 * "needs attention"; people only decide between equal levels. Confirmed by Maren (v11): alarm,
 * then "I don't know", then needs attention, then fine.
 */
export const STATUS_ORDER: readonly HealthStatus[] = ['alarm', 'unknown', 'attention', 'fine'];

/** At most this many repairs fit in one day (Maren). */
export const MAX_REPAIRS_PER_DAY = 2;

/** The secondary loop is always last, even in alarm (Maren). */
export const SECONDARY_LOOP_ID = 'SECONDARY-LOOP';

/** Known number of dependent families per pipe. Only NORTH-BRANCH-02 is known; null = unknown. */
export const KNOWN_DEPENDANTS: Readonly<Record<string, number | null>> = {
  'NORTH-BRANCH-02': 140,
};

/**
 * Tie-break at equal status and equal family count (Maren v12): BAKERY-BRANCH (bread for the whole
 * village) before SOUTH-BRANCH (animals manage half a day). Pipes not listed come after these.
 */
export const IMPACT_ORDER: readonly string[] = ['BAKERY-BRANCH', 'SOUTH-BRANCH'];

/** Why a pipe matters, in words (from the villagers). */
const IMPACT_TEXT: Readonly<Record<string, string>> = {
  'BAKERY-BRANCH': 'bread for the whole village',
  'SOUTH-BRANCH': 'South Meadow Farms animals manage about half a day',
  'NORTH-BRANCH-02': 'about 140 families in North Residential Area',
};

export interface AssessedPipe {
  pipeID: string;
  status: HealthStatus;
}

export interface RankedPipe {
  pipeID: string;
  priorityRank: number;
  priorityReason: string;
  inTodaysPlan: boolean;
  /** 1 or 2 for the pipes in today's plan (their order in the morning list), otherwise null. */
  morningRank: number | null;
}

function statusIndex(status: HealthStatus): number {
  return STATUS_ORDER.indexOf(status);
}

function impactIndex(pipeID: string): number {
  const index = IMPACT_ORDER.indexOf(pipeID);
  return index === -1 ? IMPACT_ORDER.length : index;
}

function dependantsOf(pipeID: string, dependants: Readonly<Record<string, number | null>>): number | null {
  const value = dependants[pipeID];
  return typeof value === 'number' ? value : null;
}

function reasonFor(pipe: AssessedPipe): string {
  if (pipe.status === 'fine') return 'No action needed.';
  const impact = IMPACT_TEXT[pipe.pipeID];
  const base = pipe.pipeID === SECONDARY_LOOP_ID ? 'Secondary loop, always repaired last' : `Status ${pipe.status}`;
  return impact ? `${base}; affects ${impact}.` : `${base}; number of affected families unknown.`;
}

export function rankPipes(
  assessed: readonly AssessedPipe[],
  dependants: Readonly<Record<string, number | null>> = KNOWN_DEPENDANTS,
): RankedPipe[] {
  const sorted = [...assessed].sort((a, b) => {
    const secondary = Number(a.pipeID === SECONDARY_LOOP_ID) - Number(b.pipeID === SECONDARY_LOOP_ID);
    if (secondary !== 0) return secondary;
    const byStatus = statusIndex(a.status) - statusIndex(b.status);
    if (byStatus !== 0) return byStatus;
    const da = dependantsOf(a.pipeID, dependants);
    const db = dependantsOf(b.pipeID, dependants);
    if (da !== db) {
      if (da === null) return 1;
      if (db === null) return -1;
      return db - da;
    }
    const byImpact = impactIndex(a.pipeID) - impactIndex(b.pipeID);
    if (byImpact !== 0) return byImpact;
    // Assumption (not Maren): pipes with no known impact are ordered alphabetically.
    return a.pipeID < b.pipeID ? -1 : a.pipeID > b.pipeID ? 1 : 0;
  });

  let planned = 0;
  return sorted.map((pipe, index) => {
    // Only pipes with a problem (alarm / attention / unknown) are eligible for the plan.
    const inPlan = pipe.status !== 'fine' && planned < MAX_REPAIRS_PER_DAY;
    if (inPlan) planned += 1;
    return {
      pipeID: pipe.pipeID,
      priorityRank: index + 1,
      priorityReason: reasonFor(pipe),
      inTodaysPlan: inPlan,
      morningRank: inPlan ? planned : null,
    };
  });
}
