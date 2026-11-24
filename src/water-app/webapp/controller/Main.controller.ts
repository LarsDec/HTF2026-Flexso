import MessageBox from "sap/m/MessageBox";
import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import formatter from "../model/formatter";

/** One pipe as the server returns it (the status fields are computed by the backend). */
interface Pipe {
  pipeID: string;
  healthStatus: string;
  statusReason: string;
  readingAgeMinutes: number | null;
  healthState: string;
  healthIcon: string;
  priorityRank: number | null;
  priorityReason: string | null;
  inTodaysPlan: boolean;
  sourceConflict: boolean;
  lastRepairDate: string | null;
  repaired: boolean;
  suspiciousRepair: boolean;
}

const SELECT =
  "pipeID,healthStatus,statusReason,readingAgeMinutes,healthState,healthIcon,priorityRank,priorityReason,inTodaysPlan,sourceConflict,lastRepairDate,repaired,suspiciousRepair";

/**
 * The one page of the Water app. Virtual fields cannot be sorted by the server, so the
 * controller reads the pipes from OData and orders them by the server's priorityRank.
 * Nothing is calculated here.
 *
 * @namespace water.pipes.controller
 */
export default class Main extends Controller {
  public readonly formatter = formatter;

  public onInit(): void {
    this.getView()?.setModel(new JSONModel({ pipes: [], plan: [], busy: true }), "view");
    void this.loadPipes();
  }

  public onRefresh(): void {
    void this.loadPipes();
  }

  private async loadPipes(): Promise<void> {
    const viewModel = this.getView()?.getModel("view") as JSONModel | undefined;
    const model = this.getOwnerComponent()?.getModel() as ODataModel | undefined;
    if (!viewModel || !model) return;
    viewModel.setProperty("/busy", true);
    try {
      const binding = model.bindList("/WaterPipes", undefined, undefined, undefined, { $select: SELECT });
      const contexts = await binding.requestContexts(0, 100);
      const rank = (pipe: Pipe): number => pipe.priorityRank ?? Number.MAX_SAFE_INTEGER;
      const pipes = contexts.map((context) => context.getObject() as Pipe).sort((a, b) => rank(a) - rank(b));
      viewModel.setProperty("/pipes", pipes);
      viewModel.setProperty("/plan", pipes.filter((pipe) => pipe.inTodaysPlan).slice(0, 2));
    } catch (error) {
      MessageBox.error(error instanceof Error ? error.message : String(error));
    } finally {
      viewModel.setProperty("/busy", false);
    }
  }
}
