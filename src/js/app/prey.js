// Predator-prey applet config and simulation implementation.
import * as THREE from "three";
import { validateAppletConfig } from "./appletConfigUtils.js";
import preyConfigData from "./prey_config.json" with { type: "json" };
import { BaseSimulation } from "./baseSimulation.js";

// Applet UI and metadata configuration.
export const PREY_APPLET_CONFIG = validateAppletConfig(preyConfigData);

// Shell runtime hooks.
const PREY_APPLET_RUNTIME = {
  createChartMetrics(createChartMetricsEntry) {
    return [
      createChartMetricsEntry("count", () => "0", {
        stroke: "#6be39f",
        fill: "rgba(107, 227, 159, 0.16)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("predator", () => "0", {
        stroke: "#ff9b70",
        fill: "rgba(255, 155, 112, 0.18)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("eaten", () => "0", {
        stroke: "#f0cf72",
        fill: "rgba(240, 207, 114, 0.18)",
        axisLabel: "events",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
    ];
  },
  applyStats(stats, ui) {
    if (!stats) {
      return;
    }

    const preyCount = stats.preyCount ?? 0;
    const predatorCount = stats.predatorCount ?? 0;
    const eatenTotal = stats.eatenTotal ?? 0;

    ui.refreshLegend?.();
    ui.updateChartMetrics("prey", [preyCount, predatorCount, eatenTotal], [
      String(preyCount),
      String(predatorCount),
      String(eatenTotal),
    ]);
  },
};

// File-local constants and helpers.
const PREY_COLORMAPS = buildColormapLUT(PREY_APPLET_CONFIG.visual?.colormap);
const preyColormapLerpA = new THREE.Color();
const preyColormapLerpB = new THREE.Color();

// Simulation implementation.
export class PreySimulation extends BaseSimulation {
  static APPLET_ID = "prey";
  static APPLET_RUNTIME = PREY_APPLET_RUNTIME;
  static getColormapConfig({ params, simulation, continuousColormapOptions, continuousColormapGradients }) {
    return buildPreyColormapConfig({
      params,
      simulation,
      continuousColormapOptions,
      continuousColormapGradients,
    });
  }

  constructor({ scene, params, world, onStats }) {
    super({ scene, params, world, onStats });

    this.preyGeometry = new THREE.SphereGeometry(0.42, 10, 8);
    this.preyMaterial = new THREE.MeshPhongMaterial({
      color: 0x65dca5,
      specular: 0x1f4c3b,
      shininess: 26,
      flatShading: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.predatorGeometry = new THREE.ConeGeometry(0.5, 1.4, 10);
    this.predatorGeometry.rotateX(Math.PI / 2);
    this.predatorMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      specular: 0x4a2618,
      shininess: 30,
      flatShading: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.preys = [];
    this.predators = [];
    this.preyMesh = null;
    this.predatorMesh = null;
    this.preyCapacity = 0;
    this.predatorCapacity = 0;

    this.tempObject = new THREE.Object3D();
    this.tempVector2 = new THREE.Vector2();
    this.tempVector2B = new THREE.Vector2();
    this.forwardVector = new THREE.Vector3(0, 0, 1);
    this.velocity3 = new THREE.Vector3();
    this.spawnOffset = new THREE.Vector3();
    this.predatorColor = new THREE.Color();
    this.predatorSolidColor = new THREE.Color(getPreySolidColor(this.params, "predator"));
    this.predatorEnergyRange = {
      min: 0,
      max: Math.max(0.1, (this.params.predatorSpawnEnergy ?? 2.8) * 2.4),
    };

    this.stats = {
      eatenTotal: 0,
    };
  }

  init() {
    this.reset();
  }

  setVisible(visible) {
    if (this.preyMesh) {
      this.preyMesh.visible = visible;
    }
    if (this.predatorMesh) {
      this.predatorMesh.visible = visible;
    }
  }

  onTheme(theme) {
    if (theme === "light") {
      this.preyMaterial.specular.set(0x3f8e6e);
      this.predatorMaterial.specular.set(0x723a26);
      return;
    }

    this.preyMaterial.specular.set(0x1f4c3b);
    this.predatorMaterial.specular.set(0x4a2618);
  }

  reset() {
    this.preys.length = 0;
    this.predators.length = 0;
    this.stats.eatenTotal = 0;

    for (let i = 0; i < this.params.count; i += 1) {
      this.preys.push(this.createPreyAgent());
    }
    for (let i = 0; i < this.params.predatorCount; i += 1) {
      this.predators.push(this.createPredatorAgent());
    }

    this.ensureMeshes();
    this.syncInstances();
    this.emitStats();
  }

  setPreyCount(count) {
    this.params.count = count;
    this.reset();
  }

  setPredatorCount(count) {
    this.params.predatorCount = count;
    this.reset();
  }

  onWorldGeometryChanged() {
    this.applyBoundaryToAll();
    this.removeLostAgents();
    this.syncInstances();
    this.emitStats();
  }

  onBoundaryChanged() {
    this.applyBoundaryToAll();
    this.removeLostAgents();
    this.syncInstances();
    this.emitStats();
  }

  step(dt) {
    const preySpeed = Math.max(0.1, this.params.speed ?? 4.5);
    const predatorSpeed = Math.max(0.1, this.params.predatorSpeed ?? 6.2);
    const preyBirthRate = Math.max(0, this.params.birthRate ?? 0.08);
    const preyAvoidRadius = Math.max(0.5, this.params.avoidRadius ?? 14);
    const preyAvoidWeight = Math.max(0, this.params.avoidWeight ?? 2.4);
    const predatorSenseRadius = Math.max(0.5, this.params.predatorSenseRadius ?? 16);
    const predationRadius = Math.max(0.2, this.params.predationRadius ?? 1.6);
    const predationRateBeta = Math.max(0, this.params.predationRateBeta ?? 1.0);
    const predatorEnergyLoss = Math.max(0, this.params.predatorEnergyLoss ?? 0.45);
    const predatorEnergyGain = Math.max(0, this.params.predatorEnergyGain ?? 1.6);
    const predatorSpawnEnergy = Math.max(0.1, this.params.predatorSpawnEnergy ?? 2.8);
    const preyMaxCount = Math.max(1, Math.floor(this.params.maxCount ?? 1200));

    const newbornPreys = [];

    for (let i = 0; i < this.preys.length; i += 1) {
      const prey = this.preys[i];
      if (prey.lost) {
        continue;
      }

      const nearestPredator = this.findNearestPredator(prey.position, preyAvoidRadius);
      this.tempVector2.set(0, 0);
      if (nearestPredator) {
        this.tempVector2.subVectors(prey.position, nearestPredator.position);
        const lengthSq = this.tempVector2.lengthSq();
        if (lengthSq > 1e-8) {
          this.tempVector2.normalize().multiplyScalar(preyAvoidWeight);
        }
      }

      this.tempVector2B.set(
        THREE.MathUtils.randFloatSpread(2),
        THREE.MathUtils.randFloatSpread(2),
      );
      if (this.tempVector2B.lengthSq() > 1e-8) {
        this.tempVector2B.normalize().multiplyScalar(0.75);
      }

      prey.velocity.addScaledVector(this.tempVector2, dt);
      prey.velocity.addScaledVector(this.tempVector2B, dt);
      enforce2DSpeed(prey.velocity, preySpeed * 0.5, preySpeed);
      prey.position.addScaledVector(prey.velocity, dt);

      if (!this.applyBoundary(prey)) {
        continue;
      }

      if (this.preys.length + newbornPreys.length < preyMaxCount && Math.random() < preyBirthRate * dt) {
        this.spawnOffset.set(
          THREE.MathUtils.randFloatSpread(1.4),
          THREE.MathUtils.randFloatSpread(1.4),
          0,
        );
        const offspring = {
          position: new THREE.Vector2(prey.position.x + this.spawnOffset.x, prey.position.y + this.spawnOffset.y),
          velocity: random2DDirection().multiplyScalar(preySpeed),
          lost: false,
        };
        this.applyBoundary(offspring);
        if (!offspring.lost) {
          newbornPreys.push(offspring);
        }
      }
    }

    if (newbornPreys.length > 0) {
      for (let i = 0; i < newbornPreys.length; i += 1) {
        this.preys.push(newbornPreys[i]);
      }
    }

    for (let i = 0; i < this.predators.length; i += 1) {
      const predator = this.predators[i];
      if (predator.lost) {
        continue;
      }

      predator.energy -= predatorEnergyLoss * dt;
      if (predator.energy <= 0) {
        predator.lost = true;
        continue;
      }

      const targetPrey = this.findNearestPrey(predator.position, predatorSenseRadius);
      if (targetPrey) {
        this.tempVector2.subVectors(targetPrey.position, predator.position);
        if (this.tempVector2.lengthSq() > 1e-8) {
          this.tempVector2.normalize().multiplyScalar(2.4);
          predator.velocity.addScaledVector(this.tempVector2, dt);
        }
      } else {
        this.tempVector2.set(
          THREE.MathUtils.randFloatSpread(2),
          THREE.MathUtils.randFloatSpread(2),
        );
        if (this.tempVector2.lengthSq() > 1e-8) {
          this.tempVector2.normalize().multiplyScalar(1.1);
          predator.velocity.addScaledVector(this.tempVector2, dt);
        }
      }

      enforce2DSpeed(predator.velocity, predatorSpeed * 0.55, predatorSpeed);
      predator.position.addScaledVector(predator.velocity, dt);

      if (!this.applyBoundary(predator)) {
        continue;
      }

      const effectivePredationRadius = predationRadius * predationRateBeta;
      const eatenPrey = this.findNearestPrey(predator.position, effectivePredationRadius);
      if (eatenPrey) {
        eatenPrey.lost = true;
        predator.energy = Math.min(predatorSpawnEnergy * 2.4, predator.energy + predatorEnergyGain);
        this.stats.eatenTotal += 1;
      }
    }

    this.removeLostAgents();
    this.ensureMeshes();
    this.syncInstances();
    this.emitStats();
  }

  ensureMeshes() {
    const nextPreyCapacity = Math.max(1, this.preys.length);
    const nextPredatorCapacity = Math.max(1, this.predators.length);

    if (!this.preyMesh || this.preyCapacity < nextPreyCapacity || this.preyCapacity > nextPreyCapacity * 2) {
      if (this.preyMesh) {
        this.scene.remove(this.preyMesh);
      }
      this.preyCapacity = nextPreyCapacity;
      this.preyMesh = new THREE.InstancedMesh(this.preyGeometry, this.preyMaterial, this.preyCapacity);
      this.preyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.preyMesh.count = this.preys.length;
      this.scene.add(this.preyMesh);
    }

    if (
      !this.predatorMesh ||
      this.predatorCapacity < nextPredatorCapacity ||
      this.predatorCapacity > nextPredatorCapacity * 2
    ) {
      if (this.predatorMesh) {
        this.scene.remove(this.predatorMesh);
      }
      this.predatorCapacity = nextPredatorCapacity;
      this.predatorMesh = new THREE.InstancedMesh(
        this.predatorGeometry,
        this.predatorMaterial,
        this.predatorCapacity,
      );
      this.predatorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.predatorMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(this.predatorCapacity * 3),
        3,
      );
      this.predatorMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.predatorMesh.count = this.predators.length;
      this.scene.add(this.predatorMesh);
    }
  }

  syncInstances() {
    const floorZ = -this.params.worldSizeZ * 0.5 + 0.85;
    const preyScale = getPreyVisualSize(this.params, "prey");
    const predatorScale = getPreyVisualSize(this.params, "predator");
    const mode = this.params.colorMode ?? "energy";

    // Prey body color is not driven by predator colormap/energy mode.
    // Keep prey single-color setting persistent across modes.
    this.preyMaterial.color.set(getPreySolidColor(this.params, "prey"));

    if (this.preyMesh) {
      for (let i = 0; i < this.preys.length; i += 1) {
        const prey = this.preys[i];
        this.tempObject.position.set(prey.position.x, prey.position.y, floorZ);
        this.tempObject.rotation.set(0, 0, 0);
        this.tempObject.scale.setScalar(preyScale);
        this.tempObject.updateMatrix();
        this.preyMesh.setMatrixAt(i, this.tempObject.matrix);
      }
      this.preyMesh.count = this.preys.length;
      this.preyMesh.instanceMatrix.needsUpdate = true;
    }

    if (this.predatorMesh) {
      const range =
        mode === "energy"
          ? this.computePredatorEnergyRange()
          : {
              min: 0,
              max: Math.max(0.1, (this.params.predatorSpawnEnergy ?? 2.8) * 2.4),
            };
      this.predatorEnergyRange = range;

      for (let i = 0; i < this.predators.length; i += 1) {
        const predator = this.predators[i];
        this.velocity3.set(predator.velocity.x, predator.velocity.y, 0);
        if (this.velocity3.lengthSq() < 1e-8) {
          this.velocity3.copy(this.forwardVector);
        } else {
          this.velocity3.normalize();
        }
        this.tempObject.position.set(predator.position.x, predator.position.y, floorZ + 0.12);
        this.tempObject.quaternion.setFromUnitVectors(this.forwardVector, this.velocity3);
        this.tempObject.scale.setScalar(predatorScale);
        this.tempObject.updateMatrix();
        this.predatorMesh.setMatrixAt(i, this.tempObject.matrix);

        this.applyPredatorColor(predator, range, this.predatorColor);
        this.predatorMesh.setColorAt(i, this.predatorColor);
      }
      this.predatorMesh.count = this.predators.length;
      this.predatorMesh.instanceMatrix.needsUpdate = true;
      if (this.predatorMesh.instanceColor) {
        this.predatorMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  computePredatorEnergyRange() {
    if (this.predators.length === 0) {
      return {
        min: 0,
        max: Math.max(0.1, (this.params.predatorSpawnEnergy ?? 2.8) * 2.4),
      };
    }

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < this.predators.length; i += 1) {
      const energy = this.predators[i].energy ?? 0;
      if (energy < min) {
        min = energy;
      }
      if (energy > max) {
        max = energy;
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return {
        min: 0,
        max: Math.max(0.1, (this.params.predatorSpawnEnergy ?? 2.8) * 2.4),
      };
    }

    if (max - min < 0.0001) {
      const pad = Math.max(0.05, Math.abs(max) * 0.05);
      return { min: min - pad, max: max + pad };
    }

    return { min, max };
  }

  applyPredatorColor(predator, range, outColor) {
    const mode = this.params.colorMode ?? "energy";
    if (mode === "solid") {
      this.predatorSolidColor.set(getPreySolidColor(this.params, "predator"));
      outColor.copy(this.predatorSolidColor);
      ensureVisibleColor(outColor, 0.2);
      return;
    }

    const span = Math.max(range.max - range.min, 0.000001);
    const normalized = THREE.MathUtils.clamp(((predator.energy ?? 0) - range.min) / span, 0, 1);
    const colorT = this.params.colormapInverted ? 1 - normalized : normalized;
    sampleColormap(this.params.colormap || "turbo", colorT, outColor);
    ensureVisibleColor(outColor, 0.2);
  }

  getPredatorEnergyRange() {
    return {
      min: this.predatorEnergyRange.min,
      max: this.predatorEnergyRange.max,
    };
  }

  createPreyAgent() {
    return {
      position: randomWorldPosition(this.params),
      velocity: random2DDirection().multiplyScalar(Math.max(0.5, this.params.speed ?? 4.5)),
      lost: false,
    };
  }

  createPredatorAgent() {
    return {
      position: randomWorldPosition(this.params),
      velocity: random2DDirection().multiplyScalar(Math.max(0.5, this.params.predatorSpeed ?? 6.2)),
      energy: Math.max(0.1, this.params.predatorSpawnEnergy ?? 2.8),
      lost: false,
    };
  }

  applyBoundaryToAll() {
    for (let i = 0; i < this.preys.length; i += 1) {
      this.applyBoundary(this.preys[i]);
    }
    for (let i = 0; i < this.predators.length; i += 1) {
      this.applyBoundary(this.predators[i]);
    }
  }

  applyBoundary(agent) {
    const halfX = this.params.worldSizeX * 0.5;
    const halfY = this.params.worldSizeY * 0.5;
    const axes = getBoundaryAxes(this.params);

    if (axes.x === "cyclic") {
      agent.position.x = wrapAxis(agent.position.x, halfX);
    }
    if (axes.y === "cyclic") {
      agent.position.y = wrapAxis(agent.position.y, halfY);
    }

    const outX = axes.x === "lost" && Math.abs(agent.position.x) > halfX;
    const outY = axes.y === "lost" && Math.abs(agent.position.y) > halfY;
    agent.lost = outX || outY;
    return !agent.lost;
  }

  removeLostAgents() {
    for (let i = this.preys.length - 1; i >= 0; i -= 1) {
      if (this.preys[i].lost) {
        this.preys.splice(i, 1);
      }
    }

    for (let i = this.predators.length - 1; i >= 0; i -= 1) {
      if (this.predators[i].lost) {
        this.predators.splice(i, 1);
      }
    }
  }

  findNearestPrey(position, radius) {
    const radiusSq = radius * radius;
    let best = null;
    let bestDistanceSq = radiusSq;
    for (let i = 0; i < this.preys.length; i += 1) {
      const prey = this.preys[i];
      if (prey.lost) {
        continue;
      }
      const distanceSq = position.distanceToSquared(prey.position);
      if (distanceSq <= bestDistanceSq) {
        bestDistanceSq = distanceSq;
        best = prey;
      }
    }
    return best;
  }

  findNearestPredator(position, radius) {
    const radiusSq = radius * radius;
    let best = null;
    let bestDistanceSq = radiusSq;
    for (let i = 0; i < this.predators.length; i += 1) {
      const predator = this.predators[i];
      if (predator.lost) {
        continue;
      }
      const distanceSq = position.distanceToSquared(predator.position);
      if (distanceSq <= bestDistanceSq) {
        bestDistanceSq = distanceSq;
        best = predator;
      }
    }
    return best;
  }

  emitStats() {
    if (typeof this.onStats !== "function") {
      return;
    }

    this.onStats({
      preyCount: this.preys.length,
      predatorCount: this.predators.length,
      eatenTotal: this.stats.eatenTotal,
    });
  }
}

function buildPreyColormapConfig({
  params,
  simulation,
  continuousColormapOptions,
  continuousColormapGradients,
}) {
  const colorMode = params?.colorMode || "energy";
  const colormap = params?.colormap || "turbo";
  const colorModeOption = getPreyColorModeOption(colorMode);
  const unit = String(colorModeOption?.unit || "");
  if (colorMode === "solid") {
    return {
      visible: false,
      value: colormap,
      options: continuousColormapOptions,
      setValue() {},
      legend: null,
    };
  }

  const range = simulation?.getPredatorEnergyRange?.() ?? {
    min: 0,
    max: Math.max(0.1, (params?.predatorSpawnEnergy ?? 2.8) * 2.4),
  };
  return {
    visible: true,
    value: colormap,
    options: continuousColormapOptions,
    setValue(value) {
      params.colormap = value;
      simulation?.syncInstances?.();
    },
    legend: {
      gradient: continuousColormapGradients[colormap] || continuousColormapGradients.turbo,
      minText: `min: ${Number(range.min).toFixed(2)}${unit ? ` ${unit}` : ""}`,
      maxText: `max: ${Number(range.max).toFixed(2)}${unit ? ` ${unit}` : ""}`,
    },
  };
}

function getPreyColorModeOption(colorMode) {
  const visualParams = Array.isArray(PREY_APPLET_CONFIG.visual?.params)
    ? PREY_APPLET_CONFIG.visual.params
    : [];
  const colorModeParam = visualParams.find((entry) => entry?.key === "colorMode");
  const options = Array.isArray(colorModeParam?.options) ? colorModeParam.options : [];
  return options.find((option) => String(option?.key ?? "").trim() === colorMode) || null;
}

function normalizeHexColor(value, fallback = "#ffffff") {
  const text = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return text;
  }
  return fallback;
}

function getPreySolidColorDefaults() {
  const colorEntries = Array.isArray(PREY_APPLET_CONFIG.visual?.color)
    ? PREY_APPLET_CONFIG.visual.color
    : [];
  const predatorEntry = colorEntries.find((entry) => String(entry?.key || "").trim() === "predator");
  const preyEntry = colorEntries.find((entry) => String(entry?.key || "").trim() === "prey");
  const predatorFallback = normalizeHexColor(predatorEntry?.default, "#ff8d5f");
  const preyFallback = normalizeHexColor(preyEntry?.default, "#65dca5");
  return { predator: predatorFallback, prey: preyFallback };
}

function getPreySolidColor(params, type) {
  const defaults = getPreySolidColorDefaults();
  if (type === "prey") {
    return normalizeHexColor(params?.solidColorPrey ?? defaults.prey, defaults.prey);
  }
  return normalizeHexColor(params?.solidColorPredator ?? defaults.predator, defaults.predator);
}

function getPreyVisualSizeDefaults() {
  const sizeEntries = Array.isArray(PREY_APPLET_CONFIG.visual?.size)
    ? PREY_APPLET_CONFIG.visual.size
    : [];
  const preyEntry = sizeEntries.find((item) => String(item?.key || "").trim() === "prey");
  const predatorEntry = sizeEntries.find((item) => String(item?.key || "").trim() === "predator");
  return {
    prey: Number.isFinite(Number(preyEntry?.default)) ? Number(preyEntry.default) : 0.62,
    predator: Number.isFinite(Number(predatorEntry?.default)) ? Number(predatorEntry.default) : 1.0,
  };
}

function getPreyVisualSize(params, type) {
  const defaults = getPreyVisualSizeDefaults();
  if (type === "prey") {
    const configuredDiameter = Number(params?.visualSizePrey);
    if (Number.isFinite(configuredDiameter) && configuredDiameter > 0) {
      return Math.max(0.1, configuredDiameter / (2 * 0.42));
    }
    return Math.max(0.1, defaults.prey / (2 * 0.42));
  }
  const configuredDiameter = Number(params?.visualSizePredator);
  if (Number.isFinite(configuredDiameter) && configuredDiameter > 0) {
    return Math.max(0.1, configuredDiameter / (2 * 0.5));
  }
  return Math.max(0.1, defaults.predator / (2 * 0.5));
}

function randomWorldPosition(params) {
  const x = THREE.MathUtils.randFloatSpread(params.worldSizeX * 0.9);
  const y = THREE.MathUtils.randFloatSpread(params.worldSizeY * 0.9);
  return new THREE.Vector2(x, y);
}

function random2DDirection() {
  const angle = Math.random() * Math.PI * 2;
  return new THREE.Vector2(Math.cos(angle), Math.sin(angle));
}

function wrapAxis(value, halfExtent) {
  const span = halfExtent * 2;
  if (span <= 0) {
    return 0;
  }
  if (value > halfExtent || value < -halfExtent) {
    return ((((value + halfExtent) % span) + span) % span) - halfExtent;
  }
  return value;
}

function getBoundaryAxes(params) {
  const explicit = (params?.boundaryAxes && typeof params.boundaryAxes === "object")
    ? params.boundaryAxes
    : {};
  return {
    x: String(explicit.x || "").trim().toLowerCase() === "lost" ? "lost" : "cyclic",
    y: String(explicit.y || "").trim().toLowerCase() === "lost" ? "lost" : "cyclic",
    z: String(explicit.z || "").trim().toLowerCase() === "lost" ? "lost" : "cyclic",
  };
}

function enforce2DSpeed(vector, minSpeed, maxSpeed) {
  const clampedMin = Math.max(0, minSpeed);
  const clampedMax = Math.max(clampedMin, maxSpeed);
  const speed = vector.length();
  if (speed < 1e-8) {
    vector.copy(random2DDirection()).multiplyScalar(Math.max(clampedMin, 0.01));
    return vector;
  }
  const bounded = THREE.MathUtils.clamp(speed, clampedMin, clampedMax);
  vector.multiplyScalar(bounded / speed);
  return vector;
}

function buildColormapLUT(colormapEntries) {
  const maps = {};
  const entries = Array.isArray(colormapEntries) ? colormapEntries : [];
  entries.forEach((entry) => {
    const name = String((entry?.key ?? "")).trim();
    const stops = Array.isArray(entry?.value) ? entry.value : [];
    if (!name || stops.length === 0) {
      return;
    }
    maps[name] = stops.map((hex) => new THREE.Color(hex));
  });
  return maps;
}

function sampleColormap(name, normalized, outColor) {
  const colors = PREY_COLORMAPS[name] || PREY_COLORMAPS.turbo;
  if (!colors || colors.length === 0) {
    outColor.set(0xffffff);
    return outColor;
  }
  if (colors.length === 1) {
    outColor.copy(colors[0]);
    return outColor;
  }

  const t = THREE.MathUtils.clamp(normalized, 0, 1);
  const scaled = t * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const fraction = scaled - index;
  preyColormapLerpA.copy(colors[index]);
  preyColormapLerpB.copy(colors[index + 1]);
  outColor.copy(preyColormapLerpA).lerp(preyColormapLerpB, fraction);
  return outColor;
}

function ensureVisibleColor(color, minLuminance) {
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  if (luminance >= minLuminance) {
    return color;
  }
  const deficiency = THREE.MathUtils.clamp(
    (minLuminance - luminance) / Math.max(minLuminance, 0.0001),
    0,
    1,
  );
  return color.lerp(new THREE.Color(1, 1, 1), deficiency * 0.55);
}
