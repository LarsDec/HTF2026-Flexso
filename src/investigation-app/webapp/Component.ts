import UIComponent from "sap/ui/core/UIComponent";

/**
 * The investigation app. Models, root view and i18n are declared in manifest.json.
 *
 * @namespace oakhaven.investigation
 */
export default class Component extends UIComponent {
  public static metadata = {
    manifest: "json",
    interfaces: ["sap.ui.core.IAsyncContentCreation"],
  };
}
