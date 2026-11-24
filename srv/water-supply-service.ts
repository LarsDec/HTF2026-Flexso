/**
 * Handlers of `WaterSupplyService` (see `water-supply-service.cds`).
 *
 * Everything you can read from the service is served by CAP's generic provider — no code needed.
 * Add a handler here only when you need logic: `this.before(...)` to validate, `this.on(...)` to
 * implement an action, `this.after(...)` to enrich what is read.
 *
 * `@sap/cds` ships no TypeScript declarations in this project, so it is loaded with `require`
 * and the part of its API this file uses is described in the small interfaces below.
 */
import { randomUUID } from 'node:crypto';
import { flagRepair } from './domain/repair-status';
import { validateRepairLog, type RepairLogInput, type RepairLogRecord } from './domain/repair-log';
import { startDemoSensorFeed } from './lib/demo-freshness';
import { evaluatePipes, type PipeEvaluation, type PipeInput } from './domain/pipe-overview';
import type { NumericInput } from './domain/numbers';
import { markUntrustedRows, markUntrustedSensorsOnPipes, readAllDistrusts } from './lib/distrusts';

// 👋 EXAMPLE — the shape of a WaterPipes row as our handler sees it. Every field is optional:
//    the client decides which fields it asks for ($select).
interface PipeRow {
  ID?: string;
  lastMaintenance?: string | null;
  daysSinceMaintenance?: number | null;
}

/** Rows read for the health overview (all pipes, sensors and repairs at once). */
interface PipeDbRow {
  ID: string;
  pipeID: string;
  currentFlowRate: NumericInput;
  nominalFlowRate: NumericInput;
  currentPressure: NumericInput;
}
interface SensorDbRow {
  ID: string;
  pipe_ID: string | null;
  sensorID: string | null;
  flowRate: NumericInput;
  lastReading: string | null;
  modifiedAt: string | null;
  modifiedBy: string | null;
}
interface RepairDbRow {
  pipe_ID: string | null;
  repairDate: string | null;
  issue: string | null;
  repairedBy: string | null;
}

/** A query that can be awaited directly or narrowed with `where`. */
interface Query<T> extends PromiseLike<T[]> {
  where(predicate: Readonly<Record<string, unknown>>): PromiseLike<T[]>;
}

/** The slice of a CAP request this file uses (bound action `logRepair`). */
interface LogRepairRequest {
  readonly data: RepairLogInput;
  readonly subject: unknown;
  error(code: number, message: string, target?: string): void;
}

/** The slice of a CAP read request this file uses. */
interface ReadRequest {
  readonly query: { where(predicate: Readonly<Record<string, unknown>>): unknown };
}

/** The slice of a CAP service this file uses. */
interface CdsService {
  init(): Promise<void>;
  before(event: string, entity: string, handler: (req: ReadRequest) => unknown): void;
  after(event: string, entity: string, handler: (results: unknown) => unknown): void;
  on(event: string, entity: string, handler: (req: LogRepairRequest) => unknown): void;
}

/** The slice of the `cds` facade this file uses. */
interface CdsApi {
  readonly ApplicationService: new (...args: readonly never[]) => CdsService;
  readonly ql: {
    readonly SELECT: {
      from(entity: string): {
        columns<T = PipeRow>(...columns: readonly string[]): Query<T>;
      };
      one: { from(source: unknown): { columns(...columns: readonly string[]): PromiseLike<{ ID: string } | null | undefined> } };
    };
    readonly INSERT: {
      into(entity: string): { entries(entry: Readonly<Record<string, unknown>>): PromiseLike<unknown> };
    };
  };
  log(module: string): { warn(...args: readonly unknown[]): void };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cds = require('@sap/cds') as CdsApi;
const { SELECT, INSERT } = cds.ql;
const log = cds.log('water-supply');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 👋 EXAMPLE — fills in the computed field `daysSinceMaintenance` on every pipe that is read.
 *
 * Registered with `this.after('READ', 'WaterPipes', …)`: CAP has already read the rows from the
 * database and hands them to us just before it sends them to the client — we only add a value.
 */
async function addDaysSinceMaintenance(results: unknown): Promise<void> {
  // 👋 EXAMPLE — reading a collection (/WaterPipes) gives an array; reading one pipe
  //    (/WaterPipes(<ID>)) gives a single object. Treat both the same way.
  const rows = (Array.isArray(results) ? results : [results]).filter(
    (row): row is PipeRow => row !== null && typeof row === 'object',
  );

  // 👋 EXAMPLE — the client may ask for only SOME fields, e.g. `$select=pipeID,daysSinceMaintenance`.
  //    UI5 always does that: it only requests the fields a view binds. Then `lastMaintenance` — the
  //    input we need — is not in the row. CAP always adds the key (`ID`), so we look the missing
  //    inputs up ourselves: ONE query for all rows that need it (never one query per row).
  const missingIds = rows.filter((row) => !('lastMaintenance' in row) && row.ID).map((row) => row.ID);
  const lastMaintenanceById = new Map<string, string | null | undefined>();
  if (missingIds.length > 0) {
    const pipes = await SELECT.from('oakhaven.curse.WaterPipes')
      .columns('ID', 'lastMaintenance')
      .where({ ID: { in: missingIds } });
    for (const pipe of pipes) lastMaintenanceById.set(pipe.ID ?? '', pipe.lastMaintenance);
  }

  // 👋 EXAMPLE — the actual calculation: whole days between the last maintenance and now.
  //    Computed on every read, so it is always up to date — nothing is stored.
  const now = Date.now();
  for (const row of rows) {
    const lastMaintenance = 'lastMaintenance' in row ? row.lastMaintenance : lastMaintenanceById.get(row.ID ?? '');
    row.daysSinceMaintenance = lastMaintenance
      ? Math.floor((now - Date.parse(lastMaintenance)) / MS_PER_DAY)
      : null;
  }
}

/**
 * Fills the status / priority fields. Ranking needs ALL pipes, so we read every pipe, sensor and
 * repair (3 queries, whatever the client's $select) and let the pure functions in srv/domain decide.
 * This handler only fetches data and maps the result onto the rows.
 */
async function evaluateAllPipes(): Promise<Map<string, PipeEvaluation>> {
  const [pipes, sensors, repairs, pipeMarks, sensorMarks] = await Promise.all([
    SELECT.from('oakhaven.curse.WaterPipes').columns<PipeDbRow>(
      'ID', 'pipeID', 'currentFlowRate', 'nominalFlowRate', 'currentPressure',
    ),
    SELECT.from('oakhaven.curse.Sensors').columns<SensorDbRow>(
      'ID', 'pipe_ID', 'sensorID', 'flowRate', 'lastReading', 'modifiedAt', 'modifiedBy',
    ),
    SELECT.from('oakhaven.curse.Repairs').columns<RepairDbRow>('pipe_ID', 'repairDate', 'issue', 'repairedBy'),
    readAllDistrusts('WaterPipes'),
    readAllDistrusts('Sensors'),
  ]);
  const untrustedPipes = new Set(pipeMarks);
  for (const s of sensors) if (sensorMarks.has(s.ID) && s.pipe_ID) untrustedPipes.add(s.pipe_ID);

  const sensorsByPipe = new Map<string, PipeInput['sensors'][number][]>();
  for (const s of sensors) {
    const list = sensorsByPipe.get(s.pipe_ID ?? '') ?? [];
    list.push({
      sensorID: s.sensorID,
      flowRate: s.flowRate,
      lastReading: s.lastReading,
      modifiedAt: s.modifiedAt,
      modifiedBy: s.modifiedBy,
    });
    sensorsByPipe.set(s.pipe_ID ?? '', list);
  }
  const repairsByPipe = new Map<string, PipeInput['repairs'][number][]>();
  for (const r of repairs) {
    const list = repairsByPipe.get(r.pipe_ID ?? '') ?? [];
    list.push({ repairDate: r.repairDate, issue: r.issue, repairedBy: r.repairedBy });
    repairsByPipe.set(r.pipe_ID ?? '', list);
  }

  const inputs: PipeInput[] = pipes.map((p) => ({
    ...p,
    untrusted: untrustedPipes.has(p.ID),
    sensors: sensorsByPipe.get(p.ID) ?? [],
    repairs: repairsByPipe.get(p.ID) ?? [],
  }));
  return new Map(evaluatePipes(inputs, new Date()).map((e) => [e.ID, e]));
}

/** Adds the evaluation to every row and puts a collection in repair order (virtual fields cannot be sorted by the database). */
async function addHealthOverview(results: unknown): Promise<void> {
  const rows = (Array.isArray(results) ? results : [results]).filter(
    (row): row is PipeRow & Partial<PipeEvaluation> => row !== null && typeof row === 'object',
  );
  if (rows.length === 0) return;
  const evaluations = await evaluateAllPipes();

  for (const row of rows) {
    const evaluation = row.ID ? evaluations.get(row.ID) : undefined;
    if (!evaluation) {
      log.warn('No health evaluation for pipe', row.ID);
      continue;
    }
    Object.assign(row, evaluation);
  }
  if (Array.isArray(results)) {
    const rank = (row: Partial<PipeEvaluation>): number => row.priorityRank ?? Number.MAX_SAFE_INTEGER;
    results.sort((a: Partial<PipeEvaluation>, b: Partial<PipeEvaluation>) => rank(a) - rank(b));
  }
}

/** Repair row as the log reads it; the client may $select only some fields, so missing inputs are read once. */
interface RepairRow {
  ID?: string;
  repairDate?: string | null;
  repairedBy?: string | null;
  futureDated?: boolean | null;
  bySystem?: boolean | null;
  suspicious?: boolean | null;
}

/** Fills the flags of the repair log (future date, logged by system). One query for rows that lack an input. */
async function addRepairFlags(results: unknown): Promise<void> {
  const rows = (Array.isArray(results) ? results : [results]).filter(
    (row): row is RepairRow => row !== null && typeof row === 'object',
  );
  const missing = rows.filter((r) => r.ID && !('repairDate' in r && 'repairedBy' in r)).map((r) => r.ID);
  const known = new Map<string, RepairRow>();
  if (missing.length > 0) {
    const found = await SELECT.from('oakhaven.curse.Repairs')
      .columns<RepairRow>('ID', 'repairDate', 'repairedBy')
      .where({ ID: { in: missing } });
    for (const r of found) known.set(r.ID ?? '', r);
  }
  const now = new Date();
  for (const row of rows) {
    const source = 'repairDate' in row && 'repairedBy' in row ? row : (known.get(row.ID ?? '') ?? row);
    Object.assign(row, flagRepair({ repairDate: source.repairDate ?? null, repairedBy: source.repairedBy ?? null }, now));
  }
}

/** Reading MorningPlan: restrict the query to the pipes in today's plan (decided by srv/domain/priority.ts). */
async function restrictToPlan(req: ReadRequest): Promise<void> {
  const evaluations = await evaluateAllPipes();
  const ids = [...evaluations.values()].filter((e) => e.inTodaysPlan).map((e) => e.ID);
  req.query.where({ ID: { in: ids } });
}

/**
 * Bound action WaterPipes.logRepair: validates in srv/domain/repair-log.ts and stores one Repairs row.
 * The existing health overview then shows "repaired" (see repair-status.ts), until newer readings say otherwise.
 */
async function logRepair(req: LogRepairRequest): Promise<RepairLogRecord | undefined> {
  const result = validateRepairLog(req.data, new Date());
  if (!result.ok) {
    for (const e of result.errors) req.error(e.code, e.message, e.target);
    return undefined;
  }
  const pipe = await SELECT.one.from(req.subject).columns('ID');
  if (!pipe) {
    req.error(404, 'This pipe does not exist.');
    return undefined;
  }
  await INSERT.into('oakhaven.curse.Repairs').entries({
    pipe_ID: pipe.ID,
    repairID: randomUUID(),
    issue: result.record.issue,
    repairDate: result.record.repairDate,
    repairedBy: result.record.repairedBy,
  });
  return result.record;
}

export default class WaterSupplyService extends cds.ApplicationService {
  override async init(): Promise<void> {
    // 👋 EXAMPLE — register the handler: after every READ of WaterPipes, add daysSinceMaintenance.
    //    MorningPlan is the same pipes, restricted to today's plan, so it gets the same fields.
    this.before('READ', 'MorningPlan', restrictToPlan);
    for (const pipes of ['WaterPipes', 'MorningPlan']) {
      this.after('READ', pipes, addDaysSinceMaintenance);
      this.after('READ', pipes, addHealthOverview);
      // Marks from the investigation service: "not to be trusted" (the records are pipes in both cases).
      this.after('READ', pipes, (results) => markUntrustedRows('WaterPipes', results));
      this.after('READ', pipes, markUntrustedSensorsOnPipes);
    }
    // Same marks on sensors, repairs and landmarks.
    this.after('READ', 'Sensors', (results) => markUntrustedRows('Sensors', results));
    this.after('READ', 'Repairs', addRepairFlags);
    this.after('READ', 'Repairs', (results) => markUntrustedRows('Repairs', results));
    this.after('READ', 'Landmarks', (results) => markUntrustedRows('Landmarks', results));

    this.on('logRepair', 'WaterPipes', logRepair);

    startDemoSensorFeed();
    return super.init();
  }
}
