// Shared simulation base contract for applets.
import { createAppletParams } from "./appletConfigUtils.js";

export class BaseSimulation {
  constructor({ scene, params, world, onStats, appletId }) {
    this.scene = scene;
    this.params = createAppletParams(params, appletId);
    this.world = world;
    this.onStats = onStats;
    this.appletId = appletId;
  }

  // Lifecycle hooks consumed by SimulationManager / app shell.
  init() {}

  setVisible() {}

  onTheme() {}

  reset() {}

  onWorldGeometryChanged() {}

  onBoundaryModeChanged() {}

  step() {
    throw new Error(`[${this.appletId}] Simulation.step(dt) must be implemented.`);
  }
}

