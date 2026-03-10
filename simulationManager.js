export class SimulationManager {
  constructor() {
    this.simulations = new Map();
    this.activeId = null;
  }

  register(id, simulation) {
    this.simulations.set(id, simulation);
  }

  get(id) {
    return this.simulations.get(id);
  }

  initAll() {
    for (const simulation of this.simulations.values()) {
      simulation.init?.();
      simulation.setVisible?.(false);
    }
  }

  setActive(id) {
    this.activeId = id;
    for (const [simId, simulation] of this.simulations.entries()) {
      simulation.setVisible?.(simId === id);
    }
  }

  step(dt) {
    const active = this.activeId ? this.simulations.get(this.activeId) : null;
    active?.step?.(dt);
  }

  applyTheme(theme) {
    for (const simulation of this.simulations.values()) {
      simulation.onTheme?.(theme);
    }
  }

  onWorldGeometryChanged() {
    for (const simulation of this.simulations.values()) {
      simulation.onWorldGeometryChanged?.();
    }
  }

  onBoundaryModeChanged() {
    for (const simulation of this.simulations.values()) {
      simulation.onBoundaryModeChanged?.();
    }
  }
}
