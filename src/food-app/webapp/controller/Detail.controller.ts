import Controller from "sap/ui/core/mvc/Controller";
import type UIComponent from "sap/ui/core/UIComponent";
import type { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import type Table from "sap/m/Table";
import type { Button$PressEvent } from "sap/m/Button";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import type JSONModel from "sap/ui/model/json/JSONModel";
import type Context from "sap/ui/model/odata/v4/Context";
import type ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import formatMessage from "sap/base/strings/formatMessage";
import MarkAsOrderedDialog from "./MarkAsOrderedDialog";
import { errorText, invokeBound, invokeUnbound, text } from "../model/odata";

const PROJECTION_DAYS = 14;

/**
 * Detail of one item (mid column): key figures, the 14-day stock projection and open orders.
 *
 * @namespace food.pantry.controller
 */
export default class Detail extends Controller {
  private itemId?: string;
  private orderDialog?: MarkAsOrderedDialog;

  public onInit(): void {
    const view = this.getView();
    const component = this.getOwnerComponent() as UIComponent | undefined;
    if (!view || !component) return;
    view.setModel(component.getModel("food"), "food");
    component.getRouter().getRoute("detail")?.attachPatternMatched(this.onPatternMatched, this);
    const appModel = component.getModel("app") as JSONModel;
    appModel.bindProperty("/today").attachChange(() => void this.load());
    this.orderDialog = new MarkAsOrderedDialog(view, () => this.afterChange());
  }

  public onExit(): void {
    this.orderDialog?.destroy();
  }

  private pickedDate(): string {
    return (this.getOwnerComponent()?.getModel("app") as JSONModel).getProperty("/today") as string;
  }

  private foodModel(): ODataModel {
    return this.getOwnerComponent()?.getModel("food") as ODataModel;
  }

  public formatMessage(pattern: string, ...args: unknown[]): string {
    return pattern ? formatMessage(pattern, args) : "";
  }

  private onPatternMatched(event: Route$PatternMatchedEvent): void {
    const { id } = event.getParameter("arguments") as { id: string };
    this.itemId = id;
    void this.load();
  }

  /** Binds the page to the item for the picked date and (re)loads projection and open orders. */
  private async load(): Promise<void> {
    const view = this.getView();
    if (!view || !this.itemId) return;
    view.bindElement({ path: `/ReorderLines(${this.itemId})`, model: "food", parameters: { today: this.pickedDate() } });

    const orders = (this.byId("ordersTable") as Table).getBinding("items") as ODataListBinding;
    orders.filter([new Filter("item_ID", FilterOperator.EQ, this.itemId), new Filter("status", FilterOperator.EQ, "open")]);
    if (orders.isSuspended()) orders.resume();

    const projection = this.byId("projectionTable") as Table;
    projection.setBusy(true);
    try {
      const binding = await invokeUnbound(this.foodModel(), "stockProjection", {
        item: this.itemId,
        today: this.pickedDate(),
        days: PROJECTION_DAYS,
      });
      projection.setBindingContext(binding.getBoundContext() ?? null, "food");
    } catch (error) {
      MessageBox.error(errorText(error));
    } finally {
      projection.setBusy(false);
    }
  }

  private afterChange(): void {
    this.foodModel().refresh();
    void this.load();
  }

  public async onMarkAsOrdered(): Promise<void> {
    const context = this.getView()?.getBindingContext("food") as Context | undefined;
    if (context) await this.orderDialog?.open(context, this.pickedDate());
  }

  public async onMarkAsReceived(event: Button$PressEvent): Promise<void> {
    const context = event.getSource().getBindingContext("food") as Context;
    try {
      await invokeBound(context, "markAsReceived");
      MessageToast.show(await text(this.getOwnerComponent(), "orderReceived"));
      this.afterChange();
    } catch (error) {
      MessageBox.error(errorText(error));
    }
  }

  public onClose(): void {
    (this.getOwnerComponent() as UIComponent).getRouter().navTo("overview");
  }
}
