import Element from "sap/ui/core/Element";

/**
 * One pipe route on the map: plain data for PipeMap, bound to a WaterPipes entry.
 * Nothing is calculated here — status, status text and the "not to be trusted" text come from the server / i18n.
 *
 * @namespace water.pipes.control
 */
export default class PipeRoute extends Element {
  public static readonly metadata = {
    properties: {
      /** Pipe name, e.g. "NORTH-BRANCH-02". Also the key of the selection. */
      pipeID: { type: "string", defaultValue: "" },
      /** Route in grid units: "x,y x,y ..." (README, "The village map"). */
      mapPath: { type: "string", defaultValue: "" },
      /** fine | attention | alarm | unknown (computed by the server). */
      status: { type: "string", defaultValue: "unknown" },
      /** The status in words (translated), so the map never relies on colour alone. */
      statusText: { type: "string", defaultValue: "" },
      /** True when the line is marked "not to be trusted". */
      untrusted: { type: "boolean", defaultValue: false },
      /** The mark in words (translated). */
      untrustedText: { type: "string", defaultValue: "" },
    },
  };

  declare getPipeID: () => string;
  declare getMapPath: () => string;
  declare getStatus: () => string;
  declare getStatusText: () => string;
  declare getUntrusted: () => boolean;
  declare getUntrustedText: () => string;
}
