/**
 * Fills the "not to be trusted" fields on rows of the water and food services.
 * One query for all rows (`recordID in (...)`), never one per row. Pure data lookup, no rules.
 */

/** The virtual fields a service entity gets for a mark. */
export interface UntrustedFields {
  untrusted?: boolean | null;
  untrustedReason?: string | null;
  untrustedBy?: string | null;
  untrustedAt?: string | null;
}

/** A row that can carry a mark: it has a key. */
export interface MarkableRow extends UntrustedFields {
  ID?: string;
}

/** A row of the Distrusts table. */
export interface DistrustRow {
  ID: string;
  entityName: string;
  recordID: string;
  reason: string;
  markedBy: string;
  createdAt: string | null;
}

/** A query that can be narrowed with `where`. */
interface DistrustQuery<T> extends PromiseLike<T[]> {
  where(predicate: Readonly<Record<string, unknown>>): PromiseLike<T[]>;
}

/** The slice of the `cds` facade this file uses. */
interface CdsApi {
  readonly ql: {
    readonly SELECT: {
      from(entity: string): {
        columns<T>(...columns: readonly string[]): DistrustQuery<T>;
      };
    };
  };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cds = require('@sap/cds') as CdsApi;
const { SELECT } = cds.ql;

const DISTRUST_COLUMNS = ['ID', 'entityName', 'recordID', 'reason', 'markedBy', 'createdAt'] as const;

/** Result rows of a READ: an array for a collection, one object for a single entity. */
export function asRows<T extends object>(results: unknown): T[] {
  return (Array.isArray(results) ? results : [results]).filter(
    (row): row is T => row !== null && typeof row === 'object',
  );
}

/** Reads the marks of the given records of one entity, keyed by record ID. */
export async function readDistrusts(
  entityName: string,
  recordIDs: readonly string[],
): Promise<Map<string, DistrustRow>> {
  const marks = new Map<string, DistrustRow>();
  if (recordIDs.length === 0) return marks;
  const rows = await SELECT.from('oakhaven.curse.Distrusts')
    .columns<DistrustRow>(...DISTRUST_COLUMNS)
    .where({ entityName, recordID: { in: [...recordIDs] } });
  for (const row of rows) marks.set(row.recordID, row);
  return marks;
}

/** Record IDs of every marked record of one entity (one query). */
export async function readAllDistrusts(entityName: string): Promise<Set<string>> {
  const rows = await SELECT.from('oakhaven.curse.Distrusts')
    .columns<DistrustRow>('recordID')
    .where({ entityName });
  return new Set(rows.map((row) => row.recordID));
}

/**
 * Sets `untrusted`, `untrustedReason`, `untrustedBy` and `untrustedAt` on every row (null when not marked).
 * `entityName` is the entity the rows belong to, for example `Sensors`.
 */
export async function markUntrustedRows(entityName: string, results: unknown): Promise<void> {
  const rows = asRows<MarkableRow>(results);
  const ids = rows.map((row) => row.ID).filter((id): id is string => typeof id === 'string');
  const marks = await readDistrusts(entityName, ids);
  for (const row of rows) {
    const mark = row.ID ? marks.get(row.ID) : undefined;
    row.untrusted = mark !== undefined;
    row.untrustedReason = mark?.reason ?? null;
    row.untrustedBy = mark?.markedBy ?? null;
    row.untrustedAt = mark?.createdAt ?? null;
  }
}

/** Pipe rows get the marks of their sensors as a list of sensor IDs (for "Sensor SENS-004 not to be trusted"). */
export interface PipeSensorMarkRow {
  ID?: string;
  untrustedSensorIDs?: string | null;
  untrustedSensorReason?: string | null;
  untrustedSensorBy?: string | null;
  untrustedSensorAt?: string | null;
}

interface SensorKeyRow {
  ID: string;
  pipe_ID: string | null;
  sensorID: string | null;
}

/**
 * Fills `untrustedSensorIDs` (comma separated) and the reason, who and when of the newest sensor mark
 * on every pipe row. Two queries for all rows.
 */
export async function markUntrustedSensorsOnPipes(results: unknown): Promise<void> {
  const rows = asRows<PipeSensorMarkRow>(results);
  const pipeIDs = rows.map((row) => row.ID).filter((id): id is string => typeof id === 'string');
  if (pipeIDs.length === 0) return;
  const sensors = await SELECT.from('oakhaven.curse.Sensors')
    .columns<SensorKeyRow>('ID', 'pipe_ID', 'sensorID')
    .where({ pipe_ID: { in: pipeIDs } });
  const marks = await readDistrusts('Sensors', sensors.map((sensor) => sensor.ID));
  for (const row of rows) {
    const marked = sensors
      .filter((sensor) => sensor.pipe_ID === row.ID && marks.has(sensor.ID))
      .map((sensor) => ({ sensor, mark: marks.get(sensor.ID) }))
      .sort((a, b) => String(b.mark?.createdAt ?? '').localeCompare(String(a.mark?.createdAt ?? '')));
    const newest = marked[0]?.mark;
    row.untrustedSensorIDs = marked.length > 0 ? marked.map((m) => m.sensor.sensorID ?? m.sensor.ID).join(', ') : null;
    row.untrustedSensorReason = newest?.reason ?? null;
    row.untrustedSensorBy = newest?.markedBy ?? null;
    row.untrustedSensorAt = newest?.createdAt ?? null;
  }
}
