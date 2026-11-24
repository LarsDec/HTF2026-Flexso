/**
 * The slice of the `@sap/cds` API used by the food pantry code (food-stock-service.ts and the
 * pantry-* helpers). `@sap/cds` ships no TypeScript declarations in this project, so — like
 * express-types.ts does for Express — the members we use are described here once.
 *
 * Query results come back as `unknown`; each caller states the row shape it selected.
 */

/** A CQL query: awaitable, optionally narrowed with `where` / `orderBy`. */
export interface CqlQuery extends PromiseLike<unknown> {
  where(predicate: Readonly<Record<string, unknown>>): CqlQuery;
  orderBy(...columns: readonly string[]): CqlQuery;
}

export interface CqlApi {
  readonly SELECT: {
    from(entity: unknown): { columns(...columns: readonly string[]): CqlQuery };
    readonly one: { from(entity: unknown): { columns(...columns: readonly string[]): CqlQuery } };
  };
  readonly INSERT: { into(entity: string): { entries(...rows: readonly object[]): PromiseLike<unknown> } };
  readonly UPSERT: { into(entity: string): { entries(...rows: readonly object[]): PromiseLike<unknown> } };
  UPDATE(entity: unknown): {
    set(data: Readonly<Record<string, unknown>>): { where(predicate: Readonly<Record<string, unknown>>): PromiseLike<unknown> };
    with(data: Readonly<Record<string, unknown>>): PromiseLike<unknown>;
  };
}

export interface CdsLogger {
  info(...args: readonly unknown[]): void;
  warn(...args: readonly unknown[]): void;
  error(...args: readonly unknown[]): void;
}

/** The request object CAP passes to `on` handlers. */
export interface CdsRequest {
  readonly event: string;
  readonly data: Readonly<Record<string, unknown>>;
  /** Keys of the addressed instance(s), e.g. [{ ID: '…' }] or ['…']. */
  readonly params: readonly unknown[];
  /** Reference to the bound instance (bound actions). */
  readonly subject: unknown;
  /** The (sub-)request of this call — inside a $batch it is the single request, not the envelope. */
  readonly req?: { readonly query?: Readonly<Record<string, unknown>> };
  /** The outer HTTP request (for a $batch: the envelope). */
  readonly http?: { readonly req?: { readonly query?: Readonly<Record<string, unknown>> } };
  error(code: number, message: string, target?: string): unknown;
  reject(code: number, message: string, target?: string): never;
}

export interface CdsService {
  init(): Promise<void>;
  on(event: string, entity: string, handler: (req: CdsRequest) => unknown): void;
  on(event: string, handler: (req: CdsRequest) => unknown): void;
}

export interface CdsApi {
  readonly ApplicationService: new (...args: readonly never[]) => CdsService;
  readonly ql: CqlApi;
  log(module: string): CdsLogger;
  /** Runs `fn` in its own transaction (committed when it resolves). */
  tx<T>(fn: () => Promise<T>): Promise<T>;
  once(event: string, handler: () => unknown): void;
}
