// Predator-prey applet config and simulation implementation.
import * as THREE from "three";
import { defineAppletConfig } from "./appletConfigUtils.js";
import { BaseSimulation } from "./baseSimulation.js";

// Applet UI and metadata configuration.
export const PREY_APPLET_CONFIG = defineAppletConfig({
  label: "Prey Chain",
  camera: {
    params: [
      { key: "projection", default: "orthographic" },
      { key: "locked", default: false },
      { key: "fov", default: 50, uiMin: 20, uiMax: 90, step: 1 },
      { key: "moveSpeed", default: 120, uiMin: 1, uiMax: 100000, step: 1 },
      { key: "rotationSpeed", default: 84, uiMin: 1, uiMax: 720, step: 1 },
    ],
  },
  params: {
    avoidRadius: 14,
    avoidWeight: 2.4,
    predatorSpawnEnergy: 2.8,
    maxCount: 1200,
    scale: 0.62,
    predatorScale: 1.0,
  },
  visual: {
    params: [
      { key: "colorMode", default: "energy" },
      { key: "colormap", default: "turbo" },
      { key: "colormapInverted", default: false },
      { key: "solidColor", default: "#ff8d5f" },
    ],
  },
  world: {
    params: [
      { key: "x", default: 100, uiMin: 40, uiMax: 320, step: 2 },
      { key: "y", default: 100, uiMin: 40, uiMax: 320, step: 2 },
      { key: "z", default: 100, uiMin: 30, uiMax: 260, step: 2 },
      { key: "gridSize", default: 5, uiMin: 2, uiMax: 320, step: 2 },
      { key: "boundaryMode", default: "cyclic-xy" },
    ],
  },
  intro: {
      paragraphs: [
        "This applet shows predator-prey cycling through pursuit, evasion, reproduction, and energy loss. Population waves emerge from repeated encounters between the two groups.",
        "Open the model equations view for the population law, the motion update, and the energy-based parameter mapping.",
      ],
    },
  model: {
      subtitle: "Population balance coupled to local chase-and-escape motion.",
      references: [
        { label: "Wikipedia: Lotka-Volterra equations", url: "https://en.wikipedia.org/wiki/Lotka%E2%80%93Volterra_equations" },
        { label: "Wikipedia: Food chain", url: "https://en.wikipedia.org/wiki/Food_chain" },
      ],
      items: [
        {
          title: "Population Balance",
          equation: "$$\\dot{x}=\\alpha x-\\beta xy,\\qquad \\dot{y}=\\delta xy-\\gamma y$$",
          explanation: "Prey can grow on their own, while predator-prey encounters transfer energy and change both populations over time.",
          parameters: [
            "<strong>Prey Count</strong> (\\(x\\)) sets the initial prey population.",
            "<strong>Predator Count</strong> (\\(y\\)) sets the initial predator population.",
            "<strong>Prey Birth Rate</strong> (\\(\\alpha\\)) sets the prey growth tendency.",
            "<strong>Predation Rate</strong> (\\(\\beta\\)) scales encounter pressure.",
            "<strong>Predator Gain</strong> (\\(\\delta\\)) controls how much predators benefit from captures.",
            "<strong>Predator Energy Loss</strong> (\\(\\gamma\\)) sets background predator decline.",
          ],
        },
        {
          title: "Position (\\(x\\))",
          equation: "$$\\begin{aligned}\\frac{d\\mathbf{p}}{dt}&=\\mathbf{v}\\\\\\mathbf{p}_k(t+\\Delta t)&=\\mathbf{p}_k(t)+\\mathbf{v}_k(t)\\Delta t\\end{aligned}$$",
          explanation: "Each prey or predator moves forward using its current velocity.",
        },
        {
          title: "Velocity (\\(v\\))",
          equation: "$$\\begin{aligned}\\frac{d\\mathbf{v}}{dt}&=\\frac{\\mathrm{norm}(\\mathbf{v}+\\mathbf{u}\\,\\Delta t)\\,s-\\mathbf{v}}{\\Delta t}\\\\\\mathbf{v}_{k}(t+\\Delta t)&=\\mathrm{norm}\\!\\left(\\mathbf{v}_{k}(t)+\\mathbf{u}_{k}(t)\\Delta t\\right)\\,s_k\\end{aligned}$$",
          explanation: "Motion direction changes through pursuit or evasion steering, then the velocity is normalized back to the species speed.",
          parameters: [
            "<strong>Prey Speed</strong> (\\(s_{prey}\\)) and <strong>Predator Speed</strong> (\\(s_{pred}\\)) set the travel rates.",
          ],
        },
      ],
    },
  stats: {
      stats: [{ label: "FPS", valueId: "prey-fps-live", initial: "--" }],
      charts: [
        { key: "prey-count", label: "Prey Count", liveInitial: "0" },
        { key: "predator-count", label: "Predator Count", liveInitial: "0" },
        { key: "prey-eaten", label: "Predation (cum.)", liveInitial: "0" },
      ],
    },
  simulation: {
      params: [
        { key: "simSpeed", label: "Simulation Speed", default: 1.0, group: "dynamic", uiMin: 0.1, uiMax: 10, control: { type: "slider", icon: "bi-stopwatch", step: 0.1 } },
        { key: "count", label: "Prey Count", default: 260, group: "initial", uiMin: 20, uiMax: 1200, control: { type: "slider", icon: "bi-circle-fill", step: 10, simulationSetter: "setPreyCount", resetTrendCharts: true } },
        { key: "predatorCount", label: "Predator Count", default: 24, group: "initial", uiMin: 2, uiMax: 240, control: { type: "slider", icon: "bi-triangle-fill", step: 1, resetTrendCharts: true } },
        { key: "speed", label: "Prey Speed", default: 4.5, unit: "m/s", group: "dynamic", uiMin: 0.5, uiMax: 18, control: { type: "slider", icon: "bi-speedometer2", step: 0.1 } },
        { key: "predatorSpeed", label: "Predator Speed", default: 6.2, unit: "m/s", group: "dynamic", uiMin: 0.5, uiMax: 24, control: { type: "slider", icon: "bi-lightning-charge-fill", step: 0.1 } },
        { key: "predatorSenseRadius", label: "Sense Radius", default: 16.0, unit: "m", group: "dynamic", uiMin: 1, uiMax: 60, control: { type: "slider", icon: "bi-broadcast", step: 0.5 } },
        { key: "predationRadius", label: "Predation Radius", default: 1.6, unit: "m", group: "dynamic", uiMin: 0.2, uiMax: 8, control: { type: "slider", icon: "bi-crosshair2", step: 0.1 } },
        { key: "birthRate", label: "Prey Birth Rate (\\(\\alpha\\))", default: 0.08, unit: "1/s", group: "dynamic", uiMin: 0, uiMax: 0.8, control: { type: "slider", icon: "bi-activity", step: 0.01 } },
        { key: "predationRateBeta", label: "Predation Rate (\\(\\beta\\))", default: 1.0, group: "dynamic", uiMin: 0, uiMax: 3, control: { type: "slider", icon: "bi-graph-up-arrow", step: 0.05 } },
        { key: "predatorEnergyGain", label: "Predator Gain (\\(\\delta\\))", default: 1.6, group: "dynamic", uiMin: 0.1, uiMax: 5, control: { type: "slider", icon: "bi-plus-circle", step: 0.05 } },
        { key: "predatorEnergyLoss", label: "Predator Energy Loss (\\(\\gamma\\))", default: 0.45, unit: "1/s", group: "dynamic", uiMin: 0, uiMax: 2, control: { type: "slider", icon: "bi-dash-circle", step: 0.01 } },
      ],
    },
});

// Shell runtime hooks.
export const PREY_APPLET_RUNTIME = {
  createChartMetrics(createChartMetricsEntry) {
    return [
      createChartMetricsEntry("prey-count", () => "0", {
        stroke: "#6be39f",
        fill: "rgba(107, 227, 159, 0.16)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("predator-count", () => "0", {
        stroke: "#ff9b70",
        fill: "rgba(255, 155, 112, 0.18)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("prey-eaten", () => "0", {
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

export const PREY_APPLET_VISUAL = {
  controls: {
    colorModeId: "prey-color-mode",
    solidColorId: "prey-solid-color",
    solidColorValueId: "prey-solid-color-value",
    singleColorWrapId: "prey-single-color-wrap",
  },
  section: {
    colorModeOptions: [
      { value: "none", label: "None (single color)" },
      { value: "energy", label: "Predator Energy" },
    ],
    solidColorDefault: "#FF8D5F",
  },
  getColormapConfig({ params, simulation, continuousColormapOptions, continuousColormapGradients }) {
    const colorMode = params?.colorMode || "energy";
    const colormap = params?.colormap || "turbo";
    if (colorMode === "none") {
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
        minText: `cmin: ${Number(range.min).toFixed(2)}`,
        maxText: `cmax: ${Number(range.max).toFixed(2)}`,
      },
    };
  },
};

// File-local constants and helpers.
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

// Simulation implementation.
export class PreySimulation extends BaseSimulation {
  static APPLET_ID = "prey";

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
    this.predatorSolidColor = new THREE.Color(this.params.solidColor || "#ff8d5f");
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

  onBoundaryModeChanged() {
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
    const preyScale = Math.max(0.1, this.params.scale ?? 0.62);
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
      const mode = this.params.colorMode ?? "energy";
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
    if (mode === "none") {
      this.predatorSolidColor.set(this.params.solidColor || "#ff8d5f");
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
    const mode = normalizeBoundaryMode(this.params.boundaryMode);

    if (mode === "cyclic-xyz" || mode === "cyclic-xy") {
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

function normalizeBoundaryMode(mode) {
  if (mode === "cyclic") {
    return "cyclic-xyz";
  }
  if (mode === "cyclic-xyz" || mode === "cyclic-xy" || mode === "lost") {
    return mode;
  }
  return "cyclic-xyz";
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





