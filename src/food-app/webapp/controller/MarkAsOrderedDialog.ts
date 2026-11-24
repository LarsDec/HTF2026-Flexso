import Fragment from "sap/ui/core/Fragment";
import type View from "sap/ui/core/mvc/View";
import type Dialog from "sap/m/Dialog";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import type Context from "sap/ui/model/odata/v4/Context";
import formatMessage from "sap/base/strings/formatMessage";
import { decimalText, errorText, invokeBound, text } from "../model/odata";

/** The ReorderLines fields the dialog needs. */
interface LineData {
  name?: string;
  unit?: string;
  supplierName?: string | null;
  orderQuantity?: string | null;
}

/**
 * The "Mark as ordered" dialog (spec Should 8), used from the overview and from the item detail.
 * It is the fragment's controller: the handlers below are referenced as `.onConfirm` etc.
 *
 * @namespace food.pantry.controller
 */
export default class MarkAsOrderedDialog {
  private dialog?: Dialog;
  private context?: Context;
  private readonly model = new JSONModel({});

  public constructor(private readonly view: View, private readonly onDone: () => void) {}

  /** Opens the dialog for the ReorderLines row `context`, prefilled with the recommended quantity. */
  public async open(context: Context, today: string): Promise<void> {
    this.context = context;
    const line = (await context.requestObject()) as LineData;
    this.model.setData({
      itemName: line.name ?? "",
      unit: line.unit ?? "",
      supplierName: line.supplierName ?? "",
      quantity: Number(line.orderQuantity ?? 0),
      orderDate: today,
    });
    if (!this.dialog) {
      this.dialog = (await Fragment.load({
        id: this.view.getId(),
        name: "food.pantry.fragment.MarkAsOrderedDialog",
        controller: this,
      })) as Dialog;
      this.dialog.setModel(this.model, "order");
      this.view.addDependent(this.dialog);
    }
    this.dialog.open();
  }

  public formatMessage(pattern: string, ...args: unknown[]): string {
    return pattern ? formatMessage(pattern, args) : "";
  }

  public async onConfirm(): Promise<void> {
    if (!this.dialog || !this.context) return;
    const component = this.view.getController()?.getOwnerComponent();
    const quantity = decimalText(this.model.getProperty("/quantity"));
    this.dialog.setBusy(true);
    try {
      await invokeBound(this.context, "markAsOrdered", { quantity, orderDate: this.model.getProperty("/orderDate") });
      this.dialog.close();
      MessageToast.show(await text(component, "orderSaved", [this.model.getProperty("/itemName")]));
      this.onDone();
    } catch (error) {
      MessageBox.error(errorText(error));
    } finally {
      this.dialog.setBusy(false);
    }
  }

  public onCancel(): void {
    this.dialog?.close();
  }

  public destroy(): void {
    this.dialog?.destroy();
    this.dialog = undefined;
  }
}
