import Control from "sap/ui/core/Control";
import type RenderManager from "sap/ui/core/RenderManager";
import PipeRoute from "./PipeRoute";

/** The picture and its 8 x 8 grid, see README "The village map". */
const IMAGE = { width: 2048, height: 1536 };
const GRID = { x: 150, y: 120, width: 1750, height: 1280 };
const CELLS = 8;

/** Grid units (0-8, y counts from the south) to image pixels. */
function toPixel(point: string): { x: number; y: number } | undefined {
  const [x, y] = point.split(",").map(Number);
  if (x === undefined || y === undefined || Number.isNaN(x) || Number.isNaN(y)) return undefined;
  return {
    x: GRID.x + (x * GRID.width) / CELLS,
    y: GRID.y + ((CELLS - y) * GRID.height) / CELLS,
  };
}

/** "x,y x,y ..." to pixel points; unreadable points are skipped. */
function toPixels(mapPath: string): { x: number; y: number }[] {
  return mapPath
    .split(/\s+/)
    .filter((point) => point !== "")
    .map(toPixel)
    .filter((point): point is { x: number; y: number } => point !== undefined);
}

const round = (value: number): number => Math.round(value * 10) / 10;

/** An event that only needs its target. */
interface TargetEvent {
  target: unknown;
  preventDefault(): void;
}

/** The part of a DOM element we use to find the pressed route. */
interface ClosestCapable {
  closest(selector: string): { getAttribute(name: string): string | null } | null;
}

/** The part of the map's DOM we use to focus a route. */
interface RouteNode {
  getAttribute(name: string): string | null;
  scrollIntoView(options: { block: string; behavior: string }): void;
  focus(options: { preventScroll: boolean }): void;
}
interface RouteRoot {
  querySelectorAll(selector: string): ArrayLike<RouteNode>;
}

const canFindClosest = (target: unknown): target is ClosestCapable =>
  typeof target === "object" && target !== null && typeof (target as Partial<ClosestCapable>).closest === "function";

/**
 * The village map with every pipe route drawn on top (SVG polylines). Status is shown by line style
 * (solid / dashed / dotted) AND a text label, never by colour alone. Press or Enter on a route fires `select`.
 *
 * @namespace water.pipes.control
 */
export default class PipeMap extends Control {
  public static readonly metadata = {
    properties: {
      /** URL of the map image. */
      imageSrc: { type: "string", defaultValue: "" },
      /** Pipe that is highlighted (state owned by the view). */
      selectedPipeID: { type: "string", defaultValue: "" },
      /** Accessible name of the whole map. */
      ariaLabel: { type: "string", defaultValue: "" },
    },
    aggregations: {
      routes: { type: "water.pipes.control.PipeRoute", multiple: true, singularName: "route" },
    },
    events: {
      select: { parameters: { pipeID: { type: "string" } } },
    },
  };

  private pendingFocus = "";

  declare getImageSrc: () => string;
  declare getSelectedPipeID: () => string;
  declare getAriaLabel: () => string;
  declare getRoutes: () => PipeRoute[];
  declare fireSelect: (parameters: { pipeID: string }) => this;

  public static readonly renderer = {
    apiVersion: 2,

    render(rm: RenderManager, control: PipeMap): void {
      const selected = control.getSelectedPipeID();
      rm.openStart("div", control).class("waterMap").openEnd();
      rm.openStart("svg")
        .attr("viewBox", `0 0 ${IMAGE.width} ${IMAGE.height}`)
        .attr("role", "group")
        .attr("aria-label", control.getAriaLabel())
        .class("waterMapSvg")
        .openEnd();
      rm.openStart("image")
        .attr("href", control.getImageSrc())
        .attr("width", IMAGE.width)
        .attr("height", IMAGE.height)
        .attr("aria-hidden", "true")
        .openEnd()
        .close("image");
      for (const route of control.getRoutes()) {
        PipeMap.renderRoute(rm, route, selected);
      }
      rm.close("svg");
      rm.close("div");
    },
  };

  private static renderRoute(rm: RenderManager, route: PipeRoute, selected: string): void {
    const points = toPixels(route.getMapPath());
    const first = points[0];
    if (!first) return;
    const pointList = points.map((p) => `${round(p.x)},${round(p.y)}`).join(" ");
    const mid = points[Math.floor(points.length / 2)] ?? first;
    const isSelected = selected !== "" && selected === route.getPipeID();
    const name = route.getPipeID();
    const status = route.getStatus();
    const label = [name, route.getStatusText(), route.getUntrusted() ? route.getUntrustedText() : ""]
      .filter((part) => part !== "")
      .join(" · ");

    rm.openStart("g")
      .attr("data-pipe", name)
      .attr("tabindex", "0")
      .attr("role", "button")
      .attr("aria-pressed", isSelected ? "true" : "false")
      .attr("aria-label", label)
      .class("waterMapRoute")
      .class(`waterMapRoute--${status}`);
    if (route.getUntrusted()) rm.class("waterMapRoute--untrusted");
    if (isSelected) rm.class("waterMapRoute--selected");
    else if (selected !== "") rm.class("waterMapRoute--dim");
    rm.openEnd();
    rm.openStart("title").openEnd().text(label).close("title");
    rm.openStart("polyline").attr("points", pointList).class("waterMapHalo").openEnd().close("polyline");
    rm.openStart("polyline").attr("points", pointList).class("waterMapLine").openEnd().close("polyline");
    rm.openStart("polyline").attr("points", pointList).class("waterMapHit").openEnd().close("polyline");
    rm.openStart("text")
      .attr("x", round(mid.x))
      .attr("y", round(mid.y) - 30)
      .attr("text-anchor", "middle")
      .class("waterMapLabel")
      .openEnd()
      .text(label)
      .close("text");
    if (route.getUntrusted()) PipeMap.renderUntrustedBadge(rm, mid.x, mid.y);
    rm.close("g");
  }

  /** "Not to be trusted": a ring with a diagonal bar (own shape, neutral colour), never the alarm look. */
  private static renderUntrustedBadge(rm: RenderManager, x: number, y: number): void {
    const cx = round(x);
    const cy = round(y);
    const r = 26;
    rm.openStart("g").class("waterMapBadge").attr("aria-hidden", "true").openEnd();
    rm.openStart("circle").attr("cx", cx).attr("cy", cy).attr("r", r).class("waterMapBadgeRing").openEnd().close("circle");
    rm.openStart("line")
      .attr("x1", round(cx - r * 0.7))
      .attr("y1", round(cy + r * 0.7))
      .attr("x2", round(cx + r * 0.7))
      .attr("y2", round(cy - r * 0.7))
      .class("waterMapBadgeBar")
      .openEnd()
      .close("line");
    rm.close("g");
  }

  /** After a re-render (selection changed) the keyboard focus goes back to the route that was pressed. */
  public onAfterRendering(): void {
    if (this.pendingFocus === "") return;
    const pipeID = this.pendingFocus;
    this.pendingFocus = "";
    this.focusRoute(pipeID);
  }

  /**
   * Call BEFORE changing the selection: focus the route once it is rendered as selected
   * (immediately when it already is the selected one, so nothing will re-render).
   */
  public requestFocus(pipeID: string): void {
    if (this.getSelectedPipeID() === pipeID) this.focusRoute(pipeID);
    else this.pendingFocus = pipeID;
  }

  /** Scrolls the route into view and puts the keyboard focus on it. */
  public focusRoute(pipeID: string): void {
    const root = this.getDomRef() as unknown as RouteRoot | null;
    if (!root) return;
    for (const node of Array.from(root.querySelectorAll("[data-pipe]"))) {
      if (node.getAttribute("data-pipe") === pipeID) {
        node.scrollIntoView({ block: "nearest", behavior: "smooth" });
        node.focus({ preventScroll: true });
        return;
      }
    }
  }

  /** Mouse / touch. */
  public onclick(event: TargetEvent): void {
    this.selectFrom(event);
  }

  /** Keyboard: Enter and Space press the focused route. */
  public onsapenter(event: TargetEvent): void {
    this.selectFrom(event);
  }

  public onsapspace(event: TargetEvent): void {
    this.selectFrom(event);
  }

  private selectFrom(event: TargetEvent): void {
    const target = event.target;
    const pipeID = canFindClosest(target) ? target.closest("[data-pipe]")?.getAttribute("data-pipe") : null;
    if (!pipeID) return;
    event.preventDefault();
    this.pendingFocus = pipeID;
    this.fireSelect({ pipeID });
  }
}
