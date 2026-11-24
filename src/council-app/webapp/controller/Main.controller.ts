import Log from "sap/base/Log";
import MessageBox from "sap/m/MessageBox";
import type Event from "sap/ui/base/Event";
import Theming from "sap/ui/core/Theming";
import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import type ResourceModel from "sap/ui/model/resource/ResourceModel";
import formatter from "../model/formatter";

const PRINT_THEME = "sap_horizon";

/**
 * The one page of the Council app. The server ranks everything; this controller only
 * refreshes, reports load errors and prints (on paper the light theme reads better).
 *
 * @namespace oakhaven.council.controller
 */
export default class Main extends Controller {
  public readonly formatter = formatter;
  private printHandler: (() => void) | undefined;

  public onInit(): void {
    const viewModel = new JSONModel({ ready: false });
    this.getView()?.setModel(viewModel, "view");
    const i18n = this.getOwnerComponent()?.getModel("i18n") as ResourceModel | undefined;
    void Promise.resolve(i18n?.getResourceBundle()).then((bundle) => {
      if (!bundle) return;
      formatter.setTexts(bundle as { getText(key: string, args?: string[]): string });
      viewModel.setProperty("/ready", true);
    });
  }

  public onRefresh(): void {
    (this.getOwnerComponent()?.getModel() as ODataModel | undefined)?.refresh();
  }

  public onDataReceived(event: Event): void {
    const error = event.getParameter("error" as never) as Error | undefined;
    if (error) {
      Log.error("Council data could not be loaded", error.message, "oakhaven.council");
      MessageBox.error(error.message);
    }
  }

  /** Switch to the light theme, print once it is applied, then switch back. */
  public onPrint(): void {
    const previousTheme = Theming.getTheme();
    if (previousTheme === PRINT_THEME) {
      this.printNow();
      return;
    }
    this.clearPrintHandler();
    this.printHandler = (): void => {
      if (Theming.getTheme() !== PRINT_THEME) return;
      this.clearPrintHandler();
      this.printNow();
      Theming.setTheme(previousTheme);
    };
    Theming.attachApplied(this.printHandler);
    Theming.setTheme(PRINT_THEME);
  }

  public onExit(): void {
    this.clearPrintHandler();
  }

  private printNow(): void {
    (globalThis as { print?: () => void }).print?.();
  }

  private clearPrintHandler(): void {
    if (this.printHandler) Theming.detachApplied(this.printHandler);
    this.printHandler = undefined;
  }
}
