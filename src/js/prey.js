import * as THREE from "three";
import { slider } from "./appletConfigUtils.js";

export const PREY_DEFAULT_PARAMS = {
  preySimSpeed: 1.0,
  preyCount: 260,
  predatorCount: 24,
  preySpeed: 4.5,
  predatorSpeed: 6.2,
  predatorSenseRadius: 16,
  predationRadius: 1.6,
  preyBirthRate: 0.08,
  predationRateBeta: 1.0,
  preyAvoidRadius: 14,
  preyAvoidWeight: 2.4,
  predatorEnergyLoss: 0.45,
  predatorEnergyGain: 1.6,
  predatorSpawnEnergy: 2.8,
  preyMaxCount: 1200,
  preyScale: 0.62,
  predatorScale: 1.0,
  preyColorMode: "energy",
  preyColormap: "turbo",
  preySolidColor: "#ff8d5f",
};

export const PREY_APPLET_CONFIG = {
  defaultProjection: "orthographic",
  world: {
    defaults: { x: 100, y: 100, z: 100 },
    range: { minX: 40, maxX: 320, minY: 40, maxY: 320, minZ: 30, maxZ: 260, step: 2 },
    gridSize: 5,
  },
  left: {
    intro: {
      sectionKey: "prey-introduction",
      title: "Introduction",
      icon: "bi-journal-text",
      hidden: true,
      paragraphs: [
        "This applet approximates a predator-prey food chain with local pursuit, evasion, and prey reproduction. Predators consume prey to maintain energy; prey expand under favorable conditions.",
        "The resulting oscillation is qualitatively consistent with Lotka-Volterra-style population cycles.",
      ],
      equations: [
        "$$\\dot{x}=\\alpha x-\\beta xy,\\qquad \\dot{y}=\\delta xy-\\gamma y$$",
        "$$\\mathbf{p}_{k}(t+\\Delta t)=\\mathbf{p}_{k}(t)+\\mathbf{v}_{k}(t)\\Delta t$$",
        "$$\\mathbf{v}_{k}(t+\\Delta t)=\\mathrm{norm}\\!\\left(\\mathbf{v}_{k}+\\mathbf{u}_{k}\\Delta t\\right)\\,s_k$$",
      ],
      mapping: [
        "<strong>Prey Birth Rate</strong> sets prey growth tendency (α).",
        "<strong>Predation Rate (β)</strong> scales effective capture interaction strength.",
        "<strong>Predator Gain (δ)</strong> controls predator energy gained per successful predation.",
        "<strong>Predator Energy Loss (γ)</strong> sets natural predator decay tendency.",
      ],
    },
    stats: {
      sectionKey: "prey-stats",
      title: "Stats",
      icon: "bi-bar-chart-line-fill",
      hidden: true,
      stats: [{ label: "FPS", valueId: "prey-fps-live", initial: "--" }],
      charts: [
        { title: "Prey Count", liveId: "chart-prey-count-live", liveInitial: "0", canvasId: "chart-prey-count", aria: "prey count trend chart" },
        { title: "Predator Count", liveId: "chart-predator-count-live", liveInitial: "0", canvasId: "chart-predator-count", aria: "predator count trend chart" },
        { title: "Predation (cum.)", liveId: "chart-prey-eaten-live", liveInitial: "0", canvasId: "chart-prey-eaten", aria: "predation events trend chart" },
      ],
    },
  },
  right: {
    simulation: {
      sectionKey: "prey-simulation",
      title: "Simulation",
      icon: "bi-sliders2",
      hidden: true,
      className: "mt-2",
      sliderHub: { title: "Prey Count", value: "260", min: "20", max: "1200", step: "10", valueNum: "260" },
      sliders: [
        slider("prey-sim-speed", "Simulation Speed", "bi-stopwatch", "prey-sim-speed-value", "1.0x", "0.1", "10", "0.1", "1.0"),
        slider("prey-count", "Prey Count", "bi-circle-fill", "prey-count-value", "260", "20", "1200", "10", "260"),
        slider("predator-count", "Predator Count", "bi-triangle-fill", "predator-count-value", "24", "2", "240", "1", "24"),
        slider("prey-speed", "Prey Speed", "bi-speedometer2", "prey-speed-value", "4.5 m/s", "0.5", "18", "0.1", "4.5"),
        slider("predator-speed", "Predator Speed", "bi-lightning-charge-fill", "predator-speed-value", "6.2 m/s", "0.5", "24", "0.1", "6.2"),
        slider("predator-sense-radius", "Sense Radius", "bi-broadcast", "predator-sense-radius-value", "16.0 m", "1", "60", "0.5", "16.0"),
        slider("predation-radius", "Predation Radius", "bi-crosshair2", "predation-radius-value", "1.6 m", "0.2", "8", "0.1", "1.6"),
        slider("prey-birth-rate", "Prey Birth Rate (α)", "bi-activity", "prey-birth-rate-value", "0.08 1/s", "0", "0.8", "0.01", "0.08"),
        slider("predation-rate-beta", "Predation Rate (β)", "bi-graph-up-arrow", "predation-rate-beta-value", "1.00", "0", "3", "0.05", "1.00"),
        slider("predator-energy-gain", "Predator Gain (δ)", "bi-plus-circle", "predator-energy-gain-value", "1.60", "0.1", "5", "0.05", "1.60"),
        slider("predator-energy-loss", "Predator Energy Loss (γ)", "bi-dash-circle", "predator-energy-loss-value", "0.45 1/s", "0", "2", "0.01", "0.45"),
      ],
      pauseButtonId: "toggle-prey-pause",
      defaultButtonId: "default-prey-sim",
      resetButtonId: "reset-prey-sim",
    },
  },
};

const PREY_COLORMAP_STOPS = {
  turbo: [0x30123b, 0x4145ab, 0x4685f4, 0x39c6c5, 0x77df6e, 0xb8de29, 0xf9ba38, 0xee6a24, 0xc91f16],
  viridis: [0x440154, 0x482878, 0x3e4a89, 0x31688e, 0x26828e, 0x1f9e89, 0x35b779, 0x6ece58, 0xb5de2b, 0xfee825],
  plasma: [0x0d0887, 0x5b02a3, 0x9a179b, 0xcb4679, 0xed7953, 0xfb9f3a, 0xfdca26, 0xf0f921],
  magma: [0x000004, 0x180f3d, 0x440f76, 0x721f81, 0x9f2f7f, 0xcd4071, 0xf1605d, 0xfd9668, 0xfec98d, 0xfcfdbf],
  inferno: [0x000004, 0x1b0c41, 0x4a0c6b, 0x781c6d, 0xa52c60, 0xcf4446, 0xed6925, 0xfb9b06, 0xf7d13d, 0xfcffa4],
  cividis: [0x00204d, 0x213f6f, 0x3f5f7f, 0x5d7f87, 0x7a9f8a, 0x99bf88, 0xb9dd7f, 0xdbf06a, 0xfff44f],
  coolwarm: [0x3b4cc0, 0x688aef, 0x98b9ff, 0xc9d7f0, 0xece5dc, 0xf7c7a6, 0xee8468, 0xd34b44, 0xb40426],
  greys: [0x111111, 0x3a3a3a, 0x5f5f5f, 0x878787, 0xafafaf, 0xd3d3d3, 0xf2f2f2],
};

const PREY_COLORMAPS = buildColormapLUT(PREY_COLORMAP_STOPS);
const preyColormapLerpA = new THREE.Color();
const preyColormapLerpB = new THREE.Color();

export class PreySimulation {
  constructor({ scene, params, onStats }) {
    this.scene = scene;
    this.params = params;
    this.onStats = onStats;

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
    this.predatorSolidColor = new THREE.Color(params.preySolidColor || "#ff8d5f");
    this.predatorEnergyRange = {
      min: 0,
      max: Math.max(0.1, (params.predatorSpawnEnergy ?? 2.8) * 2.4),
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

    for (let i = 0; i < this.params.preyCount; i += 1) {
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
    this.params.preyCount = count;
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

  onBoundaryModeChanged() {
    this.applyBoundaryToAll();
    this.removeLostAgents();
    this.syncInstances();
    this.emitStats();
  }

  step(dt) {
    const preySpeed = Math.max(0.1, this.params.preySpeed ?? 4.5);
    const predatorSpeed = Math.max(0.1, this.params.predatorSpeed ?? 6.2);
    const preyBirthRate = Math.max(0, this.params.preyBirthRate ?? 0.08);
    const preyAvoidRadius = Math.max(0.5, this.params.preyAvoidRadius ?? 14);
    const preyAvoidWeight = Math.max(0, this.params.preyAvoidWeight ?? 2.4);
    const predatorSenseRadius = Math.max(0.5, this.params.predatorSenseRadius ?? 16);
    const predationRadius = Math.max(0.2, this.params.predationRadius ?? 1.6);
    const predationRateBeta = Math.max(0, this.params.predationRateBeta ?? 1.0);
    const predatorEnergyLoss = Math.max(0, this.params.predatorEnergyLoss ?? 0.45);
    const predatorEnergyGain = Math.max(0, this.params.predatorEnergyGain ?? 1.6);
    const predatorSpawnEnergy = Math.max(0.1, this.params.predatorSpawnEnergy ?? 2.8);
    const preyMaxCount = Math.max(1, Math.floor(this.params.preyMaxCount ?? 1200));

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
    const preyScale = Math.max(0.1, this.params.preyScale ?? 0.62);
    const predatorScale = Math.max(0.1, this.params.predatorScale ?? 1.0);

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
      const mode = this.params.preyColorMode ?? "energy";
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
    const mode = this.params.preyColorMode ?? "energy";
    if (mode === "none") {
      this.predatorSolidColor.set(this.params.preySolidColor || "#ff8d5f");
      outColor.copy(this.predatorSolidColor);
      ensureVisibleColor(outColor, 0.2);
      return;
    }

    const span = Math.max(range.max - range.min, 0.000001);
    const normalized = THREE.MathUtils.clamp(((predator.energy ?? 0) - range.min) / span, 0, 1);
    sampleColormap(this.params.preyColormap || "turbo", normalized, outColor);
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
      velocity: random2DDirection().multiplyScalar(Math.max(0.5, this.params.preySpeed ?? 4.5)),
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

    if (this.params.boundaryMode === "cyclic") {
      agent.position.x = wrapAxis(agent.position.x, halfX);
      agent.position.y = wrapAxis(agent.position.y, halfY);
      agent.lost = false;
      return true;
    }

    const outOfBounds = Math.abs(agent.position.x) > halfX || Math.abs(agent.position.y) > halfY;
    agent.lost = outOfBounds;
    return !outOfBounds;
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

function buildColormapLUT(stopsByName) {
  const maps = {};
  Object.keys(stopsByName).forEach((name) => {
    maps[name] = stopsByName[name].map((hex) => new THREE.Color(hex));
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
