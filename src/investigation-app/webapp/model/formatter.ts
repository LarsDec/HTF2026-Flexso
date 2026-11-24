import DateFormat from "sap/ui/core/format/DateFormat";
import type { ValueState } from "sap/ui/core/library";

/** An ISO string as a date, or undefined when empty or invalid. */
function parse(iso: string | null | undefined): Date | undefined {
  const date = iso ? new Date(iso) : undefined;
  return date && !Number.isNaN(date.getTime()) ? date : undefined;
}

/**
 * Small display helpers for the investigation table.
 *
 * @namespace oakhaven.investigation.model
 */
export default {
  /** "Hits 2 rules": the template for one or many arrives from the i18n model. */
  severityText(severity: number | null, one: string, many: string): string {
    const count = Number(severity ?? 0);
    return (count === 1 ? one : many).replace("{0}", String(count));
  },

  severityIcon(severity: number | null): string {
    return Number(severity ?? 0) >= 3 ? "sap-icon://alert" : "sap-icon://warning";
  },

  severityState(severity: number | null): ValueState {
    return Number(severity ?? 0) >= 3 ? ("Error" as ValueState) : ("Warning" as ValueState);
  },

  /** First text when the flag is on, else the second. */
  pick(flag: boolean | null, whenOn: string, whenOff: string): string {
    return flag ? whenOn : whenOff;
  },

  /** Marked: error icon. Not marked yet: "to review", never a "trusted" look. */
  trustIcon(untrusted: boolean | null): string {
    return untrusted ? "sap-icon://error" : "sap-icon://pending";
  },

  trustState(untrusted: boolean | null): ValueState {
    return untrusted ? ("Error" as ValueState) : ("Warning" as ValueState);
  },

  /** Date and time in UTC (Oakhaven time), empty when unknown. */
  utcTime(iso: string | null | undefined): string {
    const date = parse(iso);
    return date ? DateFormat.getDateTimeInstance({ style: "medium", UTC: true }).format(date) : "";
  },

  /** Date and time in the browser's time zone, empty when unknown. */
  localTime(iso: string | null | undefined): string {
    const date = parse(iso);
    return date ? DateFormat.getDateTimeInstance({ style: "medium" }).format(date) : "";
  },

  /** Label of a timeline group: the hour or the day, in UTC. */
  bucketLabel(iso: string | null | undefined, granularity: string): string {
    const date = parse(iso);
    if (!date) return "";
    return granularity === "day"
      ? DateFormat.getDateInstance({ style: "medium", UTC: true }).format(date)
      : DateFormat.getDateTimeInstance({ pattern: "d MMM y, HH:00", UTC: true }).format(date);
  },

  isFilled(value: unknown): boolean {
    return value !== null && value !== undefined && value !== "";
  },

  /** The value, or the fallback text when it is empty. */
  orElse(value: string | null, fallback: string): string {
    return value && value.trim() !== "" ? value : fallback;
  },

  /** Fills `{0}` of an i18n template. */
  fill(template: string, value: string | number | null | undefined): string {
    return template.replace("{0}", String(value ?? ""));
  },

  /** True if the rules list includes the given rule. */
  hasRule(rules: string | null | undefined, ruleId: string): boolean {
    return (rules ?? "").split(",").includes(ruleId);
  },
};
