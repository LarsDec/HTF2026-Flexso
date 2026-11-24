import Localization from "sap/base/i18n/Localization";
import formatMessage from "sap/base/strings/formatMessage";
import DateFormat from "sap/ui/core/format/DateFormat";
import NumberFormat from "sap/ui/core/format/NumberFormat";

/**
 * Formatters for the Water app. Only translation: the status itself comes from the server.
 *
 * @namespace water.pipes.model
 */
const formatter = {
  /**
   * Plain-words reason for a source conflict, with who/when the sensor line was last changed.
   * The date arrives already formatted by an OData type in the binding.
   */
  conflictDetail(
    detail: string,
    noAudit: string,
    sensorID: string | null | undefined,
    sensorFlow: number | null | undefined,
    nominalFlow: number | null | undefined,
    changedBy: string | null | undefined,
    changedAt: string | null | undefined
  ): string {
    const text = changedBy && changedAt ? detail : noAudit;
    return formatMessage(text, [sensorID ?? "", sensorFlow ?? "", nominalFlow ?? "", changedBy ?? "", changedAt ?? ""]);
  },

  /** "Reason: ... Marked by Maren on 24 Nov 2026, 12:44 UTC." The date arrives formatted (UTC) from the binding. */
  untrustedDetail(
    pattern: string,
    reason: string | null | undefined,
    markedBy: string | null | undefined,
    markedAt: string | null | undefined
  ): string {
    return formatMessage(pattern, [reason ?? "", markedBy ?? "", markedAt ?? ""]);
  },

  /** Fills the {0}, {1}... placeholders of an i18n text (used for the filter counts). */
  messageText(pattern: string, ...args: (string | number | null | undefined)[]): string {
    return formatMessage(pattern, args.map((arg) => arg ?? ""));
  },

  /** "3 min ago", "1 h 5 min ago", "Just now"; "No reading" when the age is unknown. */
  readingAge(
    minutes: number | null | undefined,
    now: string,
    minutesAgo: string,
    hoursAgo: string,
    none: string
  ): string {
    if (minutes === null || minutes === undefined) return none;
    if (minutes < 1) return now;
    if (minutes < 60) return formatMessage(minutesAgo, [minutes]);
    return formatMessage(hoursAgo, [Math.floor(minutes / 60), minutes % 60]);
  },

  /** Tooltip with the moment of the reading (now minus the age the server computed, to the minute). */
  readingTooltip(minutes: number | null | undefined, pattern: string, none: string): string {
    if (minutes === null || minutes === undefined) return none;
    const at = new Date(Date.now() - minutes * 60_000);
    return formatMessage(pattern, [DateFormat.getDateTimeInstance({ style: "medium" }).format(at)]);
  },

  /** "120 of 200 L/min (60%)". Decimals arrive as strings from OData V4. */
  flowText(
    pattern: string,
    none: string,
    flow: string | number | null | undefined,
    nominal: string | number | null | undefined
  ): string {
    const current = flow === null || flow === undefined ? NaN : Number(flow);
    const normal = nominal === null || nominal === undefined ? NaN : Number(nominal);
    if (Number.isNaN(current) || Number.isNaN(normal) || normal === 0) return none;
    const numbers = NumberFormat.getFloatInstance({ maxFractionDigits: 1 });
    const percent = NumberFormat.getFloatInstance({ maxFractionDigits: 0 });
    return formatMessage(pattern, [numbers.format(current), numbers.format(normal), percent.format((current / normal) * 100)]);
  },

  /** "62 PSI". */
  pressureText(pattern: string, none: string, pressure: string | number | null | undefined): string {
    if (pressure === null || pressure === undefined || Number.isNaN(Number(pressure))) return none;
    return formatMessage(pattern, [NumberFormat.getFloatInstance({ maxFractionDigits: 1 }).format(Number(pressure))]);
  },

  /** Short last repair for the table: "24 Nov 2026 · Dana"; "None logged" without a repair. */
  lastRepairShort(
    pattern: string,
    none: string,
    date: string | null | undefined,
    repairedBy: string | null | undefined,
    issue?: string | null
  ): string {
    if (!date) return none;
    return formatMessage(pattern, [date, repairedBy ?? "", issue ?? ""]);
  },

  /** Accessible name of a plan card / table action: "Mark as repaired: NORTH-BRANCH-02". */
  withPipe(pattern: string, pipeID: string | null | undefined): string {
    return formatMessage(pattern, [pipeID ?? ""]);
  },

  /** "Sensor SENS-004 not to be trusted". */
  untrustedSensorText(pattern: string, sensorIDs: string | null | undefined): string {
    return formatMessage(pattern, [sensorIDs ?? ""]);
  },

  /**
   * "Last repair: 24 Nov 2026 · Pipe fixed by Dana · cracked joint". The date arrives already
   * formatted by an OData type in the binding; the sentence comes from i18n.
   */
  lastRepairText(
    pattern: string,
    date: string | null | undefined,
    repairedBy: string | null | undefined,
    issue: string | null | undefined
  ): string {
    return formatMessage(pattern, [date ?? "", repairedBy ?? "", issue ?? ""]);
  },

  /**
   * "1st priority" / "2nd priority": the server's morningRank as an ordinal, words from i18n
   * (the ordinal plural category of the UI language picks one / two / few / other).
   * Empty when the pipe is not in the plan.
   */
  rankText(
    rank: number | null | undefined,
    pattern: string,
    one: string,
    two: string,
    few: string,
    other: string
  ): string {
    if (rank === null || rank === undefined) return "";
    const category = new Intl.PluralRules(Localization.getLanguage(), { type: "ordinal" }).select(rank);
    const ordinal = category === "one" ? one : category === "two" ? two : category === "few" ? few : other;
    return formatMessage(pattern, [formatMessage(ordinal, [rank])]);
  },

  /**
   * Picks the translated status text for the server's healthStatus.
   * Anything that is not fine/attention/alarm shows the "unknown" text, never a green "fine".
   */
  statusText(
    healthStatus: string | null | undefined,
    fine: string,
    attention: string,
    alarm: string,
    unknown: string
  ): string {
    switch (healthStatus) {
      case "fine":
        return fine;
      case "attention":
        return attention;
      case "alarm":
        return alarm;
      default:
        return unknown;
    }
  },
};

export default formatter;
