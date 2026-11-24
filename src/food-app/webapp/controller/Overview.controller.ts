import Controller from "sap/ui/core/mvc/Controller";
import type UIComponent from "sap/ui/core/UIComponent";
import type Dialog from "sap/m/Dialog";
import type Table from "sap/m/Table";
import type { Button$PressEvent } from "sap/m/Button";
import type { ListItemBase$PressEvent } from "sap/m/ListItemBase";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import type Context from "sap/ui/model/odata/v4/Context";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import type ODataContextBinding from "sap/ui/model/odata/v4/ODataContextBinding";
import formatMessage from "sap/base/strings/formatMessage";
import MarkAsOrderedDialog from "./MarkAsOrderedDialog";
import { decimalText, errorText, invokeBound, invokeUnbound, text } from "../model/odata";

/** The computed lists that depend on the picked date. */
const DATED_TABLES = ["linesTable", "proposalsTable"] as const;

/** Fragment names of the edit dialogs. */
type EditDialog = "EditSupplierDialog" | "EditItemDialog" | "EditSettingsDialog" | "AddSupplierDialog" | "AddItemDialog";

/**
 * The overview page: reorder overview, orders by supplier, messages and settings.
 * The tables are bound in Overview.view.xml; this controller passes the picked date ("today")
 * to the computed lists and handles the actions.
 *
 * @namespace food.pantry.controller
 */
export default class Overview extends Controller {
  private orderDialog?: MarkAsOrderedDialog;
  private readonly dialogs = new Map<EditDialog, Dialog>();
  private editContext?: Context;
  private readonly editModel = new JSONModel({});

  public onInit(): void {
    const view = this.getView();
    const component = this.getOwnerComponent();
    if (!view || !component) return;
    // Set the OData model on the view right away, so the (suspended) list bindings exist in onInit.
    view.setModel(component.getModel("food"), "food");
    view.setModel(this.editModel, "edit");

    const appModel = component.getModel("app") as JSONModel;
    this.applyToday(appModel.getProperty("/today") as string);
    appModel.bindProperty("/today").attachChange(() => this.applyToday(appModel.getProperty("/today") as string));
    this.orderDialog = new MarkAsOrderedDialog(view, () => this.refreshAll());
  }

  public onExit(): void {
    this.orderDialog?.destroy();
    this.dialogs.forEach((dialog) => dialog.destroy());
    this.dialogs.clear();
  }

  /** Recalculates the computed lists for the picked date (custom query option `today`). */
  private applyToday(today: string): void {
    for (const id of DATED_TABLES) {
      const binding = (this.byId(id) as Table | undefined)?.getBinding("items") as ODataListBinding | undefined;
      if (!binding) continue;
      binding.changeParameters({ today });
      if (binding.isSuspended()) binding.resume();
    }
  }

  private pickedDate(): string {
    return (this.getOwnerComponent()?.getModel("app") as JSONModel).getProperty("/today") as string;
  }

  private foodModel(): ODataModel {
    return this.getOwnerComponent()?.getModel("food") as ODataModel;
  }

  private refreshAll(): void {
    this.foodModel().refresh();
  }

  /** "{0} … " texts from i18n with binding values filled in. */
  public formatMessage(pattern: string, ...args: unknown[]): string {
    return pattern ? formatMessage(pattern, args) : "";
  }

  public formatWeekday(weekday: number | null): string {
    if (weekday === null || weekday === undefined) return "";
    const bundle = this.getView()?.getModel("i18n");
    return bundle ? String(bundle.getProperty(`weekday${weekday}`) ?? weekday) : String(weekday);
  }

  // ------------------------------------------------------------------ navigation + ordering

  public onLinePress(event: ListItemBase$PressEvent): void {
    const context = event.getSource().getBindingContext("food") as Context;
    const id = context.getProperty("ID") as string;
    (this.getOwnerComponent() as UIComponent).getRouter().navTo("detail", { id });
  }

  public async onMarkAsOrdered(event: Button$PressEvent): Promise<void> {
    const context = event.getSource().getBindingContext("food") as Context;
    await this.orderDialog?.open(context, this.pickedDate());
  }

  // ------------------------------------------------------------------ messages

  public async onAcknowledge(event: Button$PressEvent): Promise<void> {
    const context = event.getSource().getBindingContext("food") as Context;
    try {
      await invokeBound(context, "acknowledge");
      context.refresh();
    } catch (error) {
      MessageBox.error(errorText(error));
    }
  }

  public async onRunCheck(): Promise<void> {
    const table = this.byId("notificationsTable") as Table;
    table.setBusy(true);
    try {
      const binding: ODataContextBinding = await invokeUnbound(this.foodModel(), "runNotifier");
      const summary = binding.getBoundContext()?.getProperty("value") as string | undefined;
      MessageToast.show(await text(this.getOwnerComponent(), "runCheckDone", [summary ?? ""]));
      this.refreshAll();
    } catch (error) {
      MessageBox.error(errorText(error));
    } finally {
      table.setBusy(false);
    }
  }

  // ------------------------------------------------------------------ settings (edit dialogs)

  private async openEdit(name: EditDialog, context: Context | undefined, data: Record<string, unknown>): Promise<void> {
    this.editContext = context;
    this.editModel.setData(data);
    let dialog = this.dialogs.get(name);
    if (!dialog) {
      dialog = (await this.loadFragment({ name: `food.pantry.fragment.${name}` })) as Dialog;
      this.dialogs.set(name, dialog);
    }
    dialog.open();
  }

  private async save(name: EditDialog, action: string, parameters: Record<string, unknown>): Promise<void> {
    const dialog = this.dialogs.get(name);
    if (!dialog || !this.editContext) return;
    dialog.setBusy(true);
    try {
      await invokeBound(this.editContext, action, parameters);
      dialog.close();
      MessageToast.show(await text(this.getOwnerComponent(), "saved"));
      this.refreshAll();
    } catch (error) {
      MessageBox.error(errorText(error));
    } finally {
      dialog.setBusy(false);
    }
  }

  public onCloseDialog(): void {
    this.dialogs.forEach((dialog) => dialog.isOpen() && dialog.close());
  }

  public async onEditSupplier(event: Button$PressEvent): Promise<void> {
    const context = event.getSource().getBindingContext("food") as Context;
    const supplier = (await context.requestObject()) as { name?: string; leadTimeDays?: number };
    await this.openEdit("EditSupplierDialog", context, { name: supplier.name ?? "", leadTimeDays: supplier.leadTimeDays ?? 0 });
  }

  public async onSaveSupplier(): Promise<void> {
    const data = this.editModel.getData() as { name: string; leadTimeDays: number };
    await this.save("EditSupplierDialog", "updateSupplier", { name: data.name, leadTimeDays: Math.round(data.leadTimeDays) });
  }

  public async onEditItem(event: Button$PressEvent): Promise<void> {
    const context = event.getSource().getBindingContext("food") as Context;
    const item = (await context.requestObject()) as {
      name?: string; supplier_ID?: string | null; isCritical?: boolean; inHouse?: boolean; marketDayMultiplier?: string;
    };
    await this.openEdit("EditItemDialog", context, {
      name: item.name ?? "",
      supplierID: item.supplier_ID ?? "",
      isCritical: item.isCritical === true,
      inHouse: item.inHouse === true,
      marketDayMultiplier: Number(item.marketDayMultiplier ?? 1),
    });
  }

  public async onSaveItem(): Promise<void> {
    const data = this.editModel.getData() as { supplierID: string; isCritical: boolean; inHouse: boolean; marketDayMultiplier: number };
    await this.save("EditItemDialog", "setReorderAttributes", {
      supplier_ID: data.inHouse || !data.supplierID ? null : data.supplierID,
      isCritical: data.isCritical,
      inHouse: data.inHouse,
      marketDayMultiplier: decimalText(data.marketDayMultiplier),
    });
  }

  /** Runs an unbound create action from an add dialog; on success closes it and refreshes all lists. */
  private async create(name: EditDialog, action: string, parameters: Record<string, unknown>): Promise<void> {
    const dialog = this.dialogs.get(name);
    if (!dialog) return;
    dialog.setBusy(true);
    try {
      await invokeUnbound(this.foodModel(), action, parameters);
      dialog.close();
      MessageToast.show(await text(this.getOwnerComponent(), "created"));
      this.refreshAll();
    } catch (error) {
      MessageBox.error(errorText(error));
    } finally {
      dialog.setBusy(false);
    }
  }

  public async onAddSupplier(): Promise<void> {
    await this.openEdit("AddSupplierDialog", undefined, { name: "", leadTimeDays: 1 });
  }

  public async onCreateSupplier(): Promise<void> {
    const data = this.editModel.getData() as { name: string; leadTimeDays: number };
    await this.create("AddSupplierDialog", "createSupplier", { name: data.name.trim(), leadTimeDays: Math.round(data.leadTimeDays) });
  }

  public async onAddItem(): Promise<void> {
    await this.openEdit("AddItemDialog", undefined, {
      itemID: "", name: "", unit: "", icon: "", currentQuantity: 0, minStockLevel: 0, consumptionRate: 0,
      supplierID: "", isCritical: false, inHouse: false, marketDayMultiplier: 1,
    });
  }

  public async onCreateItem(): Promise<void> {
    const d = this.editModel.getData() as {
      itemID: string; name: string; unit: string; icon: string; currentQuantity: number; minStockLevel: number;
      consumptionRate: number; supplierID: string; isCritical: boolean; inHouse: boolean; marketDayMultiplier: number;
    };
    const parameters: Record<string, unknown> = {
      itemID: d.itemID.trim(),
      name: d.name.trim(),
      unit: d.unit.trim(),
      currentQuantity: decimalText(d.currentQuantity),
      minStockLevel: decimalText(d.minStockLevel),
      consumptionRate: decimalText(d.consumptionRate),
      supplier_ID: d.inHouse || !d.supplierID ? null : d.supplierID,
      isCritical: d.isCritical,
      marketDayMultiplier: decimalText(d.marketDayMultiplier),
      inHouse: d.inHouse,
    };
    if (d.icon.trim()) parameters.icon = d.icon.trim();
    await this.create("AddItemDialog", "createStockItem", parameters);
  }

  public async onEditSettings(): Promise<void> {
    const context = (this.byId("settingsForm")?.getBindingContext("food") ?? undefined) as Context | undefined;
    if (!context) return;
    const s = (await context.requestObject()) as Record<string, unknown>;
    await this.openEdit("EditSettingsDialog", context, {
      coverDays: s.coverDays,
      horizonDays: s.horizonDays,
      marketWeekday: String(s.marketWeekday ?? 6),
      digestTime: s.digestTime,
      quietHoursStart: s.quietHoursStart,
      quietHoursEnd: s.quietHoursEnd,
      timeZone: s.timeZone,
      recipientEmail: s.recipientEmail ?? "",
    });
  }

  public async onSaveSettings(): Promise<void> {
    const d = this.editModel.getData() as Record<string, unknown>;
    await this.save("EditSettingsDialog", "updateSettings", {
      coverDays: Math.round(Number(d.coverDays)),
      horizonDays: Math.round(Number(d.horizonDays)),
      marketWeekday: Number(d.marketWeekday),
      digestTime: d.digestTime,
      quietHoursStart: d.quietHoursStart,
      quietHoursEnd: d.quietHoursEnd,
      timeZone: d.timeZone,
      recipientEmail: d.recipientEmail ?? "",
    });
  }
}
