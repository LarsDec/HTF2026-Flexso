import type Button from "sap/m/Button";
import type { Button$PressEvent } from "sap/m/Button";
import type { ListItemBase$PressEvent } from "sap/m/ListItemBase";
import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import type ResourceBundle from "sap/base/i18n/ResourceBundle";
import Device from "sap/ui/Device";
import type Event from "sap/ui/base/Event";
import type Control from "sap/ui/core/Control";
import Fragment from "sap/ui/core/Fragment";
import DateFormat from "sap/ui/core/format/DateFormat";
import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import Element from "sap/ui/core/Element";
import type Context from "sap/ui/model/odata/v4/Context";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import type ResourceModel from "sap/ui/model/resource/ResourceModel";
import type PipeMap from "../control/PipeMap";
import formatter from "../model/formatter";

/** Parameters of the events this controller listens to. */
interface LoadEventParameters {
  error?: Error;
}
interface SelectEventParameters {
  pipeID: string;
}

/**
 * The one page of the Water app. The pipes, the morning plan and the map routes are bound to the
 * OData V4 model (the server sorts and picks the top 2); the JSONModel "view" only holds view state.
 *
 * @namespace water.pipes.controller
 */
export default class Main extends Controller {
  public readonly formatter = formatter;
  private logRepairDialog: Dialog | undefined;
  private historyDialog: Dialog | undefined;
  /** Control that opened the dialog: it gets the focus back when the dialog closes. */
  private returnFocusId = "";

  public onInit(): void {
    const view = this.getView();
    view?.setModel(
      new JSONModel({
        busy: true,
        selectedID: "",
        planEmpty: false,
        filter: "all",
        filterEmpty: false,
        counts: { all: 0, alarm: 0, unknown: 0, attention: 0, fine: 0 },
        mapSrc: sap.ui.require.toUrl("water/pipes/img/oakhaven-map.jpg"),
      }),
      "view",
    );
    view?.setModel(new JSONModel({}), "repair");
    const device = new JSONModel(Device);
    device.setDefaultBindingMode("OneWay");
    view?.setModel(device, "device");
  }

  public onRefresh(): void {
    (this.getOwnerComponent()?.getModel() as ODataModel | undefined)?.refresh();
  }

  public onExit(): void {
    this.logRepairDialog?.destroy();
    this.logRepairDialog = undefined;
    this.historyDialog?.destroy();
    this.historyDialog = undefined;
  }

  /** The table starts loading: busy state. */
  public onPipesRequested(): void {
    this.viewState().setProperty("/busy", true);
  }

  /** The table finished loading: busy off, error message when it failed. */
  public onPipesReceived(event: Event<LoadEventParameters>): void {
    this.viewState().setProperty("/busy", false);
    this.syncFromTable();
    void this.reportLoadError(event);
  }

  /** The plan list finished loading: empty state and error message. */
  public onPlanReceived(event: Event<LoadEventParameters>): void {
    const binding = (this.byId("planList") as Control | undefined)?.getBinding("items") as ODataListBinding | undefined;
    this.viewState().setProperty("/planEmpty", !event.getParameter("error") && binding?.getLength() === 0);
    void this.reportLoadError(event);
  }

  /** Map route pressed: select it (press again to clear). The map keeps the keyboard focus. */
  public onSelectPipe(event: Event<SelectEventParameters>): void {
    const pipeID = event.getParameter("pipeID");
    this.selectPipe(this.viewState().getProperty("/selectedID") === pipeID ? "" : pipeID);
  }

  /** Table row pressed: select it, the detail panel and the map follow. */
  public onSelectRow(event: ListItemBase$PressEvent): void {
    const pipeID = event.getSource().getBindingContext()?.getProperty("pipeID") as string | undefined;
    if (pipeID) this.selectPipe(pipeID);
  }

  /** Plan item pressed: select it and bring the map (and the detail next to it) into view. */
  public onSelectPlan(event: ListItemBase$PressEvent): void {
    const pipeID = event.getSource().getBindingContext()?.getProperty("pipeID") as string | undefined;
    if (!pipeID) return;
    (this.byId("pipeMap") as PipeMap | undefined)?.requestFocus(pipeID);
    this.selectPipe(pipeID);
  }

  /** The close button of the detail panel. */
  public onCloseDetail(): void {
    this.selectPipe("");
  }

  /** Quick filter of the table. */
  public onFilterChange(): void {
    this.updateFilterEmpty();
  }

  /** "Mark as repaired" in the plan and "Log repair" in the table: the dialog for the pressed row's pipe. */
  public async onLogRepair(event: Button$PressEvent): Promise<void> {
    const button = event.getSource() as Button;
    await this.openLogRepair(button.getBindingContext() as Context | undefined, button.getId());
  }

  /** "Log repair" in the detail panel. */
  public async onLogRepairFromDetail(event: Button$PressEvent): Promise<void> {
    const button = event.getSource() as Button;
    await this.openLogRepair(this.byId("detailCard")?.getBindingContext() as Context | undefined, button.getId());
  }

  /** "Repair history" in the table row. */
  public async onRepairHistory(event: Button$PressEvent): Promise<void> {
    const button = event.getSource() as Button;
    await this.openHistory(button.getBindingContext() as Context | undefined, button.getId());
  }

  /** "Repair history" in the detail panel. */
  public async onRepairHistoryFromDetail(event: Button$PressEvent): Promise<void> {
    const button = event.getSource() as Button;
    await this.openHistory(this.byId("detailCard")?.getBindingContext() as Context | undefined, button.getId());
  }

  /** The dialog gets the pipe's context; its table binds the pipe's Repairs (newest first) relative to it. */
  private async openHistory(context: Context | undefined, returnFocusId: string): Promise<void> {
    const view = this.getView();
    if (!context || !view) return;
    this.returnFocusId = returnFocusId;
    if (!this.historyDialog) {
      this.historyDialog = (await Fragment.load({
        id: view.getId(),
        name: "water.pipes.view.RepairHistoryDialog",
        controller: this,
      })) as Dialog;
      view.addDependent(this.historyDialog);
    }
    this.historyDialog.setBindingContext(context);
    this.historyDialog.open();
  }

  public onCloseHistory(): void {
    this.historyDialog?.close();
  }

  /** History dialog closed: the focus goes back to the button that opened it. */
  public onHistoryClosed(): void {
    const target = this.returnFocusId ? Element.getElementById(this.returnFocusId) : undefined;
    ((target ?? this.byId("refreshButton")) as Control | undefined)?.focus();
  }

  private async openLogRepair(context: Context | undefined, returnFocusId: string): Promise<void> {
    const view = this.getView();
    if (!context || !view) return;
    this.returnFocusId = returnFocusId;
    const today = new Date();
    (view.getModel("repair") as JSONModel).setData({
      ID: context.getProperty("ID") as string,
      pipeID: context.getProperty("pipeID") as string,
      issue: "",
      date: DateFormat.getDateInstance({ pattern: "yyyy-MM-dd" }).format(today),
      maxDate: today,
      by: "",
      busy: false,
      issueState: "None",
      dateState: "None",
      byState: "None",
      issueText: "",
      dateText: "",
      byText: "",
    });
    if (!this.logRepairDialog) {
      this.logRepairDialog = (await Fragment.load({
        id: view.getId(),
        name: "water.pipes.view.LogRepairDialog",
        controller: this,
      })) as Dialog;
      view.addDependent(this.logRepairDialog);
    }
    this.logRepairDialog.open();
  }

  public onCancelRepair(): void {
    this.logRepairDialog?.close();
  }

  /** Dialog closed: the focus goes back to the control that opened it (or to Refresh when that is gone). */
  public onLogRepairClosed(): void {
    (this.getView()?.getModel("repair") as JSONModel | undefined)?.setProperty("/busy", false);
    const target = this.returnFocusId ? Element.getElementById(this.returnFocusId) : undefined;
    ((target ?? this.byId("refreshButton")) as Control | undefined)?.focus();
  }

  /** Live validation of the dialog fields (value state + text). */
  public onRepairChanged(): void {
    void this.validateRepair();
  }

  public async onSaveRepair(): Promise<void> {
    const repairModel = this.getView()?.getModel("repair") as JSONModel | undefined;
    const model = this.getOwnerComponent()?.getModel() as ODataModel | undefined;
    if (!repairModel || !model) return;
    if (!(await this.validateRepair())) return;
    repairModel.setProperty("/busy", true);
    try {
      const action = model.bindContext(
        `/WaterPipes(${repairModel.getProperty("/ID") as string})/WaterSupplyService.logRepair(...)`,
      );
      action.setParameter("issue", repairModel.getProperty("/issue"));
      action.setParameter("repairDate", repairModel.getProperty("/date"));
      action.setParameter("repairedBy", repairModel.getProperty("/by"));
      await action.invoke();
      const pipeID = repairModel.getProperty("/pipeID") as string;
      this.logRepairDialog?.close();
      MessageToast.show(await this.text("repairSaved", [pipeID]));
      model.refresh();
    } catch (error) {
      MessageBox.error(error instanceof Error ? error.message : String(error));
    } finally {
      repairModel.setProperty("/busy", false);
    }
  }

  /** Checks the dialog fields; the server stays the authority (it refuses a future date or "system" too). */
  private async validateRepair(): Promise<boolean> {
    const repairModel = this.getView()?.getModel("repair") as JSONModel | undefined;
    if (!repairModel) return false;
    const issue = String(repairModel.getProperty("/issue") ?? "").trim();
    const by = String(repairModel.getProperty("/by") ?? "").trim();
    const date = String(repairModel.getProperty("/date") ?? "");
    const today = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd" }).format(new Date());
    const required = await this.text("repairRequired");
    const problems: Record<"issue" | "date" | "by", string> = {
      issue: issue === "" ? required : "",
      date: date === "" ? required : date > today ? await this.text("repairDateFuture") : "",
      by: by === "" ? required : by.toLowerCase() === "system" ? await this.text("repairBySystem") : "",
    };
    for (const [field, text] of Object.entries(problems)) {
      repairModel.setProperty(`/${field}State`, text === "" ? "None" : "Error");
      repairModel.setProperty(`/${field}Text`, text);
    }
    return Object.values(problems).every((text) => text === "");
  }

  /** Selection lives in the view state; the map, plan, table and the detail panel all read it. */
  private selectPipe(pipeID: string): void {
    this.viewState().setProperty("/selectedID", pipeID);
    this.syncDetail();
  }

  /** The table's own contexts, which hold every field of every pipe. */
  private tableContexts(): Context[] {
    const binding = (this.byId("pipesTable") as Control | undefined)?.getBinding("items") as ODataListBinding | undefined;
    return (binding?.getAllCurrentContexts() ?? []) as Context[];
  }

  /** Points the detail panel at the selected pipe's row (after a selection and after every reload). */
  private syncDetail(): void {
    const selected = this.viewState().getProperty("/selectedID") as string;
    const context = selected ? this.tableContexts().find((c) => c.getProperty("pipeID") === selected) : undefined;
    const card = this.byId("detailCard");
    if (context) card?.setBindingContext(context);
    else card?.unbindObject();
  }

  /** Counts per status for the filter buttons, then the detail panel and the empty state. */
  private syncFromTable(): void {
    const counts = { all: 0, alarm: 0, unknown: 0, attention: 0, fine: 0 };
    for (const context of this.tableContexts()) {
      counts.all += 1;
      const status = context.getProperty("healthStatus") as keyof typeof counts | undefined;
      if (status && status in counts && status !== "all") counts[status] += 1;
    }
    this.viewState().setProperty("/counts", counts);
    this.updateFilterEmpty();
    this.syncDetail();
  }

  private updateFilterEmpty(): void {
    const state = this.viewState();
    const filter = state.getProperty("/filter") as string;
    const counts = state.getProperty("/counts") as Record<string, number>;
    state.setProperty("/filterEmpty", counts.all > 0 && filter !== "all" && (counts[filter] ?? 0) === 0);
  }

  private async reportLoadError(event: Event<LoadEventParameters>): Promise<void> {
    const error = event.getParameter("error");
    if (!error) return;
    MessageBox.error(`${await this.text("loadError")}\n\n${error.message}`);
  }

  private viewState(): JSONModel {
    return this.getView()?.getModel("view") as JSONModel;
  }

  private async text(key: string, args?: string[]): Promise<string> {
    const bundle = (await (this.getOwnerComponent()?.getModel("i18n") as ResourceModel).getResourceBundle()) as ResourceBundle;
    return bundle.getText(key, args) ?? key;
  }
}
