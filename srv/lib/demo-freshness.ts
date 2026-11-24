/**
 * Demo sensor feed: stands in for the real sensors of Oakhaven.
 *
 * CSV seed data is static text, so the `lastReading` written there is already old by the time you
 * run the app. Once the server is up, this feed re-stamps `Sensors.lastReading` of the village
 * sensors with the current time, and then again every 20 seconds.
 *
 * It deliberately uses a plain SQL statement instead of a CQL `UPDATE`: `Sensors` is a `managed`
 * entity, and every CQL UPDATE on it would also set `modifiedAt`/`modifiedBy`. A sensor reporting
 * is not somebody editing the record, so the feed touches `lastReading` and nothing else.
 *
 * Repair hold (our demo choice, not a villager rule): for 14 minutes after a person logged a repair
 * on a pipe, the feed skips that pipe's sensors, so the "repaired" state stays visible in a demo
 * instead of the alarm returning within 20 seconds.
 */

/** Sensors that report "live" while the server runs. */
export const LIVE_DEMO_SENSOR_IDS = ['SENS-001', 'SENS-002', 'SENS-003', 'SENS-004', 'SENS-005', 'SENS-006'] as const;

/** How often the feed re-stamps the sensors. */
const SENSOR_FEED_INTERVAL_MS = 20_000;

/** Table of `oakhaven.curse.Sensors` (CAP replaces the dots of the entity name by underscores). */
const SENSORS_TABLE = 'oakhaven_curse_Sensors';

/** Only `lastReading` — never the managed fields. Values are bound as parameters. */
const REPAIRS_TABLE = 'oakhaven_curse_Repairs';

/** A pipe repaired by a person is "repaired" for this long: the feed does not re-stamp its sensors (demo only). */
const REPAIR_HOLD_MS = 14 * 60 * 1000;

const STAMP_SQL = `UPDATE ${SENSORS_TABLE} SET lastReading = ? WHERE sensorID IN (${LIVE_DEMO_SENSOR_IDS.map(() => '?').join(', ')})
  AND NOT EXISTS (SELECT 1 FROM ${REPAIRS_TABLE} r WHERE r.pipe_ID = ${SENSORS_TABLE}.pipe_ID
    AND r.repairedBy <> 'system' AND r.repairDate > ${SENSORS_TABLE}.lastReading AND r.repairDate > ? AND r.repairDate <= ?)`;

/** The slice of the `cds` facade this module uses. */
interface CdsApi {
  readonly db: { run(sql: string, values: readonly unknown[]): Promise<unknown> };
  once(event: string, handler: () => unknown): void;
  log(module: string): { warn(...args: readonly unknown[]): void };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cds = require('@sap/cds') as CdsApi;

/** CDS `DateTime` as CAP stores it: ISO 8601 with seconds precision, e.g. 2026-11-24T09:30:00Z. */
function toCdsDateTime(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

/** Sets `lastReading` of every {@link LIVE_DEMO_SENSOR_IDS} sensor to `now`. */
export async function refreshLiveDemoReadings(now: Date = new Date()): Promise<void> {
  const holdFrom = toCdsDateTime(new Date(now.getTime() - REPAIR_HOLD_MS));
  await cds.db.run(STAMP_SQL, [toCdsDateTime(now), ...LIVE_DEMO_SENSOR_IDS, holdFrom, now.toISOString()]);
}

/** Starts the feed once the server is up; failures are logged, never fatal. */
export function startDemoSensorFeed(): void {
  const refresh = async (): Promise<void> => {
    try {
      await refreshLiveDemoReadings();
    } catch (error) {
      cds.log('sensor-feed').warn('could not refresh the demo sensor readings', error);
    }
  };
  cds.once('served', async () => {
    await refresh();
    const timer = setInterval(() => void refresh(), SENSOR_FEED_INTERVAL_MS);
    timer.unref();
    cds.once('shutdown', () => clearInterval(timer));
  });
}
