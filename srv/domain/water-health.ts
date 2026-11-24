/**
 * Pure status logic for water pipes (rules of Maren, the water keeper).
 * No @sap/cds, no I/O: `now` is always a parameter so everything is testable.
 */
import { toDate, toNumber, type NumericInput } from './numbers';

export type HealthStatus = 'fine' | 'attention' | 'alarm' | 'unknown';

export interface PipeReading {
  currentFlowRate: NumericInput;
  nominalFlowRate: NumericInput;
  currentPressure: NumericInput;
  lastReadingAt: Date | string | null | undefined;
}

export interface PipeAssessment {
  status: HealthStatus;
  reason: string;
}

/** Thresholds from Maren. Comparisons are strict "less than": the limit itself is the better status. */
export const FLOW_RATIO_ALARM = 0.5;
export const FLOW_RATIO_ATTENTION = 0.8;
export const PRESSURE_ALARM_PSI = 25;
export const PRESSURE_ATTENTION_PSI = 40;
/** A reading is valid for exactly 15:00 minutes; 15:01 is already unknown. */
export const MAX_READING_AGE_MS = 15 * 60 * 1000;

type Severity = 'fine' | 'attention' | 'alarm';
const SEVERITY_RANK: Readonly<Record<Severity, number>> = { fine: 0, attention: 1, alarm: 2 };

function classify(value: number, alarmBelow: number, attentionBelow: number): Severity {
  if (value < alarmBelow) return 'alarm';
  if (value < attentionBelow) return 'attention';
  return 'fine';
}

/** Whole minutes since `lastReadingAt` (never negative), or null when there is no valid timestamp. */
export function readingAgeMinutes(lastReadingAt: Date | string | null | undefined, now: Date): number | null {
  const last = toDate(lastReadingAt);
  if (!last) return null;
  return Math.max(0, Math.floor((now.getTime() - last.getTime()) / 60000));
}

export function assessPipe(reading: PipeReading, now: Date): PipeAssessment {
  const last = toDate(reading.lastReadingAt);
  const flow = toNumber(reading.currentFlowRate);
  const nominal = toNumber(reading.nominalFlowRate);
  const pressure = toNumber(reading.currentPressure);

  // Unknown beats every other status: never show green on data we cannot trust.
  if (!last) return { status: 'unknown', reason: 'No sensor reading available.' };
  const ageMs = now.getTime() - last.getTime();
  if (ageMs > MAX_READING_AGE_MS) {
    return { status: 'unknown', reason: `Last reading is ${Math.floor(ageMs / 60000)} minutes old (limit 15).` };
  }
  if (flow === null || nominal === null || pressure === null || nominal <= 0) {
    return { status: 'unknown', reason: 'Flow, nominal flow or pressure is missing or invalid.' };
  }

  const ratio = flow / nominal;
  const percent = Math.round(ratio * 100);
  const flowSeverity = classify(ratio, FLOW_RATIO_ALARM, FLOW_RATIO_ATTENTION);
  const pressureSeverity = classify(pressure, PRESSURE_ALARM_PSI, PRESSURE_ATTENTION_PSI);
  const worst = SEVERITY_RANK[flowSeverity] >= SEVERITY_RANK[pressureSeverity] ? flowSeverity : pressureSeverity;

  if (worst === 'fine') {
    return { status: 'fine', reason: `Flow ${flow} of ${nominal} L/min (${percent}% of normal), pressure ${pressure} PSI.` };
  }
  const parts: string[] = [];
  if (flowSeverity !== 'fine') parts.push(`flow ${flow} of ${nominal} L/min (${percent}% of normal)`);
  if (pressureSeverity !== 'fine') parts.push(`pressure ${pressure} PSI`);
  const text = `${parts.join(' and ')}: ${worst === 'alarm' ? 'alarm' : 'needs attention'}.`;
  return { status: worst, reason: text.charAt(0).toUpperCase() + text.slice(1) };
}

/** UI5 ValueState for a status (unknown => None, never Success). */
export function healthState(status: HealthStatus): 'Error' | 'Warning' | 'Success' | 'None' {
  switch (status) {
    case 'alarm':
      return 'Error';
    case 'attention':
      return 'Warning';
    case 'fine':
      return 'Success';
    case 'unknown':
      return 'None';
  }
}

/** SAP icon (sap-icon:// name) for a status. */
export function healthIcon(status: HealthStatus): string {
  switch (status) {
    case 'alarm':
      return 'sap-icon://alert';
    case 'attention':
      return 'sap-icon://warning';
    case 'fine':
      return 'sap-icon://sys-enter-2';
    case 'unknown':
      return 'sap-icon://question-mark';
  }
}
