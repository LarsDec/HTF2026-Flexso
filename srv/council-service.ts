/**
 * Handlers of `CouncilService` (see `council-service.cds`): the page for Rowan and the council.
 *
 * The ranking lives in srv/domain/council.ts (pure, unit-tested). This file only reads the data,
 * calls it and returns the slice that was asked for. Nothing is stored.
 *
 * `@sap/cds` ships no TypeScript declarations in this project, so it is loaded with `require`
 * and the part of its API this file uses is described in the small interfaces below.
 */
import { evaluatePipes } from './domain/pipe-overview';
import {
  buildCouncilPage,
  type CouncilLandmark,
  type CouncilPage,
  type CouncilPipe,
  type MarkEntity,
  type TrustMark,
} from './domain/council';
import { loadConfig, loadReorderLines, pantryToday } from './lib/food-pantry-data';
import { loadPipeNetwork } from './lib/water-network-data';

interface Query extends PromiseLike<unknown> {
  orderBy(...columns: readonly string[]): Query;
}
interface CdsRequest {
  readonly params: readonly unknown[];
  reject(code: number, message: string, target?: string): never;
}
interface CdsService {
  init(): Promise<void>;
  on(event: string, entity: string, handler: (req: CdsRequest) => unknown): void;
}
interface CdsApi {
  readonly ApplicationService: new (...args: readonly never[]) => CdsService;
  readonly ql: { readonly SELECT: { from(entity: string): { columns(...columns: readonly string[]): Query } } };
  readonly model?: { readonly definitions?: Readonly<Record<string, unknown>> };
  log(module: string): { info(...args: readonly unknown[]): void };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cds = require('@sap/cds') as CdsApi;
const { SELECT } = cds.ql;
const log = cds.log('council');

const MARK_ENTITIES: readonly string[] = ['WaterPipes', 'Sensors', 'Repairs', 'Landmarks', 'StockItems'];

interface MarkRow {
  entityName: string;
  recordID: string;
  reason: string | null;
  markedBy: string | null;
  createdAt: string | null;
}

/**
 * Ilse's "not to be trusted" marks. TEMPORARY: `oakhaven.curse.Distrusts` is not in db/schema.cds yet
 * (a teammate has it unpushed), so while it is absent there are no marks. Once it lands this runs the
 * one SELECT and nothing else needs to change.
 */
async function loadMarks(): Promise<TrustMark[]> {
  if (!cds.model?.definitions?.['oakhaven.curse.Distrusts']) return [];
  const rows = (await SELECT.from('oakhaven.curse.Distrusts')
    .columns('entityName', 'recordID', 'reason', 'markedBy', 'createdAt')
    .orderBy('createdAt desc')) as MarkRow[];
  return rows
    .filter((row) => MARK_ENTITIES.includes(row.entityName))
    .map((row) => ({
      entityName: row.entityName as MarkEntity,
      recordID: row.recordID,
      reason: row.reason ?? '',
      markedBy: row.markedBy ?? '',
      markedAt: row.createdAt,
    }));
}

/** Reads everything the page needs (no query inside a loop) and builds the page. */
async function loadPage(now: Date): Promise<CouncilPage> {
  const config = await loadConfig();
  const [network, lines, landmarks, marks] = await Promise.all([
    loadPipeNetwork(),
    loadReorderLines(pantryToday(config, now), config.rules),
    SELECT.from('oakhaven.curse.Landmarks').columns('ID', 'name', 'suppliedBy') as PromiseLike<CouncilLandmark[]>,
    loadMarks(),
  ]);
  const evaluations = new Map(evaluatePipes(network, now).map((e) => [e.ID, e]));
  const pipes: CouncilPipe[] = network.map((pipe) => {
    const evaluation = evaluations.get(pipe.ID);
    return {
      ID: pipe.ID,
      pipeID: pipe.pipeID,
      status: evaluation?.healthStatus ?? 'unknown',
      priorityRank: evaluation?.priorityRank ?? 0,
      currentFlowRate: pipe.currentFlowRate,
      nominalFlowRate: pipe.nominalFlowRate,
      currentPressure: pipe.currentPressure,
      readingAgeMinutes: evaluation?.readingAgeMinutes ?? null,
      sensors: pipe.sensors,
      repairs: pipe.repairs,
    };
  });
  return buildCouncilPage({ pipes, items: lines, landmarks, marks });
}

/** The key of the addressed instance: `params` holds `{ ID }` objects or plain key values. */
function keyOf(req: CdsRequest): string | undefined {
  const last = req.params[req.params.length - 1];
  if (typeof last === 'string') return last;
  if (last && typeof last === 'object' && 'ID' in last && typeof last.ID === 'string') return last.ID;
  return undefined;
}

/** A collection read returns the rows with `$count`; a single-key read returns the row or 404. */
function answer<T extends { ID: string }>(req: CdsRequest, rows: T[]): unknown {
  const id = keyOf(req);
  if (id !== undefined) return rows.find((row) => row.ID === id) ?? req.reject(404, `Not found: ${id}`);
  return Object.assign(rows, { $count: rows.length });
}

export default class CouncilService extends cds.ApplicationService {
  override async init(): Promise<void> {
    this.on('READ', 'Problems', async (req) => answer(req, (await loadPage(new Date())).problems));
    this.on('READ', 'UntrustedLines', async (req) => answer(req, (await loadPage(new Date())).untrusted));
    this.on('READ', 'Summary', async (req) => {
      const now = new Date();
      const { summary } = await loadPage(now);
      log.info('Council summary built');
      return answer(req, [{ ID: 'current', generatedAt: now.toISOString(), ...summary }]);
    });
    return super.init();
  }
}
