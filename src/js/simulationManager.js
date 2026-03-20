// Lightweight registry for initializing, activating, and forwarding events to simulations.
export class SimulationManager {
  constructor() {
    this.simulations = new Map();
    this.activeId = null;
    this.visibilityDirty = false;
  }

  register(id, simulation) {
    this.simulations.set(id, simulation);
    this.visibilityDirty = true;
  }

  get(id) {
    return this.simulations.get(id);
  }

  initAll() {
    for (const simulation of this.simulations.values()) {
      simulation.init?.();
      simulation.setVisible?.(false);
    }
    this.visibilityDirty = false;
  }

  setActive(id) {
    if (id === this.activeId) {
      return;
    }
    this.activeId = id;
    this.visibilityDirty = true;
    this.enforceVisibility();
  }

  enforceVisibility() {
    if (!this.visibilityDirty) {
      return;
    }
    for (const [simId, simulation] of this.simulations.entries()) {
      simulation.setVisible?.(simId === this.activeId);
    }
    this.visibilityDirty = false;
  }

  step(dt, activeId = this.activeId) {
    if (activeId && activeId !== this.activeId) {
      this.activeId = activeId;
      this.visibilityDirty = true;
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
  }

  onBoundaryChanged() {
    const active = this.activeId ? this.simulations.get(this.activeId) : null;
    active?.onBoundaryChanged?.();
  }
}
