/**
 * Pantry notifications (BakkerySpec.md, rules N1–N7) — the decision logic, as a pure function.
 *
 * `planNotifications(now, items, snapshot, settings)` answers: "given the clock, the current status
 * of every item and what we told Tobin last time, which messages go out now, and what do we
 * remember afterwards?" It does not send or store anything itself; `srv/lib/food-notifier-runner.ts`
 * loads the snapshot, sends the messages through the channels and saves the new snapshot.
 *
 * - N1: per item we remember the last *notified* (status, data error) pair. Only a difference is news.
 * - N2: one digest per day at the digest time, "Got worse" / "Fine again", critical items first.
 * - N3: a critical item turning Late is sent at once (max once per item per 24 h), not in quiet hours.
 * - N4: changes are compared when the message is built, so OK → Late → OK in between is no news.
 * - N5: no changes → no message.
 * - N6: no stored state at all → one digest with every item that is not OK.
 */
import { isInWindow, localTimeIn } from './food-calendar';
import { STATUS_RANK, type ReorderStatus } from './food-reorder';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The current state of one item, as computed by the reorder calculation. */
export interface TrackedItem {
  readonly itemID: string;
  readonly name: string;
  readonly unit: string;
  readonly isCritical: boolean;
  readonly inHouse: boolean;
  readonly status: ReorderStatus;
  readonly dataError: boolean;
  readonly orderByDate: string | null;
  readonly orderQuantity: string | null;
  readonly supplierName: string | null;
}

/** What we last told Tobin about one item. */
export interface NotifiedState {
  readonly itemID: string;
  readonly status: ReorderStatus;
  readonly dataError: boolean;
  /** ISO timestamp of the last immediate message (N3), or null. */
  readonly lastImmediateAt: string | null;
}

/** Everything the notifier remembers between runs (persisted by the runner). */
export interface NotifierSnapshot {
  readonly states: readonly NotifiedState[];
  /** Local date (YYYY-MM-DD) of the last digest run, or null before the first one. */
  readonly lastDigestDate: string | null;
}

export interface NotifierSettings {
  readonly timeZone: string;
  /** Minutes after local midnight: 300 = 05:00. */
  readonly digestMinutes: number;
  readonly quietStartMinutes: number;
  readonly quietEndMinutes: number;
}

export type ChangeDirection = 'worse' | 'better';

/** One line of a message: one item that changed. */
export interface ChangeEntry {
  readonly itemID: string;
  readonly name: string;
  readonly isCritical: boolean;
  readonly direction: ChangeDirection;
  /** null on the first run. */
  readonly fromStatus: ReorderStatus | null;
  readonly fromDataError: boolean;
  readonly toStatus: ReorderStatus;
  readonly toDataError: boolean;
  readonly text: string;
}

/** A message to send, independent of the channel (email, in-app …). */
export interface PantryMessage {
  readonly kind: 'digest' | 'immediate';
  readonly subject: string;
  readonly body: string;
  readonly entries: readonly ChangeEntry[];
}

export interface NotificationPlan {
  readonly messages: readonly PantryMessage[];
  readonly snapshot: NotifierSnapshot;
}

const STATUS_LABEL: Readonly<Record<ReorderStatus, string>> = { OK: 'OK', ORDER_TODAY: 'Order today', LATE: 'Late' };

function label(status: ReorderStatus | null, dataError: boolean): string {
  if (status === null) return 'new';
  return dataError ? `${STATUS_LABEL[status]} + data error` : STATUS_LABEL[status];
}

/** N1: worse = higher status rank or a data error appearing; everything else that differs is better. */
function directionOf(from: NotifiedState | undefined, item: TrackedItem): ChangeDirection | undefined {
  if (!from) return item.status === 'OK' && !item.dataError ? undefined : 'worse';
  if (from.status === item.status && from.dataError === item.dataError) return undefined;
  const statusWorse = STATUS_RANK[item.status] > STATUS_RANK[from.status];
  const dataErrorAppeared = item.dataError && !from.dataError;
  return statusWorse || dataErrorAppeared ? 'worse' : 'better';
}

/** N7: "Flour (critical): OK → Late · order now · 65 KG · North Mill". */
function entryText(item: TrackedItem, from: NotifiedState | undefined): string {
  const name = item.isCritical ? `${item.name} (critical)` : item.name;
  const change = `${label(from?.status ?? null, from?.dataError ?? false)} → ${label(item.status, item.dataError)}`;
  let when: string;
  if (item.status === 'LATE') when = 'order now (late)';
  else if (item.status === 'ORDER_TODAY') when = 'order today';
  else when = item.orderByDate ? `order by ${item.orderByDate}` : 'no order needed';
  const parts = [`${name}: ${change}`, when];
  if (item.orderQuantity !== null && item.status !== 'OK') parts.push(`${item.orderQuantity} ${item.unit}`);
  if (item.supplierName) parts.push(item.supplierName);
  return parts.join(' · ');
}

function makeEntry(item: TrackedItem, from: NotifiedState | undefined, direction: ChangeDirection): ChangeEntry {
  return {
    itemID: item.itemID,
    name: item.name,
    isCritical: item.isCritical,
    direction,
    fromStatus: from?.status ?? null,
    fromDataError: from?.dataError ?? false,
    toStatus: item.status,
    toDataError: item.dataError,
    text: entryText(item, from),
  };
}

/** Critical first, then the most serious status, then by name. */
function compareEntries(a: ChangeEntry, b: ChangeEntry): number {
  if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
  const rank = STATUS_RANK[b.toStatus] - STATUS_RANK[a.toStatus];
  return rank !== 0 ? rank : a.name.localeCompare(b.name);
}

function digestMessage(entries: ChangeEntry[], firstRun: boolean): PantryMessage {
  const sorted = [...entries].sort(compareEntries);
  const worse = sorted.filter((e) => e.direction === 'worse');
  const better = sorted.filter((e) => e.direction === 'better');
  let subject: string;
  if (firstRun) {
    subject = `Pantry: ${worse.length} ${worse.length === 1 ? 'item needs' : 'items need'} attention`;
  } else {
    const counts = [worse.length ? `${worse.length} worse` : '', better.length ? `${better.length} fine again` : ''];
    subject = `Pantry: ${counts.filter(Boolean).join(', ')}`;
  }
  const lines: string[] = [];
  if (worse.length) lines.push(firstRun ? 'Needs attention:' : 'Got worse:', ...worse.map((e) => `- ${e.text}`));
  if (better.length) lines.push(...(lines.length ? [''] : []), 'Fine again:', ...better.map((e) => `- ${e.text}`));
  return { kind: 'digest', subject, body: lines.join('\n'), entries: [...worse, ...better] };
}

function immediateMessage(entries: ChangeEntry[]): PantryMessage {
  const sorted = [...entries].sort(compareEntries);
  const names = sorted.map((e) => e.name).join(', ');
  return {
    kind: 'immediate',
    subject: `Pantry: ${names} ${sorted.length === 1 ? 'is' : 'are'} Late — order now`,
    body: sorted.map((e) => `- ${e.text}`).join('\n'),
    entries: sorted,
  };
}

function remember(item: TrackedItem, lastImmediateAt: string | null): NotifiedState {
  return { itemID: item.itemID, status: item.status, dataError: item.dataError, lastImmediateAt };
}

/** Decides which messages go out at `now` and what to remember afterwards (N1–N7). */
export function planNotifications(
  now: Date,
  items: readonly TrackedItem[],
  snapshot: NotifierSnapshot,
  settings: NotifierSettings,
): NotificationPlan {
  const local = localTimeIn(now, settings.timeZone);
  const quiet = isInWindow(local.minutes, settings.quietStartMinutes, settings.quietEndMinutes);
  const digestTimeReached = local.minutes >= settings.digestMinutes;
  const tracked = items.filter((item) => !item.inHouse); // R6: bread is never notified
  const states = new Map(snapshot.states.map((s) => [s.itemID, s]));
  const messages: PantryMessage[] = [];

  // N6: first run — one overview of everything that is not OK, then track changes from there.
  if (snapshot.states.length === 0) {
    if (quiet) return { messages, snapshot };
    const entries = tracked
      .filter((item) => item.status !== 'OK' || item.dataError)
      .map((item) => makeEntry(item, undefined, 'worse'));
    if (entries.length) messages.push(digestMessage(entries, true));
    return {
      messages,
      snapshot: {
        states: tracked.map((item) => remember(item, null)),
        lastDigestDate: digestTimeReached ? local.date : snapshot.lastDigestDate,
      },
    };
  }

  let lastDigestDate = snapshot.lastDigestDate;

  // N2 + N4 + N5: the digest compares *now* with what was last notified. It runs before the
  // immediate check, so an item held during quiet hours is reported in the digest, not twice.
  if (digestTimeReached && (lastDigestDate === null || lastDigestDate < local.date)) {
    const entries: ChangeEntry[] = [];
    for (const item of tracked) {
      const from = states.get(item.itemID);
      const direction = directionOf(from, item);
      if (!direction) continue;
      entries.push(makeEntry(item, from, direction));
      states.set(item.itemID, remember(item, from?.lastImmediateAt ?? null));
    }
    if (entries.length) messages.push(digestMessage(entries, false));
    lastDigestDate = local.date;
  }

  // N3: critical items that became Late, outside quiet hours, max once per 24 h per item.
  if (!quiet) {
    const urgent: ChangeEntry[] = [];
    for (const item of tracked) {
      if (!item.isCritical || item.status !== 'LATE') continue;
      const from = states.get(item.itemID);
      if (from?.status === 'LATE') continue;
      if (from?.lastImmediateAt && now.getTime() - Date.parse(from.lastImmediateAt) < DAY_MS) continue;
      urgent.push(makeEntry(item, from, 'worse'));
      states.set(item.itemID, remember(item, now.toISOString()));
    }
    if (urgent.length) messages.push(immediateMessage(urgent));
  }

  // Items added to the pantry later start being tracked at their next change (they have no state yet).
  return { messages, snapshot: { states: [...states.values()], lastDigestDate } };
}
