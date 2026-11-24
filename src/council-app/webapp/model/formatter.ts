import formatMessage from "sap/base/strings/formatMessage";

/** The part of a ResourceBundle the formatters need. */
interface Texts {
  getText(key: string, args?: string[]): string;
}

let texts: Texts | undefined;

/** Lookup of a text; empty until the i18n bundle is loaded (the views re-format on `view>/ready`). */
function t(key: string, ...args: Array<string | number>): string {
  if (!texts) return "";
  return args.length > 0 ? texts.getText(key, args.map(String)) : texts.getText(key);
}

/** "waterAlarm" -> "WaterAlarm"; empty while the data is still loading (parts are undefined then). */
const cap = (word: string | null | undefined): string => (word ? word.charAt(0).toUpperCase() + word.slice(1) : "");
const num = (value: number | null | undefined): string | number => value ?? "-";

/**
 * Formatters for the Council app. They only translate codes from the server into i18n texts;
 * no rule is decided here. Every formatter takes the `view>/ready` flag as its last binding part.
 *
 * @namespace oakhaven.council.model
 */
const formatter = {
  /** Hand the loaded i18n bundle to the formatters. */
  setTexts(bundle: Texts): void {
    texts = bundle;
  },

  /** A pattern with placeholders filled in (apostrophes doubled in the pattern, as MessageFormat wants). */
  msg(pattern: string | null | undefined, ...args: Array<string | number | null | undefined>): string {
    return pattern ? formatMessage(pattern, args.map((arg) => arg ?? "-")) : "";
  },

  /** "Made on {0}" with the server's own formatted date. */
  madeOn(pattern: string | null | undefined, date: string | null | undefined): string {
    return pattern && date ? formatMessage(pattern, [date]) : "";
  },

  levelText(level: string | null, _ready: boolean): string {
    return level ? t(`level${cap(level)}`) : "";
  },

  meaning(level: string | null, _ready: boolean): string {
    return level ? t(`meaning${cap(level)}`) : "";
  },

  problemTitle(area: string | undefined, places: string | null, _ready: boolean): string {
    if (!area) return "";
    if (area === "food") return t("areaFood");
    return places ? t("feeds", places) : t("areaWater");
  },

  facts(
    area: string,
    flow: number | null,
    nominal: number | null,
    percent: number | null,
    pressure: number | null,
    quantity: number | null,
    minimum: number | null,
    unit: string | null,
    _ready: boolean
  ): string {
    if (!area) return "";
    return area === "food"
      ? t("factsFood", num(quantity), num(minimum), unit ?? "")
      : t("factsWater", num(flow), num(nominal), num(percent), num(pressure));
  },

  people(kind: string | null | undefined, count: number | null, _ready: boolean): string {
    if (!kind) return "";
    switch (kind) {
      case "families":
        return t("peopleFamilies", num(count));
      case "wholeVillage":
        return t("peopleWholeVillage");
      case "nobody":
        return t("peopleNobody");
      default:
        return t("peopleUnknown");
    }
  },

  pipeNote(note: string | null, _ready: boolean): string {
    return note ? t(`note${cap(note)}`) : "";
  },

  trustNote(note: string | null, subject: string | null, _ready: boolean): string {
    return note ? t(`trust${cap(note)}`, subject ?? "-") : "";
  },

  /** Tie text: water row names the supplier it feeds, food row the pipe that feeds its supplier. */
  tie(area: string, via: string | null, tiedTo: string | null, _ready: boolean): string {
    if (!via || !tiedTo) return "";
    return area === "water" ? t("tieWater", via, tiedTo) : t("tieFood", via, tiedTo);
  },

  tieUntrusted(via: string | null, untrusted: string | null, _ready: boolean): string {
    return via && untrusted ? t("tieUntrusted", untrusted) : "";
  },


  tieNotKnown(via: string | null, tiedTo: string | null, untrusted: string | null, _ready: boolean): string {
    return via && (tiedTo || untrusted) ? t("tieNotKnown") : "";
  },

  fineLine(water: string | null, food: string | null, _ready: boolean): string {
    return t("fineLine", water || t("fineNone"), food || t("fineNone"));
  },

  lineText(kind: string | undefined, subject: string | undefined, parent: string | null, _ready: boolean): string {
    if (!kind) return "";
    return t(`line${cap(kind)}`, subject ?? "-", parent ?? "-");
  },

  valueText(kind: string, value: number | null, unit: string | null, compared: number | null, _ready: boolean): string {
    if (value === null || value === undefined) return "";
    if (kind === "sensor" && compared !== null && compared !== undefined) return t("valueConflict", value, compared);
    return t("valueRecorded", value, unit ?? "");
  },

  markText(source: string | undefined, by: string | null, when: string | null, _ready: boolean): string {
    if (!source) return "";
    if (source !== "mark") return t("foundByApp");
    return t("markedByOn", by ?? "-", when ?? "-");
  },

  effectText(effect: string | undefined, _ready: boolean): string {
    if (!effect) return "";
    switch (effect) {
      case "notRanked":
        return t("effectNotRanked");
      case "pipeRankedOnOwnReading":
        return t("effectPipeOwnReading");
      case "notUsedOnPage":
        return t("effectNotUsed");
      case "notUsedForPlacesAndTies":
        return t("effectNoPlacesTies");
      default:
        return t("effectNotFound");
    }
  },

  notTrusted(_ready: boolean): string {
    return t("notTrusted");
  },
};

export default formatter;
