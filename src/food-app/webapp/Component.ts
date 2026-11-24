import IconPool from "sap/ui/core/IconPool";
import UIComponent from "sap/ui/core/UIComponent";
import DateFormat from "sap/ui/core/format/DateFormat";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * Tobin's bakery reorder assistant: what to order, from whom, how much and by when.
 * Models, routing and the root view are declared in manifest.json.
 *
 * @namespace food.pantry
 */
export default class Component extends UIComponent {
  public static metadata = {
    manifest: "json",
    interfaces: ["sap.ui.core.IAsyncContentCreation"],
  };

  public init(): void {
    // Tabler Icons, served by srv/lib/icon-fonts.ts: `sap-icon://ti/<name>`
    IconPool.registerFont({
      fontFamily: "tabler-icons",
      fontURI: "/vendor/tabler-icons/",
      collectionName: "ti",
      lazy: true,
    });
    super.init();

    // View state shared by all pages: the FlexibleColumnLayout layout and the date "today"
    // the plan is calculated for (the spec lets the user pick another date).
    const today = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd" }).format(new Date());
    this.setModel(new JSONModel({ layout: "OneColumn", today, realToday: today }), "app");

    this.getRouter().initialize();
  }
}
