/**
 * Where pantry messages go (spec N7). Every channel implements `NotificationChannel`, so a text
 * message (SMS) or a real mail server can be added later without touching the notification rules.
 *
 * - EmailOutboxChannel: there is no mail server in this setup and no mail library may be installed,
 *   so the "email" is written to the OutboundMessages table (the outbox) and logged. Swap this
 *   class for an SMTP implementation to really send it.
 * - InAppChannel: one Notifications row per changed item, shown in the bakery app.
 */
import type { CdsApi } from './food-cds-types';
import type { PantryMessage } from '../domain/food-notifier';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cds = require('@sap/cds') as CdsApi;
const { INSERT } = cds.ql;
const LOG = cds.log('pantry-notifier');

export interface NotificationChannel {
  readonly name: string;
  send(message: PantryMessage): Promise<void>;
}

export class EmailOutboxChannel implements NotificationChannel {
  public readonly name = 'email';

  public constructor(private readonly recipient: string | null) {}

  public async send(message: PantryMessage): Promise<void> {
    if (!this.recipient) LOG.warn('no recipient e-mail set in the pantry settings; message kept in the outbox only');
    await INSERT.into('oakhaven.curse.OutboundMessages').entries({
      channel: this.name,
      kind: message.kind,
      recipient: this.recipient,
      subject: message.subject,
      body: message.body,
    });
    LOG.info(`email (${message.kind}) to ${this.recipient ?? '<not set>'}: ${message.subject}`);
  }
}

export class InAppChannel implements NotificationChannel {
  public readonly name = 'in-app';

  public async send(message: PantryMessage): Promise<void> {
    if (message.entries.length === 0) return;
    const prefix = message.kind === 'immediate' ? 'Urgent' : message.entries.some((e) => e.fromStatus === null) ? 'Overview' : 'Daily digest';
    await INSERT.into('oakhaven.curse.Notifications').entries(
      ...message.entries.map((entry) => ({ item_ID: entry.itemID, message: `${prefix}: ${entry.text}`, acknowledged: false })),
    );
  }
}
