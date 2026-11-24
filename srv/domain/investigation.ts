/**
 * Detection rules of the investigation app (Ilse's answers, see docs/INVESTIGATION-REQUIREMENTS.md).
 * Pure functions: no database, no clock, no `cds`. The handler reads the rows and calls these.
 * Does not decide which source is right; it only names lines that deserve suspicion.
 */
import { toDate, toNumber, type NumericInput } from './numbers';
import { CONFLICT_FACTOR } from './source-conflict';

/** Names that are not a person (assumption A4). `null`, empty and whitespace count as well. */
export const NON_PERSON_NAMES: readonly string[] = ['system', 'anonymous'];

/** Oakhaven time equals UTC (assumption, requirements section 2). One constant, easy to change. */
export const OAKHAVEN_UTC_OFFSET_MINUTES = 0;

/** Quiet hours: from 00:00 up to, but not including, 04:00 (Tobin starts at four). */
export const QUIET_HOURS_END_HOUR = 4;

const MS_PER_MINUTE = 60 * 1000;

export type RuleId = 'impossibleFlow' | 'negativeStock' | 'nonPersonEditor' | 'quietHours';
export type EntityName = 'WaterPipes' | 'Sensors' | 'Repairs' | 'Landmarks' | 'StockItems';

/** Rule (a): the sensor reads more than `factor` times the pipe's normal flow. Cannot judge: false. */
export function isImpossibleSensorFlow(
  sensorFlow: NumericInput,
  pipeNominalFlow: NumericInput,
  factor: number = CONFLICT_FACTOR,
): boolean {
  const flow = toNumber(sensorFlow);
  const nominal = toNumber(pipeNominalFlow);
  if (flow === null || nominal === null || nominal <= 0) return false;
  return flow > factor * nominal;
}

/** Rule (b): less than nothing in stock. Zero is fine. */
export function isNegativeStock(currentQuantity: NumericInput): boolean {
  const quantity = toNumber(currentQuantity);
  return quantity !== null && quantity < 0;
}

/** Rule (c): the editor is no person: no name, or a system account. */
export function isNonPersonEditor(modifiedBy: string | null | undefined): boolean {
  const name = (modifiedBy ?? '').trim().toLowerCase();
  return name === '' || NON_PERSON_NAMES.includes(name);
}

/** Time of day in minutes since midnight, in Oakhaven time. Null for a missing or invalid date. */
function localMinutesOfDay(value: Date | string | null | undefined, utcOffsetMinutes: number): number | null {
  const date = toDate(value);
  if (!date) return null;
  const local = new Date(date.getTime() + utcOffsetMinutes * MS_PER_MINUTE);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

/** Rule (d): changed at a local time of day in [00:00:00, 04:00:00). Seconds count (03:59:59 is inside). */
export function isInQuietHours(
  modifiedAt: Date | string | null | undefined,
  utcOffsetMinutes: number = OAKHAVEN_UTC_OFFSET_MINUTES,
): boolean {
  const date = toDate(modifiedAt);
  if (!date) return false;
  const local = new Date(date.getTime() + utcOffsetMinutes * MS_PER_MINUTE);
  return local.getUTCHours() < QUIET_HOURS_END_HOUR;
}

/** Audit data every row has (managed aspect). */
export interface Audited {
  modifiedAt: Date | string | null | undefined;
  modifiedBy: string | null | undefined;
}

export interface PipeRecord extends Audited {
  ID: string;
  pipeID: string | null | undefined;
  nominalFlowRate: NumericInput;
  currentFlowRate: NumericInput;
}
export interface SensorRecord extends Audited {
  ID: string;
  pipe_ID: string | null | undefined;
  sensorID: string | null | undefined;
  flowRate: NumericInput;
}
export interface RepairRecord extends Audited {
  ID: string;
  pipe_ID: string | null | undefined;
  issue: string | null | undefined;
}
export interface LandmarkRecord extends Audited {
  ID: string;
  name: string | null | undefined;
}
export interface StockItemRecord extends Audited {
  ID: string;
  name: string | null | undefined;
  unit: string | null | undefined;
  currentQuantity: NumericInput;
}

export interface InvestigationInput {
  pipes: readonly PipeRecord[];
  sensors: readonly SensorRecord[];
  repairs: readonly RepairRecord[];
  landmarks: readonly LandmarkRecord[];
  stockItems: readonly StockItemRecord[];
}

/** One suspicious line, ready for the screen. */
export interface Finding {
  entityName: EntityName;
  recordID: string;
  /** Short name of the line, for example "Sensor SENS-004 on BAKERY-BRANCH". */
  label: string;
  rules: RuleId[];
  /** Plain words Ilse can repeat to the council. */
  reason: string;
  /** ISO string (UTC) of the last change, or null when unknown. */
  changedAt: string | null;
  changedBy: string | null;
  /** Number of rules the line hits. */
  severity: number;
  /** Number of rules that were checked on this kind of line. */
  rulesChecked: number;
}

/** Rule count with a short, readable number: 2.8 instead of 2.800000001. */
function plain(value: number): string {
  return String(Number(value.toFixed(2)));
}

function formatTimeOfDay(value: Date | string | null | undefined, utcOffsetMinutes: number): string | null {
  const minutes = localMinutesOfDay(value, utcOffsetMinutes);
  if (minutes === null) return null;
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm} ${utcOffsetMinutes === 0 ? 'UTC' : 'Oakhaven time'}`;
}

/** The sentence about who and when; one clause per rule (c) and (d). */
function changeSentence(audit: Audited, rules: readonly RuleId[], utcOffsetMinutes: number): string | null {
  const quiet = rules.includes('quietHours') ? formatTimeOfDay(audit.modifiedAt, utcOffsetMinutes) : null;
  const name = (audit.modifiedBy ?? '').trim();
  const person = rules.includes('nonPersonEditor')
    ? name === ''
      ? 'with no name recorded, which is not a person'
      : `by ${name}, which is not a person`
    : null;
  if (quiet && person) return `The record was changed at ${quiet}, when nobody in Oakhaven works, ${person}.`;
  if (quiet) return `The record was changed at ${quiet}, when nobody in Oakhaven works.`;
  if (person) return `The record was last changed ${person}.`;
  return null;
}

function toChangedAt(value: Date | string | null | undefined): string | null {
  return toDate(value)?.toISOString() ?? null;
}

function sensorFlowSentence(sensor: SensorRecord, pipe: PipeRecord | undefined): string {
  const flow = toNumber(sensor.flowRate) ?? 0;
  const nominal = toNumber(pipe?.nominalFlowRate) ?? 0;
  const current = toNumber(pipe?.currentFlowRate);
  const ratio = nominal > 0 ? flow / nominal : 0;
  const pipeSays = current === null ? '' : ` The pipe itself says it carries ${plain(current)}.`;
  return (
    `This sensor reports ${plain(flow)} litres a minute, but its pipe can carry only ${plain(nominal)}, ` +
    `so it claims ${plain(ratio)} times the most the pipe can carry.${pipeSays}`
  );
}

/**
 * Finds every suspicious line. A sensor row is checked with (a), (c), (d); a stock row with (b), (c), (d);
 * pipes, repairs and landmarks with (c), (d). One finding per record, listing every rule it hits.
 * Sorted by severity: most rules first, then newest change first, then entity and record (stable).
 */
export function findSuspiciousLines(
  input: InvestigationInput,
  utcOffsetMinutes: number = OAKHAVEN_UTC_OFFSET_MINUTES,
): Finding[] {
  const pipesById = new Map(input.pipes.map((pipe) => [pipe.ID, pipe]));
  const findings: Finding[] = [];

  const check = (
    entityName: EntityName,
    recordID: string,
    label: string,
    audit: Audited,
    valueRule: RuleId | null,
    valueHit: boolean,
    valueSentence: string,
  ): void => {
    const rules: RuleId[] = [];
    if (valueRule && valueHit) rules.push(valueRule);
    if (isNonPersonEditor(audit.modifiedBy)) rules.push('nonPersonEditor');
    if (isInQuietHours(audit.modifiedAt, utcOffsetMinutes)) rules.push('quietHours');
    if (rules.length === 0) return;
    const reason = [valueRule && valueHit ? valueSentence : null, changeSentence(audit, rules, utcOffsetMinutes)]
      .filter((part): part is string => part !== null)
      .join(' ');
    const name = (audit.modifiedBy ?? '').trim();
    findings.push({
      entityName,
      recordID,
      label,
      rules,
      reason,
      changedAt: toChangedAt(audit.modifiedAt),
      changedBy: name === '' ? null : name,
      severity: rules.length,
      rulesChecked: valueRule ? 3 : 2,
    });
  };

  for (const pipe of input.pipes) {
    check('WaterPipes', pipe.ID, `Pipe ${pipe.pipeID ?? pipe.ID}`, pipe, null, false, '');
  }
  for (const sensor of input.sensors) {
    const pipe = sensor.pipe_ID ? pipesById.get(sensor.pipe_ID) : undefined;
    const label = `Sensor ${sensor.sensorID ?? sensor.ID}${pipe?.pipeID ? ` on ${pipe.pipeID}` : ''}`;
    const hit = isImpossibleSensorFlow(sensor.flowRate, pipe?.nominalFlowRate);
    check('Sensors', sensor.ID, label, sensor, 'impossibleFlow', hit, hit ? sensorFlowSentence(sensor, pipe) : '');
  }
  for (const repair of input.repairs) {
    const pipe = repair.pipe_ID ? pipesById.get(repair.pipe_ID) : undefined;
    const base = `Repair${pipe?.pipeID ? ` on ${pipe.pipeID}` : ''}`;
    const label = repair.issue ? `${base}: ${repair.issue}` : base;
    check('Repairs', repair.ID, label, repair, null, false, '');
  }
  for (const landmark of input.landmarks) {
    check('Landmarks', landmark.ID, `Landmark ${landmark.name ?? landmark.ID}`, landmark, null, false, '');
  }
  for (const item of input.stockItems) {
    const quantity = toNumber(item.currentQuantity);
    const hit = isNegativeStock(item.currentQuantity);
    const sentence =
      quantity === null
        ? ''
        : `The stock list says minus ${plain(Math.abs(quantity))} ${item.unit ?? ''} of ${item.name ?? 'this item'}. ` +
          'You cannot have less than nothing in stock.';
    check('StockItems', item.ID, `Stock item ${item.name ?? item.ID}`, item, 'negativeStock', hit, sentence);
  }

  return findings.sort((a, b) => {
    if (a.severity !== b.severity) return b.severity - a.severity;
    const timeA = a.changedAt ? Date.parse(a.changedAt) : Number.NEGATIVE_INFINITY;
    const timeB = b.changedAt ? Date.parse(b.changedAt) : Number.NEGATIVE_INFINITY;
    if (timeA !== timeB) return timeB - timeA;
    if (a.entityName !== b.entityName) return a.entityName < b.entityName ? -1 : 1;
    return a.recordID < b.recordID ? -1 : a.recordID > b.recordID ? 1 : 0;
  });
}
