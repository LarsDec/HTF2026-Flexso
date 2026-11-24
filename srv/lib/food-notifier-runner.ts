/**
 * Runs the pantry notifications: every minute while the server runs (and on demand through the
 * `runNotifier` action) it computes today's statuses, asks `planNotifications` what to send,
 * sends through the channels and stores the new state — all in one transaction, so a failed send
 * does not mark anything as notified.
 */
import type { CdsApi } from './food-cds-types';
import { EmailOutboxChannel, InAppChannel, type NotificationChannel } from './food-notification-channels';
import { loadConfig, loadPantryItems, pantryToday, toReorderLine } from './food-pantry-data';
import { planNotifications, type NotifiedState, type NotifierSnapshot, type TrackedItem } from '../domain/food-notifier';
import type { ReorderStatus } from '../domain/food-reorder';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cds = require('@sap/cds') as CdsApi;
const { SELECT, UPSERT } = cds.ql;
const LOG = cds.log('pantry-notifier');

const CHECKPOINT_ID = '70000000-0000-4000-8000-000000000002';
const TICK_MS = 60_000;

interface StateRow {
  item_ID: string;
  status: ReorderStatus;
  dataError: boolean | null;
  lastImmediateAt: string | null;
}

async function loadSnapshot(): Promise<NotifierSnapshot> {
  const rows = (await SELECT.from('oakhaven.curse.NotificationStates').columns('item_ID', 'status', 'dataError', 'lastImmediateAt')) as StateRow[];
  const checkpoint = (await SELECT.one
    .from('oakhaven.curse.NotifierCheckpoints')
    .columns('lastDigestDate')
    .where({ ID: CHECKPOINT_ID })) as { lastDigestDate: string | null } | undefined;
  return {
    states: rows.map((r) => ({ itemID: r.item_ID, status: r.status, dataError: r.dataError === true, lastImmediateAt: r.lastImmediateAt })),
    lastDigestDate: checkpoint?.lastDigestDate ?? null,
  };
}

/** CDS DateTime has seconds precision: 2026-11-24T10:00:00Z. */
function toCdsDateTime(iso: string | null): string | null {
  return iso ? `${iso.slice(0, 19)}Z` : null;
}

async function saveSnapshot(before: NotifierSnapshot, after: NotifierSnapshot): Promise<void> {
  const old = new Map(before.states.map((s) => [s.itemID, s]));
  const changed = after.states.filter((s: NotifiedState) => {
    const o = old.get(s.itemID);
    return !o || o.status !== s.status || o.dataError !== s.dataError || o.lastImmediateAt !== s.lastImmediateAt;
  });
  if (changed.length) {
    // The item ID doubles as the state ID: one state row per item.
    await UPSERT.into('oakhaven.curse.NotificationStates').entries(
      ...changed.map((s) => ({ ID: s.itemID, item_ID: s.itemID, status: s.status, dataError: s.dataError, lastImmediateAt: toCdsDateTime(s.lastImmediateAt) })),
    );
  }
  if (after.lastDigestDate !== before.lastDigestDate) {
    await UPSERT.into('oakhaven.curse.NotifierCheckpoints').entries({ ID: CHECKPOINT_ID, lastDigestDate: after.lastDigestDate });
  }
}

/** One notifier run at `now`. Returns a one-line summary (used by the runNotifier action). */
export async function runPantryNotifier(now: Date = new Date()): Promise<string> {
  const config = await loadConfig();
  const today = pantryToday(config, now);
  const items: TrackedItem[] = (await loadPantryItems()).map((item) => {
    const line = toReorderLine(item, today, config.rules);
    return {
      itemID: line.ID,
      name: line.name,
      unit: line.unit,
      isCritical: line.isCritical,
      inHouse: line.inHouse,
      status: line.status,
      dataError: line.dataError,
      orderByDate: line.orderByDate,
      orderQuantity: line.orderQuantity,
      supplierName: line.supplierName,
    };
  });
  const before = await loadSnapshot();
  const plan = planNotifications(now, items, before, config.notifier);

  const channels: NotificationChannel[] = [new EmailOutboxChannel(config.recipientEmail), new InAppChannel()];
  for (const message of plan.messages) {
    for (const channel of channels) await channel.send(message);
  }
  await saveSnapshot(before, plan.snapshot);
  return plan.messages.length ? plan.messages.map((m) => `${m.kind}: ${m.subject}`).join(' | ') : 'nothing to send';
}

/** Starts the background check once the server is up; failures are logged, never fatal. */
export function startPantryNotifier(): void {
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await cds.tx(() => runPantryNotifier());
    } catch (error) {
      LOG.error('pantry notifier run failed', error);
    } finally {
      running = false;
    }
  };
  cds.once('served', async () => {
    await tick();
    const timer = setInterval(() => void tick(), TICK_MS);
    timer.unref();
    cds.once('shutdown', () => clearInterval(timer));
  });
}

