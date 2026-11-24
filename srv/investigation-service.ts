/**
 * Handlers of `InvestigationService` (see `investigation-service.cds`).
 *
 * READ Findings   - reads every line, lets srv/domain/investigation.ts name the suspicious ones and adds the marks.
 * markUntrusted   - validates and stores one Distrusts row.
 * clearUntrusted  - deletes the mark.
 * councilReport   - every marked line plus the timeline (pure logic in srv/domain/council-report.ts).
 *
 * `@sap/cds` ships no TypeScript declarations in this project, so it is loaded with `require`.
 */
import { buildCouncilReport, type CouncilReport, type MarkedLine } from './domain/council-report';
import { findSuspiciousLines, type EntityName, type Finding, type InvestigationInput } from './domain/investigation';
import { readDistrusts, type DistrustRow } from './lib/distrusts';

/** Entities that can be marked. */
const MARKABLE: readonly EntityName[] = ['WaterPipes', 'Sensors', 'Repairs', 'Landmarks', 'StockItems'];
const NAMESPACE = 'oakhaven.curse.';
const AUDIT = ['modifiedAt', 'modifiedBy'] as const;

interface MarkRequest {
  readonly data: {
    entityName?: string | null;
    recordID?: string | null;
    reason?: string | null;
    markedBy?: string | null;
  };
  readonly query?: { SELECT?: { where?: readonly unknown[] } };
  error(code: number, message: string, target?: string): void;
}

type Predicate = Readonly<Record<string, unknown>>;

/** The slice of a CAP service this file uses. */
interface CdsService {
  init(): Promise<void>;
  on(event: string, entity: string, handler: (req: MarkRequest) => unknown): void;
  on(event: string, handler: (req: MarkRequest) => unknown): void;
}

/** The slice of the `cds` facade this file uses. */
interface CdsApi {
  readonly ApplicationService: new (...args: readonly never[]) => CdsService;
  readonly ql: {
    readonly SELECT: {
      from(entity: string): { columns<T>(...columns: readonly string[]): PromiseLike<T[]> };
      one: {
        from(entity: string): {
          columns<T>(...columns: readonly string[]): { where(predicate: Predicate): PromiseLike<T | null | undefined> };
        };
      };
    };
    readonly INSERT: {
      into(entity: string): { entries(entry: Predicate): PromiseLike<unknown> };
    };
    readonly DELETE: {
      from(entity: string): { where(predicate: Predicate): PromiseLike<number> };
    };
  };
  log(module: string): { info(...args: readonly unknown[]): void };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cds = require('@sap/cds') as CdsApi;
const { SELECT, INSERT, DELETE } = cds.ql;
const log = cds.log('investigation');

function isMarkable(name: string): name is EntityName {
  return MARKABLE.some((allowed) => allowed === name);
}

/** Reads every line the rules look at: 5 queries, whatever the client asks for. */
async function readInput(): Promise<InvestigationInput> {
  const [pipes, sensors, repairs, landmarks, stockItems] = await Promise.all([
    SELECT.from(`${NAMESPACE}WaterPipes`).columns<InvestigationInput['pipes'][number]>(
      'ID',
      'pipeID',
      'nominalFlowRate',
      'currentFlowRate',
      ...AUDIT,
    ),
    SELECT.from(`${NAMESPACE}Sensors`).columns<InvestigationInput['sensors'][number]>(
      'ID',
      'pipe_ID',
      'sensorID',
      'flowRate',
      ...AUDIT,
    ),
    SELECT.from(`${NAMESPACE}Repairs`).columns<InvestigationInput['repairs'][number]>('ID', 'pipe_ID', 'issue', ...AUDIT),
    SELECT.from(`${NAMESPACE}Landmarks`).columns<InvestigationInput['landmarks'][number]>('ID', 'name', ...AUDIT),
    SELECT.from(`${NAMESPACE}StockItems`).columns<InvestigationInput['stockItems'][number]>(
      'ID',
      'name',
      'unit',
      'currentQuantity',
      ...AUDIT,
    ),
  ]);
  return { pipes, sensors, repairs, landmarks, stockItems };
}

/** The marks of the findings: one query per entity kind, keyed "<entityName>:<recordID>". */
async function readMarks(findings: readonly Finding[]): Promise<Map<string, DistrustRow>> {
  const all = new Map<string, DistrustRow>();
  const idsByEntity = new Map<string, string[]>();
  for (const finding of findings) {
    idsByEntity.set(finding.entityName, [...(idsByEntity.get(finding.entityName) ?? []), finding.recordID]);
  }
  for (const [entityName, ids] of idsByEntity) {
    for (const [recordID, mark] of await readDistrusts(entityName, ids)) all.set(`${entityName}:${recordID}`, mark);
  }
  return all;
}

/** Row of the Findings entity. */
interface FindingRow {
  ID: string;
  entityName: string;
  recordID: string;
  label: string;
  reason: string;
  rules: string;
  severity: number;
  changedAt: string | null;
  changedBy: string | null;
  status: 'toReview' | 'untrusted';
  untrusted: boolean;
  distrustID: string | null;
  untrustedReason: string | null;
  untrustedBy: string | null;
  untrustedAt: string | null;
}

/** Value of a simple `untrusted eq <bool>` condition in the request, if any (the UI filters on it). */
function untrustedFilter(req: Pick<MarkRequest, 'query'>): boolean | undefined {
  const where = req.query?.SELECT?.where ?? [];
  for (let i = 0; i + 2 < where.length; i++) {
    const left = where[i] as { ref?: readonly string[] } | undefined;
    const right = where[i + 2] as { val?: unknown } | undefined;
    if (left?.ref?.length === 1 && left.ref[0] === 'untrusted' && where[i + 1] === '=' && typeof right?.val === 'boolean') {
      return right.val;
    }
  }
  return undefined;
}

async function readFindings(req: Pick<MarkRequest, 'query'>): Promise<FindingRow[]> {
  const only = untrustedFilter(req);
  const findings = findSuspiciousLines(await readInput());
  const marks = await readMarks(findings);
  const rows: FindingRow[] = findings.map((finding) => {
    const key = `${finding.entityName}:${finding.recordID}`;
    const mark = marks.get(key);
    return {
      ID: key,
      entityName: finding.entityName,
      recordID: finding.recordID,
      label: finding.label,
      reason: finding.reason,
      rules: finding.rules.join(','),
      severity: finding.severity,
      changedAt: finding.changedAt,
      changedBy: finding.changedBy,
      status: mark ? 'untrusted' : 'toReview',
      untrusted: mark !== undefined,
      distrustID: mark?.ID ?? null,
      untrustedReason: mark?.reason ?? null,
      untrustedBy: mark?.markedBy ?? null,
      untrustedAt: mark?.createdAt ?? null,
    };
  });
  return only === undefined ? rows : rows.filter((row) => row.untrusted === only);
}

/** Function councilReport: all marks, joined with the findings for label and last change. */
async function councilReport(): Promise<CouncilReport> {
  const [marks, findings] = await Promise.all([
    SELECT.from(`${NAMESPACE}Distrusts`).columns<DistrustRow>('ID', 'entityName', 'recordID', 'reason', 'markedBy', 'createdAt'),
    readInput().then(findSuspiciousLines),
  ]);
  const byKey = new Map(findings.map((finding) => [`${finding.entityName}:${finding.recordID}`, finding]));
  const lines: MarkedLine[] = marks.map((mark) => {
    const finding = byKey.get(`${mark.entityName}:${mark.recordID}`);
    return {
      entityName: mark.entityName,
      recordID: mark.recordID,
      label: finding?.label ?? `${mark.entityName} ${mark.recordID}`,
      reason: mark.reason,
      markedBy: mark.markedBy,
      markedAt: mark.createdAt,
      changedAt: finding?.changedAt ?? null,
      changedBy: finding?.changedBy ?? null,
    };
  });
  return buildCouncilReport(lines);
}

/** Action markUntrusted. 400 for bad input, 404 for an unknown line, 409 when it is already marked. */
async function markUntrusted(req: MarkRequest): Promise<DistrustRow | undefined> {
  const entityName = (req.data.entityName ?? '').trim();
  const recordID = (req.data.recordID ?? '').trim();
  const reason = (req.data.reason ?? '').trim();
  const markedBy = (req.data.markedBy ?? '').trim();

  if (!isMarkable(entityName)) {
    req.error(400, `entityName must be one of: ${MARKABLE.join(', ')}.`, 'entityName');
    return undefined;
  }
  if (recordID === '') req.error(400, 'recordID is required.', 'recordID');
  if (reason === '') req.error(400, 'Please give a reason.', 'reason');
  if (markedBy === '') req.error(400, 'Please enter your name.', 'markedBy');
  if (recordID === '' || reason === '' || markedBy === '') return undefined;

  const line = await SELECT.one.from(`${NAMESPACE}${entityName}`).columns<{ ID: string }>('ID').where({ ID: recordID });
  if (!line) {
    req.error(404, `There is no ${entityName} line with this ID.`, 'recordID');
    return undefined;
  }
  const existing = await SELECT.one
    .from(`${NAMESPACE}Distrusts`)
    .columns<{ ID: string }>('ID')
    .where({ entityName, recordID });
  if (existing) {
    req.error(409, 'This line is already marked as not to be trusted.');
    return undefined;
  }

  await INSERT.into(`${NAMESPACE}Distrusts`).entries({ entityName, recordID, reason, markedBy });
  const stored = await SELECT.one
    .from(`${NAMESPACE}Distrusts`)
    .columns<DistrustRow>('ID', 'entityName', 'recordID', 'reason', 'markedBy', 'createdAt')
    .where({ entityName, recordID });
  log.info('Marked as not to be trusted', entityName, recordID, 'by', markedBy);
  return stored ?? undefined;
}

/** Action clearUntrusted. 404 when there is no mark. */
async function clearUntrusted(req: MarkRequest): Promise<boolean | undefined> {
  const entityName = (req.data.entityName ?? '').trim();
  const recordID = (req.data.recordID ?? '').trim();
  if (!isMarkable(entityName) || recordID === '') {
    req.error(400, 'entityName and recordID are required.');
    return undefined;
  }
  const deleted = await DELETE.from(`${NAMESPACE}Distrusts`).where({ entityName, recordID });
  if (!deleted) {
    req.error(404, 'This line has no mark to clear.');
    return undefined;
  }
  log.info('Cleared the mark', entityName, recordID);
  return true;
}

export default class InvestigationService extends cds.ApplicationService {
  override async init(): Promise<void> {
    this.on('READ', 'Findings', readFindings);
    this.on('councilReport', councilReport);
    this.on('markUntrusted', markUntrusted);
    this.on('clearUntrusted', clearUntrusted);
    return super.init();
  }
}
