/**
 * Loads the whole water network (pipes, sensors, repairs) for the pure functions in srv/domain.
 * Shared by WaterSupplyService and CouncilService so both always evaluate the same data.
 *
 * Three queries per call, never one per pipe.
 */
import type { NumericInput } from '../domain/numbers';
import type { PipeInput } from '../domain/pipe-overview';

/** A query that can be awaited directly. */
interface Query<T> extends PromiseLike<T[]> {
  where(predicate: Readonly<Record<string, unknown>>): PromiseLike<T[]>;
}

/** The slice of the `cds` facade this file uses. */
interface CdsApi {
  readonly ql: {
    readonly SELECT: {
      from(entity: string): { columns<T>(...columns: readonly string[]): Query<T> };
    };
  };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cds = require('@sap/cds') as CdsApi;
const { SELECT } = cds.ql;

interface PipeDbRow {
  ID: string;
  pipeID: string;
  currentFlowRate: NumericInput;
  nominalFlowRate: NumericInput;
  currentPressure: NumericInput;
}
interface SensorDbRow {
  ID: string;
  sensorID: string;
  pipe_ID: string | null;
  flowRate: NumericInput;
  lastReading: string | null;
}
interface RepairDbRow {
  ID: string;
  pipe_ID: string | null;
  repairDate: string | null;
  issue: string | null;
}

/** A pipe as `evaluatePipes` needs it, plus the record IDs the council page shows. */
export interface NetworkPipe extends PipeInput {
  sensors: readonly { ID: string; sensorID: string; flowRate: NumericInput; lastReading: string | null }[];
  repairs: readonly { ID: string; issue: string | null; repairDate: string | null }[];
}

/** Every pipe with its sensors and repairs (3 queries, whatever the client asked for). */
export async function loadPipeNetwork(): Promise<NetworkPipe[]> {
  const [pipes, sensors, repairs] = await Promise.all([
    SELECT.from('oakhaven.curse.WaterPipes').columns<PipeDbRow>(
      'ID', 'pipeID', 'currentFlowRate', 'nominalFlowRate', 'currentPressure',
    ),
    SELECT.from('oakhaven.curse.Sensors').columns<SensorDbRow>('ID', 'sensorID', 'pipe_ID', 'flowRate', 'lastReading'),
    SELECT.from('oakhaven.curse.Repairs').columns<RepairDbRow>('ID', 'pipe_ID', 'repairDate', 'issue'),
  ]);

  const sensorsByPipe = new Map<string, NetworkPipe['sensors'][number][]>();
  for (const s of sensors) {
    const list = sensorsByPipe.get(s.pipe_ID ?? '') ?? [];
    list.push({ ID: s.ID, sensorID: s.sensorID, flowRate: s.flowRate, lastReading: s.lastReading });
    sensorsByPipe.set(s.pipe_ID ?? '', list);
  }
  const repairsByPipe = new Map<string, NetworkPipe['repairs'][number][]>();
  for (const r of repairs) {
    const list = repairsByPipe.get(r.pipe_ID ?? '') ?? [];
    list.push({ ID: r.ID, issue: r.issue, repairDate: r.repairDate });
    repairsByPipe.set(r.pipe_ID ?? '', list);
  }

  return pipes.map((p) => ({
    ...p,
    sensors: sensorsByPipe.get(p.ID) ?? [],
    repairs: repairsByPipe.get(p.ID) ?? [],
  }));
}
