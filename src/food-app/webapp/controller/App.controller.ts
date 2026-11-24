import Controller from "sap/ui/core/mvc/Controller";
import type UIComponent from "sap/ui/core/UIComponent";
import type JSONModel from "sap/ui/model/json/JSONModel";
import type { Router$RouteMatchedEvent } from "sap/ui/core/routing/Router";

/**
 * Root of the app: switches the FlexibleColumnLayout between one column (overview) and two
 * columns (overview + item projection) whenever a route matches.
 *
 * @namespace food.pantry.controller
 */
export default class App extends Controller {
  public onInit(): void {
    const component = this.getOwnerComponent() as UIComponent;
    component.getRouter().attachRouteMatched(this.onRouteMatched, this);
  }

  private onRouteMatched(event: Router$RouteMatchedEvent): void {
    const appModel = this.getOwnerComponent()?.getModel("app") as JSONModel;
    appModel.setProperty("/layout", event.getParameter("name") === "detail" ? "TwoColumnsBeginExpanded" : "OneColumn");
  }
}
