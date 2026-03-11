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
    this.enforceVisibility();
  }

  enforceVisibility() {
    for (const [simId, simulation] of this.simulations.entries()) {
      simulation.setVisible?.(simId === this.activeId);
    }
  }

  step(dt, activeId = this.activeId) {
    if (activeId && activeId !== this.activeId) {
      this.activeId = activeId;
    }
    this.enforceVisibility();
    const active = this.activeId ? this.simulations.get(this.activeId) : null;
    active?.step?.(dt);
  }

  applyTheme(theme) {
    for (const simulation of this.simulations.values()) {
      simulation.onTheme?.(theme);
    }
  }

  onWorldGeometryChanged() {
    const active = this.activeId ? this.simulations.get(this.activeId) : null;
    active?.onWorldGeometryChanged?.();
    this.enforceVisibility();
  }

  onBoundaryModeChanged() {
    const active = this.activeId ? this.simulations.get(this.activeId) : null;
    active?.onBoundaryModeChanged?.();
    this.enforceVisibility();
  }
}
