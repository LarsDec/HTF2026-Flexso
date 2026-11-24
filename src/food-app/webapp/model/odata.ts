import type Context from "sap/ui/model/odata/v4/Context";
import type ODataContextBinding from "sap/ui/model/odata/v4/ODataContextBinding";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import type ResourceModel from "sap/ui/model/resource/ResourceModel";
import type Component from "sap/ui/core/Component";

/**
 * Small helpers around the OData V4 model, shared by the bakery controllers.
 *
 * @namespace food.pantry.model
 */

/** Calls a bound action, e.g. `FoodStockService.markAsReceived`, on `context`. */
export async function invokeBound(
  context: Context,
  action: string,
  parameters: Readonly<Record<string, unknown>> = {},
): Promise<Context | undefined> {
  const binding = context.getModel().bindContext(`FoodStockService.${action}(...)`, context) as ODataContextBinding;
  for (const [name, value] of Object.entries(parameters)) binding.setParameter(name, value);
  return (await binding.invoke()) as Context | undefined;
}

/** Calls an unbound function or action, e.g. `/runNotifier`; returns the operation binding. */
export async function invokeUnbound(
  model: ODataModel,
  operation: string,
  parameters: Readonly<Record<string, unknown>> = {},
): Promise<ODataContextBinding> {
  const binding = model.bindContext(`/${operation}(...)`) as ODataContextBinding;
  for (const [name, value] of Object.entries(parameters)) binding.setParameter(name, value);
  await binding.invoke();
  return binding;
}

/** The server's message of a failed request (falls back to the error text). */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** An i18n text of the app, with `{0}` placeholders filled in. */
export async function text(component: Component | undefined, key: string, args: readonly unknown[] = []): Promise<string> {
  const model = component?.getModel("i18n") as ResourceModel | undefined;
  const bundle = await model?.getResourceBundle();
  return bundle?.getText(key, [...args]) ?? key;
}

/** Decimal parameter for OData: a plain number → its exact text with at most two decimals. */
export function decimalText(value: unknown): string {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? String(Math.round(number * 100) / 100) : "0";
}
