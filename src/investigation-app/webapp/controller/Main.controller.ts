import Log from "sap/base/Log";
import type Button from "sap/m/Button";
import type { Button$PressEvent } from "sap/m/Button";
import Dialog from "sap/m/Dialog";
import type { SegmentedButton$SelectionChangeEvent } from "sap/m/SegmentedButton";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import type Table from "sap/m/Table";
import Fragment from "sap/ui/core/Fragment";
import Controller from "sap/ui/core/mvc/Controller";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import JSONModel from "sap/ui/model/json/JSONModel";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import type ResourceModel from "sap/ui/model/resource/ResourceModel";
import formatter from "../model/formatter";

/** One row of the Findings entity (only what the view reads). */
interface Finding {
  ID: string;
  entityName: string;
  recordID: string;
  label: string;
  reason: string;
  rules: string;
  changedAt: string | null;
  changedBy: string | null;
  untrusted: boolean;
  untrustedReason: string | null;
  untrustedBy: string | null;
  untrustedAt: string | null;
}

/** Shape of `councilReport()` (see srv/investigation-service.cds). */
interface CouncilData {
  total: number;
  dated: number;
  firstChangeAt: string | null;
  lastChangeAt: string | null;
  spanMinutes: number;
  pattern: "none" | "single" | "atOnce" | "bitByBit";
  granularity: "hour" | "day";
  buckets: { start: string; count: number }[];
  lines: {
    label: string;
    reason: string;
    markedBy: string;
    changedAt: string | null;
    changedBy: string | null;
  }[];
}

/**
 * The one page of the investigation app: suspicious lines, and the marks "not to be trusted".
 *
 * @namespace oakhaven.investigation.controller
 */
export default class Main extends Controller {
  public readonly formatter = formatter;
  private markDialog: Dialog | undefined;
  private detailDialog: Dialog | undefined;
  private councilDialog: Dialog | undefined;
  /** Line shown in the detail dialog. */
  private detailFinding: Finding | undefined;
  /** Line whose row gets the keyboard focus again after the next refresh. */
  private pendingFocus: string | undefined;

  public onInit(): void {
    const view = this.getView();
    view?.setModel(new JSONModel({ counts: {}, filter: "all", emptyTitle: "", emptyDescription: "" }), "view");
    view?.setModel(new JSONModel({}), "mark");
    view?.setModel(new JSONModel({}), "detail");
    view?.setModel(new JSONModel({ sentence: "", buckets: [], lines: [] }), "council");
    void this.applyFilter("all");
    void this.loadCounts();
  }

  public onExit(): void {
    this.markDialog?.destroy();
    this.markDialog = undefined;
    this.detailDialog?.destroy();
    this.detailDialog = undefined;
    this.councilDialog?.destroy();
    this.councilDialog = undefined;
  }

  public onRefresh(): void {
    this.table()?.getBinding("items")?.refresh();
    void this.loadCounts();
  }

  /** Shows all lines, the lines still to review, or the marked ones. The table filters on the client. */
  public onFilter(event: SegmentedButton$SelectionChangeEvent): void {
    void this.applyFilter(event.getParameter("item")?.getKey() ?? "all");
  }

  private async applyFilter(key: string): Promise<void> {
    const filters = key === "all" ? [] : [new Filter("untrusted", FilterOperator.EQ, key === "marked")];
    (this.table()?.getBinding("items") as { filter?(filters: Filter[]): void } | undefined)?.filter?.(filters);
    const model = this.getView()?.getModel("view") as JSONModel | undefined;
    const suffix = key === "marked" ? "Marked" : key === "review" ? "Review" : "";
    model?.setProperty("/emptyTitle", await this.text(suffix ? `no${suffix}Title` : "noFindingsTitle"));
    model?.setProperty("/emptyDescription", await this.text(suffix ? `no${suffix}Description` : "noFindingsDescription"));
  }

  /** Busy off, and the keyboard focus back on the line that was just changed. */
  public onUpdateFinished(): void {
    const table = this.table();
    table?.setBusy(false);
    this.restoreFocus();
  }

  private restoreFocus(): void {
    const table = this.table();
    if (!this.pendingFocus || !table || this.markDialog?.isOpen() || this.detailDialog?.isOpen()) return;
    const item = table.getItems().find((row) => (row.getBindingContext()?.getObject() as Finding | undefined)?.ID === this.pendingFocus);
    this.pendingFocus = undefined;
    const button = item?.findElements(true).find((control) => control.isA("sap.m.Button") && (control as Button).getVisible());
    ((button ?? table) as { focus(): void }).focus();
  }

  /** The counters come from their own unfiltered read, so they stay right while a filter is on. */
  private async loadCounts(): Promise<void> {
    const model = this.odata();
    if (!model) return;
    try {
      const contexts = await model.bindList("/Findings").requestContexts(0, 1000);
      const rows = contexts.map((context) => context.getObject() as Finding);
      const hasRule = (finding: Finding, ...ids: string[]): boolean =>
        finding.rules.split(",").some((rule) => ids.includes(rule));
      const untrusted = rows.filter((row) => row.untrusted).length;
      (this.getView()?.getModel("view") as JSONModel | undefined)?.setProperty("/counts", {
        suspicious: rows.length,
        impossible: rows.filter((row) => hasRule(row, "impossibleFlow", "negativeStock")).length,
        odd: rows.filter((row) => hasRule(row, "nonPersonEditor", "quietHours")).length,
        untrusted,
        review: rows.length - untrusted,
      });
    } catch (error) {
      Log.error("Counters could not be read", String(error));
    }
  }

  /** Error path: the table must not stay busy. */
  public onDataReceived(event: { getParameter(name: string): unknown }): void {
    this.table()?.setBusy(false);
    const error = event.getParameter("error");
    if (error instanceof Error) {
      void this.text("loadFailed", [error.message]).then((message) => MessageBox.error(message));
      return;
    }
    void this.loadCounts();
  }

  /** Opens the dialog for the pressed row, prefilled with the generated reason. */
  public async onMark(event: Button$PressEvent): Promise<void> {
    const finding = this.findingOf(event.getSource() as Button);
    if (finding) await this.openMark(finding);
  }

  private async openMark(finding: Finding): Promise<void> {
    const view = this.getView();
    if (!finding || !view) return;
    (view.getModel("mark") as JSONModel).setData({
      entityName: finding.entityName,
      recordID: finding.recordID,
      label: finding.label,
      reason: finding.reason,
      by: (view.getModel("mark") as JSONModel).getProperty("/by") ?? "",
      busy: false,
    });
    if (!this.markDialog) {
      this.markDialog = (await Fragment.load({
        id: view.getId(),
        name: "oakhaven.investigation.view.MarkDialog",
        controller: this,
      })) as Dialog;
      view.addDependent(this.markDialog);
    }
    this.markDialog.attachEventOnce("afterOpen", () => {
      const markBy = this.byId("markByInput") as { focus(): void } | undefined;
      const reason = this.byId("markReasonInput") as { focus(): void } | undefined;
      ((view.getModel("mark") as JSONModel).getProperty("/by") ? reason : markBy)?.focus();
    });
    this.markDialog.open();
  }

  public onCancelMark(): void {
    this.markDialog?.close();
  }

  public onMarkClosed(): void {
    (this.getView()?.getModel("mark") as JSONModel | undefined)?.setProperty("/busy", false);
    this.restoreFocus();
  }

  public async onSaveMark(): Promise<void> {
    const markModel = this.getView()?.getModel("mark") as JSONModel | undefined;
    const model = this.odata();
    if (!markModel || !model || markModel.getProperty("/busy")) return;
    const filled = (path: string): boolean => String(markModel.getProperty(path) ?? "").trim() !== "";
    if (!filled("/reason") || !filled("/by")) return;
    markModel.setProperty("/busy", true);
    try {
      const action = model.bindContext("/markUntrusted(...)");
      action.setParameter("entityName", markModel.getProperty("/entityName"));
      action.setParameter("recordID", markModel.getProperty("/recordID"));
      action.setParameter("reason", (markModel.getProperty("/reason") as string).trim());
      action.setParameter("markedBy", (markModel.getProperty("/by") as string).trim());
      await action.invoke();
      this.pendingFocus = `${markModel.getProperty("/entityName")}:${markModel.getProperty("/recordID")}`;
      this.markDialog?.close();
      MessageToast.show(await this.text("markDone", [markModel.getProperty("/label") as string]));
      this.onRefresh();
    } catch (error) {
      MessageBox.error(error instanceof Error ? error.message : String(error));
    } finally {
      markModel.setProperty("/busy", false);
    }
  }

  /** Removes the mark at once: no confirmation, because marking again takes one click. */
  public async onClear(event: Button$PressEvent): Promise<void> {
    const finding = this.findingOf(event.getSource() as Button);
    if (finding) await this.clearMark(finding);
  }

  private async clearMark(finding: Finding): Promise<void> {
    const model = this.odata();
    if (!model) return;
    this.table()?.setBusy(true);
    try {
      const action = model.bindContext("/clearUntrusted(...)");
      action.setParameter("entityName", finding.entityName);
      action.setParameter("recordID", finding.recordID);
      await action.invoke();
      this.pendingFocus = finding.ID;
      MessageToast.show(await this.text("clearDone", [finding.label]));
      this.onRefresh();
    } catch (error) {
      this.table()?.setBusy(false);
      MessageBox.error(error instanceof Error ? error.message : String(error));
    }
  }

  /** A row was pressed: show the full story of that line. */
  public async onRowPress(event: { getSource(): { getBindingContext(): { getObject(): unknown } | null | undefined } }): Promise<void> {
    const finding = event.getSource().getBindingContext()?.getObject() as Finding | undefined;
    const view = this.getView();
    if (!finding || !view) return;
    this.detailFinding = finding;
    const marked = Boolean(finding.untrusted);
    const none = await this.text("noName");
    const kind = await this.text(`entity${finding.entityName}`);
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const ruleList = (finding.rules ?? "").split(",");
    const isQuietHours = ruleList.includes("quietHours");
    const isConflict = ruleList.includes("impossibleFlow");

    (view.getModel("detail") as JSONModel).setData({
      label: finding.label,
      reason: finding.reason,
      record: await this.text("detailRecordValue", [kind, finding.recordID]),
      changedUtc: formatter.utcTime(finding.changedAt),
      changedLocal: formatter.localTime(finding.changedAt),
      localHint: finding.changedAt ? await this.text("detailChangedLocal", [zone]) : "",
      changedBy: formatter.orElse(finding.changedBy, none),
      isQuietHours,
      isConflict,
      marked,
      statusText: await this.text(marked ? "statusUntrusted" : "statusToReview"),
      statusIcon: formatter.trustIcon(marked),
      statusState: formatter.trustState(marked),
      markedBy: marked ? await this.text("detailMarkedBy", [finding.untrustedBy ?? none]) : "",
      markedOn: marked
        ? await this.text("detailMarkedOn", [formatter.utcTime(finding.untrustedAt), formatter.localTime(finding.untrustedAt)])
        : "",
      markReason: marked ? await this.text("detailMarkReason", [finding.untrustedReason ?? ""]) : "",
    });
    if (!this.detailDialog) {
      this.detailDialog = (await Fragment.load({
        id: view.getId(),
        name: "oakhaven.investigation.view.DetailDialog",
        controller: this,
      })) as Dialog;
      view.addDependent(this.detailDialog);
    }
    this.detailDialog.open();
  }

  public onDetailClose(): void {
    this.detailDialog?.close();
  }

  /** The keyboard focus goes back to the row that was pressed. */
  public onDetailClosed(): void {
    if (this.markDialog?.isOpen() || this.pendingFocus) return;
    const row = this.table()
      ?.getItems()
      .find((item) => (item.getBindingContext()?.getObject() as Finding | undefined)?.ID === this.detailFinding?.ID);
    (row as { focus(): void } | undefined)?.focus();
  }

  public async onDetailMark(): Promise<void> {
    const finding = this.detailFinding;
    this.pendingFocus = finding?.ID;
    this.detailDialog?.close();
    if (finding) await this.openMark(finding);
  }

  public async onDetailClear(): Promise<void> {
    const finding = this.detailFinding;
    this.detailDialog?.close();
    if (finding) await this.clearMark(finding);
  }

  /** Reads the council report and opens it. */
  public async onCouncil(): Promise<void> {
    const model = this.odata();
    const view = this.getView();
    if (!model || !view) return;
    try {
      const report = (await model.bindContext("/councilReport()").requestObject()) as CouncilData;
      await this.fillCouncil(view.getModel("council") as JSONModel, report);
    } catch (error) {
      MessageBox.error(await this.text("councilFailed", [error instanceof Error ? error.message : String(error)]));
      return;
    }
    if (!this.councilDialog) {
      this.councilDialog = (await Fragment.load({
        id: view.getId(),
        name: "oakhaven.investigation.view.CouncilDialog",
        controller: this,
      })) as Dialog;
      view.addDependent(this.councilDialog);
    }
    this.councilDialog.open();
  }

  /** Plain sentences and rows, only from the numbers in the report. */
  private async fillCouncil(council: JSONModel, report: CouncilData): Promise<void> {
    const none = await this.text("noName");
    const first = formatter.utcTime(report.firstChangeAt);
    const last = formatter.utcTime(report.lastChangeAt);
    const span = await this.spanText(report.spanMinutes);
    let sentence: string;
    if (report.total === 0) sentence = await this.text("councilNone");
    else if (report.pattern === "none") sentence = await this.text("councilNoDates");
    else if (report.pattern === "single") sentence = await this.text("councilSingle", [first]);
    else if (report.pattern === "atOnce") sentence = await this.text("councilAtOnce", [first, String(report.dated), span]);
    else sentence = await this.text("councilBitByBit", [first, last, span, String(report.dated)]);
    const top = Math.max(1, ...report.buckets.map((bucket) => bucket.count));
    const undated = report.total - report.dated;
    council.setData({
      sentence,
      undatedText: undated > 0 && report.dated > 0 ? await this.text("councilUndated", [String(undated)]) : "",
      groupLabel: await this.text(report.granularity === "day" ? "councilGroupDay" : "councilGroupHour"),
      buckets: report.buckets.map((bucket) => ({
        label: formatter.bucketLabel(bucket.start, report.granularity),
        count: bucket.count,
        percent: Math.round((bucket.count / top) * 100),
      })),
      lines: report.lines.map((line) => ({
        label: line.label,
        reason: line.reason,
        changed: formatter.utcTime(line.changedAt),
        changedBy: formatter.orElse(line.changedBy, none),
        markedBy: line.markedBy,
      })),
      printedOn: await this.text("councilPrinted", [`${formatter.utcTime(new Date().toISOString())} UTC`]),
    });
  }

  private async spanText(minutes: number): Promise<string> {
    if (minutes < 120) return this.text("spanMinutes", [String(minutes)]);
    if (minutes < 2880) return this.text("spanHours", [String(Math.round(minutes / 60))]);
    return this.text("spanDays", [String(Math.round(minutes / 1440))]);
  }

  public onPrintCouncil(): void {
    const dialogDom = this.councilDialog?.getDomRef();
    if (!dialogDom) {
      window.print();
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      window.print();
      return;
    }

    const title = (this.getView()?.getModel("i18n") as ResourceModel | undefined)
      ?.getResourceBundle()
      ?.getText("councilTitle") ?? "Council Report";

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 2rem; color: #1a1a1a; }
    h2, h3 { color: #0b2545; border-bottom: 2px solid #e0e0e0; padding-bottom: 0.5rem; }
    p { line-height: 1.5; font-size: 1.05rem; }
    table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; font-size: 0.95rem; }
    th, td { border: 1px solid #ccc; padding: 0.6rem 0.8rem; text-align: left; }
    th { background: #f0f4f8; font-weight: 600; color: #333; }
    .muted { color: #666; font-size: 0.85rem; }
    .bar { display: inline-block; height: 12px; background: #d32f2f; border-radius: 2px; }
    @media print {
      body { margin: 1cm; }
    }
  </style>
</head>
<body>
  <h2>${title}</h2>
  ${dialogDom.querySelector(".sapMDialogSection")?.innerHTML ?? dialogDom.innerHTML}
</body>
</html>`);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 350);
  }

  public onCloseCouncil(): void {
    this.councilDialog?.close();
  }

  public onCouncilClosed(): void {
    (this.byId("councilButton") as { focus(): void } | undefined)?.focus();
  }

  private table(): Table | undefined {
    return this.byId("findingsTable") as Table | undefined;
  }

  private odata(): ODataModel | undefined {
    return this.getOwnerComponent()?.getModel() as ODataModel | undefined;
  }

  private findingOf(button: Button): Finding | undefined {
    return button.getBindingContext()?.getObject() as Finding | undefined;
  }

  private rows(): Finding[] {
    const contexts = this.table()?.getBinding("items") as { getCurrentContexts?(): { getObject(): unknown }[] } | undefined;
    return (contexts?.getCurrentContexts?.() ?? []).map((context) => context.getObject() as Finding);
  }

  private async text(key: string, args?: string[]): Promise<string> {
    const bundle = await (this.getOwnerComponent()?.getModel("i18n") as ResourceModel | undefined)?.getResourceBundle();
    return (bundle as { getText(key: string, args?: string[]): string } | undefined)?.getText(key, args) ?? key;
  }
}
