// Shared simulation base contract for applets.
import { createAppletParams } from "./appletConfigUtils.js";

export class BaseSimulation {
  static APPLET_ID = "applet";

  constructor({ scene, params, world, onStats, appletId }) {
    BaseSimulation.assertSubclassAppletId(this.constructor);
    const resolvedAppletId = BaseSimulation.resolveAppletId(this.constructor, appletId);
    this.scene = scene;
    this.params = createAppletParams(params, resolvedAppletId);
    this.world = world;
    this.onStats = onStats;
  }

  static resolveAppletId(simClass, explicitAppletId) {
    if (typeof explicitAppletId === "string" && explicitAppletId.trim().length > 0) {
      return explicitAppletId.trim();
    }
    const classAppletId = simClass?.APPLET_ID;
    if (typeof classAppletId === "string" && classAppletId.trim().length > 0) {
      return classAppletId.trim();
    }
    return BaseSimulation.APPLET_ID;
  }

  static assertSubclassAppletId(simClass) {
    if (simClass === BaseSimulation) {
      return;
    }
    const hasOwnStaticId = Object.prototype.hasOwnProperty.call(simClass, "APPLET_ID");
    const id = simClass?.APPLET_ID;
    if (!hasOwnStaticId || typeof id !== "string" || id.trim().length === 0 || id === BaseSimulation.APPLET_ID) {
      const className = simClass?.name || "UnnamedSimulation";
      throw new Error(
        `[BaseSimulation] ${className} must declare static APPLET_ID (non-empty string).`,
      );
    }
  }

  // Lifecycle hooks consumed by SimulationManager / app shell.
  init() {}

  setVisible() {}

  onTheme() {}

  reset() {}

  onWorldGeometryChanged() {}

  onBoundaryChanged() {}

  step() {
    const appletId = BaseSimulation.resolveAppletId(this.constructor);
    throw new Error(`[${appletId}] Simulation.step(dt) must be implemented.`);
  }
}
