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
import { startDemoSensorFeed } from './lib/demo-freshness';
import { evaluatePipes, type PipeEvaluation, type PipeInput } from './domain/pipe-overview';
import type { NumericInput } from './domain/numbers';

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
  pipe_ID: string | null;
  flowRate: NumericInput;
  lastReading: string | null;
}
interface RepairDbRow {
  pipe_ID: string | null;
  repairDate: string | null;
}

/** A query that can be awaited directly or narrowed with `where`. */
interface Query<T> extends PromiseLike<T[]> {
  where(predicate: Readonly<Record<string, unknown>>): PromiseLike<T[]>;
}

/** The slice of a CAP service this file uses. */
interface CdsService {
  init(): Promise<void>;
  after(event: string, entity: string, handler: (results: unknown) => unknown): void;
}

/** The slice of the `cds` facade this file uses. */
interface CdsApi {
  readonly ApplicationService: new (...args: readonly never[]) => CdsService;
  readonly ql: {
    readonly SELECT: {
      from(entity: string): {
        columns<T = PipeRow>(...columns: readonly string[]): Query<T>;
      };
    };
  };
  log(module: string): { warn(...args: readonly unknown[]): void };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cds = require('@sap/cds') as CdsApi;
const { SELECT } = cds.ql;
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
async function addHealthOverview(results: unknown): Promise<void> {
  const rows = (Array.isArray(results) ? results : [results]).filter(
    (row): row is PipeRow & Partial<PipeEvaluation> => row !== null && typeof row === 'object',
  );
  if (rows.length === 0) return;

  const [pipes, sensors, repairs] = await Promise.all([
    SELECT.from('oakhaven.curse.WaterPipes').columns<PipeDbRow>(
      'ID', 'pipeID', 'currentFlowRate', 'nominalFlowRate', 'currentPressure',
    ),
    SELECT.from('oakhaven.curse.Sensors').columns<SensorDbRow>('pipe_ID', 'flowRate', 'lastReading'),
    SELECT.from('oakhaven.curse.Repairs').columns<RepairDbRow>('pipe_ID', 'repairDate'),
  ]);

  const sensorsByPipe = new Map<string, PipeInput['sensors'][number][]>();
  for (const s of sensors) {
    const list = sensorsByPipe.get(s.pipe_ID ?? '') ?? [];
    list.push({ flowRate: s.flowRate, lastReading: s.lastReading });
    sensorsByPipe.set(s.pipe_ID ?? '', list);
  }
  const repairsByPipe = new Map<string, PipeInput['repairs'][number][]>();
  for (const r of repairs) {
    const list = repairsByPipe.get(r.pipe_ID ?? '') ?? [];
    list.push({ repairDate: r.repairDate });
    repairsByPipe.set(r.pipe_ID ?? '', list);
  }

  const inputs: PipeInput[] = pipes.map((p) => ({
    ...p,
    sensors: sensorsByPipe.get(p.ID) ?? [],
    repairs: repairsByPipe.get(p.ID) ?? [],
  }));
  const evaluations = new Map(evaluatePipes(inputs, new Date()).map((e) => [e.ID, e]));

  for (const row of rows) {
    const evaluation = row.ID ? evaluations.get(row.ID) : undefined;
    if (!evaluation) {
      log.warn('No health evaluation for pipe', row.ID);
      continue;
    }
    Object.assign(row, evaluation);
  }
}

export default class WaterSupplyService extends cds.ApplicationService {
  override async init(): Promise<void> {
    // 👋 EXAMPLE — register the handler: after every READ of WaterPipes, add daysSinceMaintenance.
    this.after('READ', 'WaterPipes', addDaysSinceMaintenance);
    this.after('READ', 'WaterPipes', addHealthOverview);

    startDemoSensorFeed();
    return super.init();
  }
}
