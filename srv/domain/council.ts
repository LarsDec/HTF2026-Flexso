/**
 * The council page for Rowan: what hurts in Oakhaven, biggest first. Pure: no @sap/cds, no clock, no I/O.
 *
 * It only combines rules that already exist (water status and Maren's priority, Tobin's comfort levels,
 * source conflicts) and defines no thresholds of its own. See docs/COUNCIL-DESIGN.md.
 * The backend returns codes and raw values; the UI builds every sentence from i18n.
 */
import { toNumber, type NumericInput } from './numbers';
import { KNOWN_DEPENDANTS, SECONDARY_LOOP_ID } from './priority';
import { flagSourceConflict } from './source-conflict';
import { healthIcon, healthState, type HealthStatus } from './water-health';
import { comfortLevel } from './food-comfort';

export type MarkEntity = 'WaterPipes' | 'Sensors' | 'Repairs' | 'Landmarks' | 'StockItems';

export interface CouncilPipe {
  ID: string;
  pipeID: string;
  status: HealthStatus;
  priorityRank: number;
  currentFlowRate: NumericInput;
  nominalFlowRate: NumericInput;
  currentPressure: NumericInput;
  readingAgeMinutes: number | null;
  sensors: readonly { ID: string; sensorID: string; flowRate: NumericInput }[];
  repairs: readonly { ID: string; issue: string | null }[];
}

/** Straight from a food ReorderLine. */
export interface CouncilItem {
  ID: string;
  name: string;
  unit: string;
  currentQuantity: string;
  minStockLevel: string;
  isCritical: boolean;
  supplierName: string | null;
  dataError: boolean;
}

export interface CouncilLandmark {
  ID: string;
  name: string;
  suppliedBy: string | null;
}

/** "Not to be trusted" mark by Ilse. */
export interface TrustMark {
  entityName: MarkEntity;
  recordID: string;
  reason: string;
  markedBy: string;
  markedAt: string | null;
}

export interface CouncilInput {
  readonly pipes: readonly CouncilPipe[];
  readonly items: readonly CouncilItem[];
  readonly landmarks: readonly CouncilLandmark[];
  readonly marks: readonly TrustMark[];
}

export type CouncilLevel = 'waterAlarm' | 'foodPanic' | 'foodNervous' | 'waterUnknown' | 'waterAttention';

/** Worst first. Rowan Q3 generalised (A7); where "I don't know" goes is our assumption (A11). */
export const COUNCIL_LEVEL_ORDER: readonly CouncilLevel[] = [
  'waterAlarm',
  'foodPanic',
  'foodNervous',
  'waterUnknown',
  'waterAttention',
];

export type PeopleKind = 'families' | 'wholeVillage' | 'unknown' | 'nobody';
export type TrustNote = 'sensorNotTrusted' | 'sensorsDisagree';
export type UntrustedSource = 'mark' | 'impossibleStock' | 'sourceConflict';
export type UntrustedKind = 'stockItem' | 'pipe' | 'sensor' | 'repair' | 'landmark';
export type UntrustedEffect =
  | 'notRanked'
  | 'pipeRankedOnOwnReading'
  | 'notUsedOnPage'
  | 'notUsedForPlacesAndTies'
  | 'recordNotFound';

export interface CouncilProblem {
  ID: string;
  rank: number;
  area: 'water' | 'food';
  subject: string;
  level: CouncilLevel;
  levelState: 'Error' | 'Warning' | 'Success' | 'None';
  levelIcon: string;
  flowRate: number | null;
  nominalFlowRate: number | null;
  /** Display only. */
  flowPercent: number | null;
  pressure: number | null;
  readingAgeMinutes: number | null;
  quantity: number | null;
  minimum: number | null;
  unit: string | null;
  peopleKind: PeopleKind;
  peopleCount: number | null;
  places: string | null;
  pipeNote: 'bakeryBread' | 'farmAnimalsHalfDay' | null;
  tiedTo: string | null;
  tiedToUntrusted: string | null;
  tieVia: string | null;
  trustNote: TrustNote | null;
  trustNoteSubject: string | null;
  lastOnList: boolean;
}

export interface UntrustedLine {
  ID: string;
  lineKind: UntrustedKind;
  subject: string;
  parentSubject: string | null;
  source: UntrustedSource;
  recordedValue: number | null;
  recordedUnit: string | null;
  /** Nominal flow for flow conflicts. */
  comparedTo: number | null;
  reason: string | null;
  markedBy: string | null;
  markedAt: string | null;
  effect: UntrustedEffect;
}

export interface CouncilSummary {
  pipesTotal: number;
  pipesAlarm: number;
  pipesUnknown: number;
  pipesAttention: number;
  pipesFine: number;
  pipesNotCounted: number;
  waterFineNames: string;
  itemsTotal: number;
  itemsPanic: number;
  itemsNervous: number;
  itemsFine: number;
  itemsNotCounted: number;
  foodFineNames: string;
  untrustedCount: number;
}

export interface CouncilPage {
  problems: CouncilProblem[];
  untrusted: UntrustedLine[];
  summary: CouncilSummary;
}

const KIND_OF_ENTITY: Readonly<Record<MarkEntity, UntrustedKind>> = {
  StockItems: 'stockItem',
  WaterPipes: 'pipe',
  Sensors: 'sensor',
  Repairs: 'repair',
  Landmarks: 'landmark',
};
const KIND_ORDER: readonly UntrustedKind[] = ['stockItem', 'pipe', 'sensor', 'repair', 'landmark'];
const PIPE_NOTES: Readonly<Record<string, CouncilProblem['pipeNote']>> = {
  'BAKERY-BRANCH': 'bakeryBread',
  'SOUTH-BRANCH': 'farmAnimalsHalfDay',
};

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const joinNames = (names: Iterable<string>): string | null => {
  const list = [...new Set(names)].sort(byText);
  return list.length > 0 ? list.join(', ') : null;
};

interface PipeCtx {
  pipe: CouncilPipe;
  marked: boolean;
}
interface ItemCtx {
  item: CouncilItem;
  level: ReturnType<typeof comfortLevel>;
  untrusted: boolean;
}

export function buildCouncilPage(input: CouncilInput): CouncilPage {
  const markOf = new Map<string, TrustMark>();
  for (const mark of input.marks) {
    const key = `${mark.entityName}:${mark.recordID}`;
    if (!markOf.has(key)) markOf.set(key, mark);
  }
  const marked = (entity: MarkEntity, id: string): TrustMark | undefined => markOf.get(`${entity}:${id}`);

  // ---- untrusted lines ------------------------------------------------------------------
  const untrusted: UntrustedLine[] = [];
  const found = new Set<string>(); // keys of marks whose record exists
  const trustNotes = new Map<string, { note: TrustNote; subject: string }>(); // by pipe ID

  const line = (
    entity: MarkEntity,
    id: string,
    mark: TrustMark | undefined,
    auto: UntrustedSource,
    fields: Pick<UntrustedLine, 'subject' | 'parentSubject' | 'recordedValue' | 'recordedUnit' | 'comparedTo' | 'effect'>,
  ): void => {
    untrusted.push({
      ID: `${entity}:${id}`,
      lineKind: KIND_OF_ENTITY[entity],
      source: mark ? 'mark' : auto,
      reason: mark?.reason ?? null,
      markedBy: mark?.markedBy ?? null,
      markedAt: mark?.markedAt ?? null,
      ...fields,
    });
    if (mark) found.add(`${entity}:${id}`);
  };

  const itemCtx: ItemCtx[] = [];
  for (const item of input.items) {
    const mark = marked('StockItems', item.ID);
    const isUntrusted = mark !== undefined || item.dataError;
    if (isUntrusted) {
      line('StockItems', item.ID, mark, 'impossibleStock', {
        subject: item.name,
        parentSubject: null,
        recordedValue: toNumber(item.currentQuantity),
        recordedUnit: item.unit,
        comparedTo: null,
        effect: 'notRanked',
      });
    }
    itemCtx.push({
      item,
      level: isUntrusted ? 'fine' : comfortLevel(item.currentQuantity, item.minStockLevel),
      untrusted: isUntrusted,
    });
  }

  const pipeCtx: PipeCtx[] = [];
  for (const pipe of input.pipes) {
    const mark = marked('WaterPipes', pipe.ID);
    pipeCtx.push({ pipe, marked: mark !== undefined });
    if (mark) {
      line('WaterPipes', pipe.ID, mark, 'mark', {
        subject: pipe.pipeID,
        parentSubject: null,
        recordedValue: toNumber(pipe.currentFlowRate),
        recordedUnit: 'L/min',
        comparedTo: toNumber(pipe.nominalFlowRate),
        effect: 'notRanked',
      });
    }
    let note: { note: TrustNote; subject: string } | undefined;
    for (const sensor of pipe.sensors) {
      const sensorMark = marked('Sensors', sensor.ID);
      const conflict = flagSourceConflict(pipe.nominalFlowRate, [sensor.flowRate]);
      if (!sensorMark && !conflict) continue;
      line('Sensors', sensor.ID, sensorMark, 'sourceConflict', {
        subject: sensor.sensorID,
        parentSubject: pipe.pipeID,
        recordedValue: toNumber(sensor.flowRate),
        recordedUnit: 'L/min',
        comparedTo: toNumber(pipe.nominalFlowRate),
        effect: 'pipeRankedOnOwnReading',
      });
      if (sensorMark && note?.note !== 'sensorNotTrusted') note = { note: 'sensorNotTrusted', subject: sensor.sensorID };
      else if (!note) note = { note: 'sensorsDisagree', subject: sensor.sensorID };
    }
    if (note) trustNotes.set(pipe.ID, note);
    for (const repair of pipe.repairs) {
      const repairMark = marked('Repairs', repair.ID);
      if (!repairMark) continue;
      line('Repairs', repair.ID, repairMark, 'mark', {
        subject: repair.issue ?? repair.ID,
        parentSubject: pipe.pipeID,
        recordedValue: null,
        recordedUnit: null,
        comparedTo: null,
        effect: 'notUsedOnPage',
      });
    }
  }

  const trustedLandmarks: CouncilLandmark[] = [];
  for (const landmark of input.landmarks) {
    const mark = marked('Landmarks', landmark.ID);
    if (!mark) {
      trustedLandmarks.push(landmark);
      continue;
    }
    line('Landmarks', landmark.ID, mark, 'mark', {
      subject: landmark.name,
      parentSubject: null,
      recordedValue: null,
      recordedUnit: null,
      comparedTo: null,
      effect: 'notUsedForPlacesAndTies',
    });
  }

  // Marks whose record no longer exists are listed, never dropped.
  for (const mark of input.marks) {
    const key = `${mark.entityName}:${mark.recordID}`;
    if (found.has(key) || markOf.get(key) !== mark) continue;
    found.add(key);
    untrusted.push({
      ID: key,
      lineKind: KIND_OF_ENTITY[mark.entityName],
      subject: mark.recordID,
      parentSubject: null,
      source: 'mark',
      recordedValue: null,
      recordedUnit: null,
      comparedTo: null,
      reason: mark.reason,
      markedBy: mark.markedBy,
      markedAt: mark.markedAt,
      effect: 'recordNotFound',
    });
  }
  untrusted.sort(
    (a, b) => KIND_ORDER.indexOf(a.lineKind) - KIND_ORDER.indexOf(b.lineKind) || byText(a.subject, b.subject),
  );

  // ---- ties between water and food (Q5, A9, A17) ------------------------------------------
  const landmarksOfPipe = new Map<string, CouncilLandmark[]>();
  for (const landmark of trustedLandmarks) {
    if (!landmark.suppliedBy) continue;
    const list = landmarksOfPipe.get(landmark.suppliedBy) ?? [];
    list.push(landmark);
    landmarksOfPipe.set(landmark.suppliedBy, list);
  }
  const isPipeOnPage = (c: PipeCtx): boolean => c.marked || c.pipe.status !== 'fine';
  const isItemOnPage = (c: ItemCtx): boolean => c.untrusted || c.level !== 'fine';

  interface Tie {
    pipe: PipeCtx;
    item: ItemCtx;
    via: string;
  }
  const ties: Tie[] = [];
  for (const pc of pipeCtx.filter(isPipeOnPage)) {
    for (const landmark of landmarksOfPipe.get(pc.pipe.pipeID) ?? []) {
      for (const ic of itemCtx) {
        if (isItemOnPage(ic) && ic.item.supplierName === landmark.name) ties.push({ pipe: pc, item: ic, via: landmark.name });
      }
    }
  }
  const tieFor = (
    mine: (t: Tie) => boolean,
    other: (t: Tie) => { name: string; untrusted: boolean },
  ): Pick<CouncilProblem, 'tiedTo' | 'tiedToUntrusted' | 'tieVia'> => {
    const own = ties.filter(mine);
    return {
      tiedTo: joinNames(own.map(other).filter((o) => !o.untrusted).map((o) => o.name)),
      tiedToUntrusted: joinNames(own.map(other).filter((o) => o.untrusted).map((o) => o.name)),
      tieVia: joinNames(own.map((t) => t.via)),
    };
  };

  // ---- problems ---------------------------------------------------------------------------
  interface Entry {
    problem: Omit<CouncilProblem, 'rank'>;
    order: number;
    critical: boolean;
    priorityRank: number;
  }
  const entries: Entry[] = [];

  for (const pc of pipeCtx) {
    const { pipe } = pc;
    if (pc.marked || pipe.status === 'fine') continue;
    const level: CouncilLevel =
      pipe.status === 'alarm' ? 'waterAlarm' : pipe.status === 'unknown' ? 'waterUnknown' : 'waterAttention';
    const dependants = KNOWN_DEPENDANTS[pipe.pipeID];
    const isSecondary = pipe.pipeID === SECONDARY_LOOP_ID;
    const flow = toNumber(pipe.currentFlowRate);
    const nominal = toNumber(pipe.nominalFlowRate);
    const trust = trustNotes.get(pipe.ID);
    entries.push({
      problem: {
        ID: `water:${pipe.ID}`,
        area: 'water',
        subject: pipe.pipeID,
        level,
        levelState: healthState(pipe.status),
        levelIcon: healthIcon(pipe.status),
        flowRate: flow,
        nominalFlowRate: nominal,
        flowPercent: flow !== null && nominal !== null && nominal > 0 ? Math.round((flow / nominal) * 100) : null,
        pressure: toNumber(pipe.currentPressure),
        readingAgeMinutes: pipe.readingAgeMinutes,
        quantity: null,
        minimum: null,
        unit: null,
        peopleKind: isSecondary ? 'nobody' : typeof dependants === 'number' ? 'families' : 'unknown',
        peopleCount: !isSecondary && typeof dependants === 'number' ? dependants : null,
        places: joinNames((landmarksOfPipe.get(pipe.pipeID) ?? []).map((l) => l.name)),
        pipeNote: PIPE_NOTES[pipe.pipeID] ?? null,
        ...tieFor((t) => t.pipe === pc, (t) => ({ name: t.item.item.name, untrusted: t.item.untrusted })),
        trustNote: trust?.note ?? null,
        trustNoteSubject: trust?.subject ?? null,
        lastOnList: isSecondary,
      },
      order: COUNCIL_LEVEL_ORDER.indexOf(level),
      critical: false,
      priorityRank: pipe.priorityRank,
    });
  }

  for (const ic of itemCtx) {
    if (ic.untrusted || ic.level === 'fine') continue;
    const { item } = ic;
    const level: CouncilLevel = ic.level === 'panic' ? 'foodPanic' : 'foodNervous';
    entries.push({
      problem: {
        ID: `food:${item.ID}`,
        area: 'food',
        subject: item.name,
        level,
        levelState: level === 'foodPanic' ? 'Error' : 'Warning',
        levelIcon: level === 'foodPanic' ? 'sap-icon://alert' : 'sap-icon://warning',
        flowRate: null,
        nominalFlowRate: null,
        flowPercent: null,
        pressure: null,
        readingAgeMinutes: null,
        quantity: toNumber(item.currentQuantity),
        minimum: toNumber(item.minStockLevel),
        unit: item.unit,
        peopleKind: 'wholeVillage',
        peopleCount: null,
        places: null,
        pipeNote: null,
        ...tieFor((t) => t.item === ic, (t) => ({ name: t.pipe.pipe.pipeID, untrusted: t.pipe.marked })),
        trustNote: null,
        trustNoteSubject: null,
        lastOnList: false,
      },
      order: COUNCIL_LEVEL_ORDER.indexOf(level),
      critical: item.isCritical,
      priorityRank: 0,
    });
  }

  entries.sort(
    (a, b) =>
      Number(a.problem.lastOnList) - Number(b.problem.lastOnList) ||
      a.order - b.order ||
      (a.problem.area === 'water'
        ? a.priorityRank - b.priorityRank
        : Number(b.critical) - Number(a.critical) || byText(a.problem.subject, b.problem.subject)),
  );
  const problems = entries.map((e, index) => ({ ...e.problem, rank: index + 1 }));

  // ---- summary ----------------------------------------------------------------------------
  const trustedPipes = pipeCtx.filter((c) => !c.marked).map((c) => c.pipe);
  const countPipes = (status: HealthStatus): number => trustedPipes.filter((p) => p.status === status).length;
  const trustedItems = itemCtx.filter((c) => !c.untrusted);
  const countItems = (level: ItemCtx['level']): number => trustedItems.filter((c) => c.level === level).length;
  const summary: CouncilSummary = {
    pipesTotal: input.pipes.length,
    pipesAlarm: countPipes('alarm'),
    pipesUnknown: countPipes('unknown'),
    pipesAttention: countPipes('attention'),
    pipesFine: countPipes('fine'),
    pipesNotCounted: pipeCtx.length - trustedPipes.length,
    waterFineNames: [...trustedPipes.filter((p) => p.status === 'fine').map((p) => p.pipeID)].sort(byText).join(', '),
    itemsTotal: input.items.length,
    itemsPanic: countItems('panic'),
    itemsNervous: countItems('nervous'),
    itemsFine: countItems('fine'),
    itemsNotCounted: itemCtx.length - trustedItems.length,
    foodFineNames: trustedItems.filter((c) => c.level === 'fine').map((c) => c.item.name).sort(byText).join(', '),
    untrustedCount: untrusted.length,
  };

  return { problems, untrusted, summary };
}
