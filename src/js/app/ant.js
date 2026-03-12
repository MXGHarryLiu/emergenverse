// Ant trail applet config and simulation implementation.
import * as THREE from "three";
import { createAppletParams, defineAppletConfig, slider } from "./appletConfigUtils.js";

// Default applet parameters.
export const ANT_DEFAULT_PARAMS = {
  simSpeed: 2.0,
  colorMode: "state",
  colormap: "turbo",
  colormapInverted: false,
  solidColor: "#62d6f9",
  count: 120,
  scale: 0.03,
  speed: 0.012,
  sensorDistance: 0.08,
  sensorAngle: 35,
  turnGain: 3.0,
  goalBias: 1.0,
  departureRate: 6,
  depositRate: 5.0,
  diffusionRate: 3.0,
  evapRate: 0.8,
  noiseStrength: 0.2,
  foodSenseDistance: 0.18,
  pickupRadius: 0.04,
  foodPlacementEnabled: false,
  foodAddMassUg: 50,
  pickupMassUg: 1,
  foodSourceMassUg: 1000,
};

// Applet UI and metadata configuration.
export const ANT_APPLET_CONFIG = defineAppletConfig({
  label: "Ant Trails",
  defaultProjection: "orthographic",
  world: {
    defaults: { x: 2000, y: 2000, z: 2000 },
    range: { minX: 500, maxX: 10000, minY: 500, maxY: 10000, minZ: 500, maxZ: 8000, step: 50 },
    gridSize: 100,
    lengthUnit: { name: "mm", toSI: 0.001 },
  },
  left: {
    intro: {
      sectionKey: "ants-introduction",
      title: "Introduction",
      icon: "bi-journal-text",
      hidden: true,
      paragraphs: [
        "This applet models trail formation from simple foraging behavior. Ants sample local cues, choose a turning direction, and reinforce routes by leaving behind a shared trail field.",
        "Open the model equations view for the motion rule, the heading update, and the trail-field dynamics.",
      ],
    },
    model: {
      buttonLabel: "Open Model Equations",
      subtitle: "Agent motion coupled to a trail field on the foraging plane.",
      references: [
        { label: "Wikipedia: Trail pheromone", url: "https://en.wikipedia.org/wiki/Trail_pheromone" },
        { label: "Wikipedia: Ant colony optimization algorithms", url: "https://en.wikipedia.org/wiki/Ant_colony_optimization_algorithms" },
      ],
      items: [
        {
          title: "Agent Motion",
          equation: "$$\\mathbf{x}_i(t+\\Delta t)=\\mathbf{x}_i(t)+v_a[\\cos\\theta_i,\\sin\\theta_i]\\,\\Delta t$$",
          explanation: "Each ant moves forward according to its current heading and walking speed.",
          parameters: [
            "<strong>Speed</strong> (\\(v_a\\)) sets the walking rate.",
          ],
        },
        {
          title: "Heading Update",
          equation: "$$\\theta_i(t+\\Delta t)=\\theta_i(t)+k_{\\theta}(S_R-S_L)\\,\\Delta t+k_g\\,\\Delta\\theta_{\\mathrm{goal}}\\,\\Delta t+\\xi_i$$",
          explanation: "Heading changes with trail sensing, goal attraction, and a stochastic exploration term.",
          parameters: [
            "<strong>Turn Gain</strong> (\\(k_{\\theta}\\)) scales steering responsiveness.",
            "<strong>Goal Bias</strong> (\\(k_g\\)) strengthens return-to-target steering.",
          ],
        },
        {
          title: "Trail Field",
          equation: "$$P_j(t+\\Delta t)=(1-\\lambda\\,\\Delta t)P_j(t)+D\\,\\nabla^2P_j+Q_j$$",
          explanation: "The trail field evaporates, diffuses across the floor, and receives new deposits from ants.",
          parameters: [
            "<strong>Deposit Rate</strong> (\\(Q_j\\)) controls how much trail is added.",
            "<strong>Diffusion Rate</strong> (\\(D\\)) controls how quickly trails spread.",
            "<strong>Evaporation Rate</strong> (\\(\\lambda\\)) controls how quickly trails fade.",
          ],
        },
      ],
    },
    stats: {
      sectionKey: "ants-stats",
      title: "Stats",
      icon: "bi-bar-chart-line-fill",
      hidden: true,
      stats: [
        { label: "FPS", valueId: "ants-fps-live", initial: "--" },
        { label: "Carrying", valueId: "ants-carrying-live", initial: "0", labelClass: "ant-carrying-label" },
      ],
      charts: [
        { title: "Counts", liveId: "chart-ant-count-live", liveInitial: "0", canvasId: "chart-ant-count", aria: "ant counts trend chart" },
        { title: "Trips", liveId: "chart-ant-trips-live", liveInitial: "0", canvasId: "chart-ant-trips", aria: "ant trips trend chart" },
        { title: "Pheromone", liveId: "chart-ant-pheromone-live", liveInitial: "0.00", canvasId: "chart-ant-pheromone", aria: "ant pheromone trend chart" },
      ],
    },
  },
  right: {
    interaction: {
      sectionKey: "ants-interaction",
      title: "Interaction",
      icon: "bi-hand-index-thumb",
      hidden: true,
      sliderHub: {
        title: "Food Added Per Click",
        value: "50 ug",
        min: "10",
        max: "100",
        step: "1",
        valueNum: "50",
      },
      switches: [
        {
          id: "ant-food-placement-enabled",
          label: "Double Click To Add Food",
          checked: false,
        },
      ],
      sliders: [
        slider(
          "ant-food-add-mass",
          "Food Added Per Click",
          "bi-circle-fill",
          "ant-food-add-mass-value",
          "50 ug",
          "10",
          "100",
          "1",
          "50",
          { className: "mt-2" },
        ),
      ],
      notes: [
        "Each pickup consumes 1 ug at a point target. Food marker radius is visual only and scales with mass.",
      ],
    },
    simulation: {
      sectionKey: "ants-simulation",
      title: "Simulation",
      icon: "bi-sliders2",
      hidden: true,
      className: "mt-2",
      sliderHub: {
        title: "Count",
        value: "120",
        min: "20",
        max: "400",
        step: "5",
        valueNum: "120",
      },
      sliders: [
        slider("sim-speed", "Simulation Speed", "bi-stopwatch", "sim-speed-value", "2.0x", "0.1", "10", "0.1", "2.0"),
        slider("count", "Count", "bi-people-fill", "count-value", "120", "20", "400", "5", "120"),
        slider("scale", "Object Visual Size", "bi-rulers", "scale-value", "0.030 m", "0.010", "0.050", "0.001", "0.030"),
        slider("ant-speed", "Speed", "bi-speedometer2", "ant-speed-value", "0.012 m/s", "0.002", "0.040", "0.001", "0.012"),
        slider("ant-sensor-distance", "Sensor Distance", "bi-broadcast", "ant-sensor-distance-value", "0.08 m", "0.01", "0.40", "0.005", "0.08"),
        slider("ant-food-sense-distance", "Food Sensing Distance", "bi-bullseye", "ant-food-sense-distance-value", "0.18 m", "0.02", "0.70", "0.01", "0.18"),
        slider("ant-sensor-angle", "Sensor Angle", "bi-compass", "ant-sensor-angle-value", "35°", "5", "90", "1", "35"),
        slider("ant-turn-gain", "Turn Gain (\\(k_{\\theta}\\))", "bi-arrow-repeat", "ant-turn-gain-value", "3.00 1/s", "0", "8", "0.05", "3.0"),
        slider("ant-goal-bias", "Goal Bias (\\(k_g\\))", "bi-bullseye", "ant-goal-bias-value", "1.00 1/s", "0", "2", "0.05", "1.0"),
        slider("ant-departure-rate", "Departure Rate", "bi-box-arrow-up-right", "ant-departure-rate-value", "6.0 Hz", "0", "20", "0.25", "6"),
        slider("ant-deposit-rate", "Deposit Rate", "bi-droplet-fill", "ant-deposit-rate-value", "5.0", "0", "20", "0.25", "5.0"),
        slider("ant-diffusion-rate", "Diffusion Rate", "bi-water", "ant-diffusion-rate-value", "3.00 1/s", "0", "12", "0.05", "3.0"),
        slider("ant-evap-rate", "Evaporation Rate", "bi-wind", "ant-evap-rate-value", "0.80 1/s", "0", "4", "0.05", "0.8"),
      ],
      pauseButtonId: "toggle-ant-pause",
      defaultButtonId: "default-ant-sim",
      resetButtonId: "reset-ant-sim",
    },
  },
});

// Shell runtime hooks.
export const ANT_APPLET_RUNTIME = {
  createChartMetrics(createChartMetric) {
    return [
      createChartMetric("chart-ant-count", "chart-ant-count-live", () => "0", {
        stroke: "#7ec4ff",
        fill: "rgba(126, 196, 255, 0.14)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetric("chart-ant-trips", "chart-ant-trips-live", () => "0", {
        stroke: "#f1b55b",
        fill: "rgba(241, 181, 91, 0.18)",
        axisLabel: "trips",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetric("chart-ant-pheromone", "chart-ant-pheromone-live", () => "0.00", {
        stroke: "#79d2ff",
        fill: "rgba(121, 210, 255, 0.18)",
        axisLabel: "a.u.",
        tickFormatter: (value) => value.toFixed(2),
        forceZeroMin: true,
      }),
    ];
  },
  applyStats(stats, ui) {
    if (!stats) {
      return;
    }

    const antCount = stats.count ?? 0;
    const carryingCount = stats.carrying ?? 0;
    const trips = stats.trips ?? 0;
    const meanPheromone = stats.meanPheromone ?? 0;

    ui.setText("ants-carrying-live", String(carryingCount));
    ui.updateChartMetrics("ants", [antCount, trips, meanPheromone], [
      String(antCount),
      String(trips),
      meanPheromone.toFixed(2),
    ]);
  },
  bindInteractionControls({ simulation, cameraController, canvas, getActiveApplet, bindRange }) {
    simulation?.bindInteractionControls?.({
      cameraController,
      canvas,
      getActiveApplet,
      bindRange,
    });
  },
};

export const ANT_APPLET_VISUAL = {
  controls: {
    colorModeId: "ant-color-mode",
    solidColorId: "ant-solid-color",
    solidColorValueId: "ant-solid-color-value",
    singleColorWrapId: "ant-single-color-wrap",
  },
  section: {
    hidden: true,
    colorModeLabel: "Color Mode",
    colorModeOptions: [
      { value: "none", label: "None (single color)" },
      { value: "state", label: "State (search/carry)" },
      { value: "heading", label: "Heading" },
    ],
    solidColorLabel: "Color",
    solidColorDefault: "#62D6F9",
  },
  getColormapConfig({ params, simulation, continuousColormapOptions, continuousColormapGradients }) {
    const colorMode = params?.colorMode || "state";
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

    if (colorMode === "state") {
      return {
        visible: true,
        value: colormap,
        options: ANT_DISCRETE_COLORMAP_OPTIONS,
        setValue(value) {
          params.colormap = value;
          simulation?.syncInstances?.();
        },
        legend: {
          gradient: ANT_DISCRETE_LEGEND_GRADIENTS[colormap] || ANT_DISCRETE_LEGEND_GRADIENTS.paired,
          minText: "searching",
          maxText: "carrying",
        },
      };
    }

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
        minText: "cmin: -180°",
        maxText: "cmax: 180°",
      },
    };
  },
};

// File-local constants and helpers.
export const ANT_DISCRETE_COLORMAP_OPTIONS = [
  { value: "paired", label: "Paired" },
  { value: "set1", label: "Set1" },
  { value: "set2", label: "Set2" },
  { value: "dark2", label: "Dark2" },
  { value: "tableau10", label: "Tableau10" },
];

export const ANT_DISCRETE_LEGEND_GRADIENTS = {
  paired: "linear-gradient(90deg, #a6cee3 0%, #a6cee3 50%, #1f78b4 50%, #1f78b4 100%)",
  set1: "linear-gradient(90deg, #e41a1c 0%, #e41a1c 50%, #377eb8 50%, #377eb8 100%)",
  set2: "linear-gradient(90deg, #66c2a5 0%, #66c2a5 50%, #fc8d62 50%, #fc8d62 100%)",
  dark2: "linear-gradient(90deg, #1b9e77 0%, #1b9e77 50%, #d95f02 50%, #d95f02 100%)",
  tableau10: "linear-gradient(90deg, #4e79a7 0%, #4e79a7 50%, #f28e2b 50%, #f28e2b 100%)",
};

const ANT_COLORMAP_STOPS = {
  turbo: [0x30123b, 0x4145ab, 0x4685f4, 0x39c6c5, 0x77df6e, 0xb8de29, 0xf9ba38, 0xee6a24, 0xc91f16],
  viridis: [0x440154, 0x482878, 0x3e4a89, 0x31688e, 0x26828e, 0x1f9e89, 0x35b779, 0x6ece58, 0xb5de2b, 0xfee825],
  plasma: [0x0d0887, 0x5b02a3, 0x9a179b, 0xcb4679, 0xed7953, 0xfb9f3a, 0xfdca26, 0xf0f921],
  magma: [0x000004, 0x180f3d, 0x440f76, 0x721f81, 0x9f2f7f, 0xcd4071, 0xf1605d, 0xfd9668, 0xfec98d, 0xfcfdbf],
  inferno: [0x000004, 0x1b0c41, 0x4a0c6b, 0x781c6d, 0xa52c60, 0xcf4446, 0xed6925, 0xfb9b06, 0xf7d13d, 0xfcffa4],
  cividis: [0x00204d, 0x213f6f, 0x3f5f7f, 0x5d7f87, 0x7a9f8a, 0x99bf88, 0xb9dd7f, 0xdbf06a, 0xfff44f],
  coolwarm: [0x3b4cc0, 0x688aef, 0x98b9ff, 0xc9d7f0, 0xece5dc, 0xf7c7a6, 0xee8468, 0xd34b44, 0xb40426],
  greys: [0x111111, 0x3a3a3a, 0x5f5f5f, 0x878787, 0xafafaf, 0xd3d3d3, 0xf2f2f2],
};

const ANT_COLORMAPS = buildColormapLUT(ANT_COLORMAP_STOPS);
const ANT_DISCRETE_STATE_COLORMAPS = {
  paired: [0xa6cee3, 0x1f78b4],
  set1: [0xe41a1c, 0x377eb8],
  set2: [0x66c2a5, 0xfc8d62],
  dark2: [0x1b9e77, 0xd95f02],
  tableau10: [0x4e79a7, 0xf28e2b],
};
const antLerpA = new THREE.Color();
const antLerpB = new THREE.Color();

// Simulation implementation.
export class AntSimulation {
  constructor({ scene, params, onStats }) {
    this.scene = scene;
    this.params = createAppletParams(params, "ants");
    this.onStats = onStats;

    this.geometry = new THREE.ConeGeometry(0.45, 1.05, 8);
    this.material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      shininess: 28,
      specular: 0x1d1d1d,
      flatShading: true,
      side: THREE.DoubleSide,
      vertexColors: false,
      toneMapped: false,
    });

    this.ants = [];
    this.mesh = null;
    this.pheromonePlane = null;
    this.tempObject = new THREE.Object3D();
    this.foodTempObject = new THREE.Object3D();
    this.antColor = new THREE.Color();
    this.antSolidColor = new THREE.Color();
    this.nest = new THREE.Vector2(0, 0);
    this.departureCredits = 0;
    this.foodSources = [];
    this.foodMesh = null;
    this.foodMeshCapacity = 256;
    this.nestMesh = null;
    this.foodMarkerGeometry = new THREE.CylinderGeometry(1, 1, 0.2, 18);
    this.foodMarkerMaterial = new THREE.MeshPhongMaterial({
      color: 0xffad52,
      shininess: 18,
      specular: 0x2a2015,
      flatShading: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.nestMarkerGeometry = new THREE.CircleGeometry(1, 28);
    this.nestMarkerMaterial = new THREE.MeshBasicMaterial({
      color: 0x5b9dff,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.fieldSize = 128;
    const cells = this.fieldSize * this.fieldSize;
    this.foodField = new Float32Array(cells);
    this.homeField = new Float32Array(cells);
    this.nextFoodField = new Float32Array(cells);
    this.nextHomeField = new Float32Array(cells);
    this.textureData = new Uint8Array(cells * 4);
    this.texture = new THREE.DataTexture(
      this.textureData,
      this.fieldSize,
      this.fieldSize,
      THREE.RGBAFormat,
    );
    this.texture.flipY = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.needsUpdate = true;

    this.pheromoneMaterial = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.stats = {
      trips: 0,
      carrying: 0,
      meanPheromone: 0,
      maxPheromone: 0,
    };

    this.foodRaycaster = new THREE.Raycaster();
    this.foodPointerNdc = new THREE.Vector2();
    this.foodPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  }

  init() {
    if (!this.pheromonePlane) {
      const planeGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
      this.pheromonePlane = new THREE.Mesh(planeGeometry, this.pheromoneMaterial);
      this.pheromonePlane.renderOrder = 2;
      this.scene.add(this.pheromonePlane);
    }

    this.updatePheromonePlaneTransform();
    this.ensureFoodMesh();
    this.ensureNestMesh();
    this.reset();
  }

  setVisible(visible) {
    if (this.mesh) {
      this.mesh.visible = visible;
    }
    if (this.pheromonePlane) {
      this.pheromonePlane.visible = visible;
    }
    if (this.foodMesh) {
      this.foodMesh.visible = visible;
    }
    if (this.nestMesh) {
      this.nestMesh.visible = visible;
    }
  }

  onTheme(theme) {
    this.material.specular.set(theme === "light" ? 0x2a2a2a : 0x171717);
    this.pheromoneMaterial.opacity = theme === "light" ? 0.6 : 0.72;
    this.foodMarkerMaterial.color.set(theme === "light" ? 0xf4a340 : 0xffad52);
    this.foodMarkerMaterial.specular.set(theme === "light" ? 0x3a2918 : 0x251a12);
    this.nestMarkerMaterial.color.set(theme === "light" ? 0x4d8df2 : 0x5b9dff);
    // MeshBasicMaterial has no specular term.
  }

  reset() {
    this.ants.length = 0;
    this.departureCredits = 0;
    this.stats.trips = 0;
    this.stats.carrying = 0;
    this.stats.meanPheromone = 0;
    this.stats.maxPheromone = 0;

    this.foodField.fill(0);
    this.homeField.fill(0);
    this.nextFoodField.fill(0);
    this.nextHomeField.fill(0);

    this.foodSources = this.buildFoodSources();
    this.updateNestMarkerTransform();

    for (let i = 0; i < this.params.count; i += 1) {
      this.ants.push({
        position: this.nest.clone(),
        heading: Math.random() * Math.PI * 2,
        carrying: false,
        lost: false,
        waitingAtNest: true,
      });
    }

    this.rebuildMesh();
    this.syncInstances();
    this.syncFoodInstances();
    this.updatePheromoneTexture();
    this.emitStats();
  }

  setCount(count) {
    this.params.count = count;
    this.reset();
  }

  addFoodAt(x, y, massUg) {
    const halfX = this.params.worldSizeX * 0.5;
    const halfY = this.params.worldSizeY * 0.5;
    const clampedX = THREE.MathUtils.clamp(x, -halfX, halfX);
    const clampedY = THREE.MathUtils.clamp(y, -halfY, halfY);
    const addedMass = Math.max(0, Number(massUg) || 0);
    if (addedMass <= 0) {
      return;
    }

    const nearest = this.findNearestFoodSource(new THREE.Vector2(clampedX, clampedY), 2.0);
    if (nearest) {
      nearest.massUg += addedMass;
    } else {
      this.foodSources.push({
        position: new THREE.Vector2(clampedX, clampedY),
        massUg: addedMass,
      });
    }

    this.syncFoodInstances();
  }

  bindInteractionControls({ cameraController, canvas, getActiveApplet, bindRange }) {
    const placementToggle = document.getElementById("ant-food-placement-enabled");
    const massInput = document.getElementById("ant-food-add-mass");
    const massValue = document.getElementById("ant-food-add-mass-value");

    if (placementToggle) {
      placementToggle.checked = Boolean(this.params.foodPlacementEnabled);
      placementToggle.addEventListener("change", () => {
        this.params.foodPlacementEnabled = placementToggle.checked;
      });
    }

    if (typeof bindRange === "function" && massInput && massValue) {
      bindRange("ant-food-add-mass", "ant-food-add-mass-value", (value) => {
        this.params.foodAddMassUg = value;
        return `${Math.round(value)} ug`;
      });
    }

    if (!canvas || typeof getActiveApplet !== "function") {
      return;
    }

    canvas.addEventListener("dblclick", (event) => {
      if (event.button !== 0) {
        return;
      }
      if (getActiveApplet() !== "ants" || !this.params.foodPlacementEnabled) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) {
        return;
      }

      this.foodPointerNdc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );

      this.foodRaycaster.setFromCamera(this.foodPointerNdc, cameraController.getActiveCamera());
      const floorZ = -this.params.worldSizeZ * 0.5 + 0.06;
      this.foodPlane.constant = -floorZ;
      const hitPoint = new THREE.Vector3();
      if (!this.foodRaycaster.ray.intersectPlane(this.foodPlane, hitPoint)) {
        return;
      }

      this.addFoodAt(hitPoint.x, hitPoint.y, this.params.foodAddMassUg);
    });
  }

  getCount() {
    return this.ants.length;
  }

  getMesh() {
    return this.mesh;
  }

  getPheromonePlane() {
    return this.pheromonePlane;
  }

  onWorldGeometryChanged() {
    this.foodSources = this.buildFoodSources();
    this.updatePheromonePlaneTransform();
    this.updateNestMarkerTransform();
    this.syncFoodInstances();

    for (let i = 0; i < this.ants.length; i += 1) {
      this.applyBoundaryConditions(this.ants[i]);
    }
    if (this.params.boundaryMode === "lost") {
      this.removeLostAnts();
    }

    this.syncInstances();
    this.emitStats();
  }

  onBoundaryModeChanged() {
    for (let i = 0; i < this.ants.length; i += 1) {
      this.applyBoundaryConditions(this.ants[i]);
    }
    if (this.params.boundaryMode === "lost") {
      this.removeLostAnts();
    }
    this.syncInstances();
    this.emitStats();
  }

  step(dt) {
    const sensorAngleRad = THREE.MathUtils.degToRad(this.params.sensorAngle);
    const sensorDistance = Math.max(0.2, this.params.sensorDistance);
    const foodSenseRadius = Math.max(sensorDistance, this.params.foodSenseDistance ?? sensorDistance);
    const foodPickupRadius = Math.max(0.15, this.params.pickupRadius ?? 0.55);
    const worldMinAxis = Math.max(0.1, Math.min(this.params.worldSizeX, this.params.worldSizeY));
    const nestRadius = Math.max(0.02, worldMinAxis * 0.025);
    const turnGain = Math.max(0, this.params.turnGain);
    const goalBias = Math.max(0, this.params.goalBias);
    const departureRate = Math.max(0, this.params.departureRate ?? 12);
    const depositRate = Math.max(0, this.params.depositRate);
    const speed = Math.max(0, this.params.speed);
    this.departureCredits = Math.min(
      this.ants.length,
      this.departureCredits + departureRate * dt,
    );

    for (let i = 0; i < this.ants.length; i += 1) {
      const ant = this.ants[i];
      if (ant.waitingAtNest) {
        ant.position.copy(this.nest);
        ant.carrying = false;
        ant.lost = false;
        if (this.departureCredits >= 1) {
          this.departureCredits -= 1;
          ant.waitingAtNest = false;
          ant.heading = Math.random() * Math.PI * 2;
        } else {
          continue;
        }
      }

      const prevX = ant.position.x;
      const prevY = ant.position.y;
      const trackField = ant.carrying ? this.homeField : this.foodField;

      const leftSignal = this.sampleField(
        trackField,
        ant.position.x + Math.cos(ant.heading + sensorAngleRad) * sensorDistance,
        ant.position.y + Math.sin(ant.heading + sensorAngleRad) * sensorDistance,
      );
      const rightSignal = this.sampleField(
        trackField,
        ant.position.x + Math.cos(ant.heading - sensorAngleRad) * sensorDistance,
        ant.position.y + Math.sin(ant.heading - sensorAngleRad) * sensorDistance,
      );

      const target = this.getClosestFoodSourceWithinRange(ant.position, foodSenseRadius);
      let headingError = 0;
      if (target) {
        const desiredHeading = Math.atan2(target.y - ant.position.y, target.x - ant.position.x);
        headingError = shortestAngleDelta(desiredHeading - ant.heading);
      }
      const stochastic = (Math.random() * 2 - 1) * this.params.noiseStrength;

      if (ant.carrying) {
        // Returning ants do not "see" nest directly.
        // They follow home pheromone gradient and the pickup heading reversal.
        const sensorySteer = (rightSignal - leftSignal) * turnGain * 1.3;
        ant.heading = wrapAngle(ant.heading + (sensorySteer + stochastic * 0.35) * dt);
      } else {
        const sensorySteer = (rightSignal - leftSignal) * turnGain;
        const goalSteer = headingError * goalBias;
        ant.heading = wrapAngle(ant.heading + (sensorySteer + goalSteer + stochastic) * dt);
      }

      ant.position.x += Math.cos(ant.heading) * speed * dt;
      ant.position.y += Math.sin(ant.heading) * speed * dt;

      if (!this.applyBoundaryConditions(ant)) {
        continue;
      }

      const toNestSq = ant.position.distanceToSquared(this.nest);
      const reachedNest =
        toNestSq < nestRadius * nestRadius ||
        pointSegmentDistanceSq(
          prevX,
          prevY,
          ant.position.x,
          ant.position.y,
          this.nest.x,
          this.nest.y,
        ) <
          nestRadius * nestRadius;
      const foodSource = this.getFoodSourceAtPosition(ant.position, foodPickupRadius);
      if (!ant.carrying && foodSource) {
        ant.carrying = true;
        ant.waitingAtNest = false;
        ant.heading = wrapAngle(ant.heading + Math.PI);
        foodSource.massUg = Math.max(0, foodSource.massUg - Math.max(1, this.params.pickupMassUg ?? 1));
      } else if (ant.carrying && reachedNest) {
        ant.carrying = false;
        ant.waitingAtNest = true;
        ant.position.copy(this.nest);
        this.stats.trips += 1;
        continue;
      }

      const depositField = ant.carrying ? this.foodField : this.homeField;
      this.depositField(depositField, ant.position.x, ant.position.y, depositRate * dt);
    }

    if (this.params.boundaryMode === "lost") {
      this.removeLostAnts();
    }

    this.pruneDepletedFoodSources();

    this.diffuseAndEvaporate(dt);
    this.updatePheromoneTexture();
    this.syncInstances();
    this.syncFoodInstances();
    this.emitStats();
  }

  rebuildMesh() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh = null;
    }

    const capacity = Math.max(this.ants.length, 1);
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.count = this.ants.length;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < capacity; i += 1) {
      this.mesh.instanceColor.setXYZ(i, 1, 1, 1);
    }
    this.scene.add(this.mesh);
  }

  ensureFoodMesh() {
    if (this.foodMesh) {
      return;
    }

    const capacity = this.foodMeshCapacity;
    this.foodMesh = new THREE.InstancedMesh(this.foodMarkerGeometry, this.foodMarkerMaterial, capacity);
    this.foodMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.foodMesh.count = 0;
    this.scene.add(this.foodMesh);
  }

  ensureNestMesh() {
    if (this.nestMesh) {
      return;
    }

    this.nestMesh = new THREE.Mesh(this.nestMarkerGeometry, this.nestMarkerMaterial);
    this.nestMesh.renderOrder = 3;
    this.scene.add(this.nestMesh);
    this.updateNestMarkerTransform();
  }

  removeLostAnts() {
    let removed = false;
    for (let i = this.ants.length - 1; i >= 0; i -= 1) {
      if (this.ants[i].lost) {
        this.ants.splice(i, 1);
        removed = true;
      }
    }

    if (removed) {
      this.rebuildMesh();
    }
  }

  syncInstances() {
    if (!this.mesh) {
      return;
    }

    const floorZ = -this.params.worldSizeZ * 0.5 + Math.max(0.006, (this.params.scale ?? 0.003) * 0.7);
    for (let i = 0; i < this.ants.length; i += 1) {
      const ant = this.ants[i];
      this.tempObject.position.set(ant.position.x, ant.position.y, floorZ);
      this.tempObject.rotation.set(0, 0, ant.heading - Math.PI * 0.5);
      this.tempObject.scale.setScalar(Math.max(0.0005, this.params.scale ?? 0.003));
      this.tempObject.updateMatrix();
      this.mesh.setMatrixAt(i, this.tempObject.matrix);

      this.applyAntColor(ant, this.antColor);
      this.mesh.setColorAt(i, this.antColor);
    }

    this.mesh.count = this.ants.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  applyAntColor(ant, outColor) {
    const mode = this.params.colorMode ?? "state";
    if (mode === "none") {
      this.antSolidColor.set(this.params.solidColor || "#62d6f9");
      outColor.copy(this.antSolidColor);
      return;
    }

    if (mode === "state") {
      const stateColors = getAntStateColors(this.params.colormap);
      if (ant.carrying) {
        outColor.setHex(stateColors.carrying);
      } else {
        outColor.setHex(stateColors.searching);
      }
      return;
    }

    if (mode === "heading") {
      const t = (wrapAngle(ant.heading) + Math.PI) / (Math.PI * 2);
      const colorT = this.params.colormapInverted ? 1 - t : t;
      sampleColormap(this.params.colormap, colorT, outColor);
      return;
    }

    outColor.setRGB(0.37, 0.84, 0.98);
  }

  syncFoodInstances() {
    this.ensureFoodMesh();
    if (!this.foodMesh) {
      return;
    }

    const floorZ = -this.params.worldSizeZ * 0.5 + 0.0025;
    const capacity = this.foodMeshCapacity;
    let visibleCount = 0;

    for (let i = 0; i < this.foodSources.length && visibleCount < capacity; i += 1) {
      const source = this.foodSources[i];
      if (!source || source.massUg <= 0) {
        continue;
      }

      const radius = this.getFoodRadiusFromMass(source.massUg);
      this.foodTempObject.position.set(source.position.x, source.position.y, floorZ);
      this.foodTempObject.rotation.set(Math.PI * 0.5, 0, 0);
      // Cylinder is rotated to align height with +Z; keep XY radius symmetric.
      this.foodTempObject.scale.set(radius, 1, radius);
      this.foodTempObject.updateMatrix();
      this.foodMesh.setMatrixAt(visibleCount, this.foodTempObject.matrix);
      visibleCount += 1;
    }

    this.foodMesh.count = visibleCount;
    this.foodMesh.instanceMatrix.needsUpdate = true;
  }

  updatePheromoneTexture() {
    let maxCombined = 0;
    let totalCombined = 0;
    const cellCount = this.fieldSize * this.fieldSize;

    for (let i = 0; i < cellCount; i += 1) {
      const combined = this.foodField[i] + this.homeField[i];
      if (combined > maxCombined) {
        maxCombined = combined;
      }
      totalCombined += combined;
    }

    this.stats.meanPheromone = cellCount > 0 ? totalCombined / cellCount : 0;
    this.stats.maxPheromone = maxCombined;
    const invMax = maxCombined > 0.000001 ? 1 / maxCombined : 0;

    for (let i = 0; i < cellCount; i += 1) {
      const i4 = i * 4;
      const food = this.foodField[i] * invMax;
      const home = this.homeField[i] * invMax;
      const combined = THREE.MathUtils.clamp(food + home, 0, 1);

      this.textureData[i4] = Math.round(210 * food + 28 * home);
      this.textureData[i4 + 1] = Math.round(168 * combined + 18);
      this.textureData[i4 + 2] = Math.round(225 * home + 42 * food);
      this.textureData[i4 + 3] = Math.round(230 * combined);
    }

    this.texture.needsUpdate = true;
  }

  updatePheromonePlaneTransform() {
    if (!this.pheromonePlane) {
      return;
    }
    this.pheromonePlane.scale.set(this.params.worldSizeX, this.params.worldSizeY, 1);
    this.pheromonePlane.position.z = -this.params.worldSizeZ * 0.5 + 0.06;
  }

  updateNestMarkerTransform() {
    if (!this.nestMesh) {
      return;
    }
    const floorZ = -this.params.worldSizeZ * 0.5 + 0.16;
    this.nestMesh.position.set(this.nest.x, this.nest.y, floorZ);
    this.nestMesh.rotation.set(0, 0, 0);
    const worldMinAxis = Math.max(0.1, Math.min(this.params.worldSizeX, this.params.worldSizeY));
    const nestMarkerRadius = Math.max(0.02, worldMinAxis * 0.025);
    this.nestMesh.scale.set(nestMarkerRadius, nestMarkerRadius, 1);
  }

  buildFoodSources() {
    const baseMass = Math.max(1, this.params.foodSourceMassUg ?? 1000);
    const halfX = this.params.worldSizeX * 0.5;
    const halfY = this.params.worldSizeY * 0.5;
    const minAxis = Math.max(0.05, Math.min(halfX, halfY));
    const minRadius = Math.max(minAxis * 0.12, 0.08);
    const maxRadius = Math.max(minRadius + 0.02, minAxis * 0.5);
    const angle = Math.random() * Math.PI * 2;
    const radius = THREE.MathUtils.randFloat(minRadius, maxRadius);
    const edgeMargin = Math.min(0.2, minAxis * 0.2);
    const x = THREE.MathUtils.clamp(Math.cos(angle) * radius, -halfX + edgeMargin, halfX - edgeMargin);
    const y = THREE.MathUtils.clamp(Math.sin(angle) * radius, -halfY + edgeMargin, halfY - edgeMargin);

    return [{ position: new THREE.Vector2(x, y), massUg: baseMass }];
  }

  diffuseAndEvaporate(dt) {
    const size = this.fieldSize;
    const diffusion = THREE.MathUtils.clamp(this.params.diffusionRate * dt, 0, 0.45);
    const decay = THREE.MathUtils.clamp(this.params.evapRate * dt, 0, 0.95);

    for (let y = 0; y < size; y += 1) {
      const yUp = y === 0 ? (this.params.boundaryMode === "cyclic" ? size - 1 : 0) : y - 1;
      const yDown = y === size - 1 ? (this.params.boundaryMode === "cyclic" ? 0 : size - 1) : y + 1;

      for (let x = 0; x < size; x += 1) {
        const xLeft = x === 0 ? (this.params.boundaryMode === "cyclic" ? size - 1 : 0) : x - 1;
        const xRight = x === size - 1 ? (this.params.boundaryMode === "cyclic" ? 0 : size - 1) : x + 1;

        const idx = y * size + x;
        const idxL = y * size + xLeft;
        const idxR = y * size + xRight;
        const idxU = yUp * size + x;
        const idxD = yDown * size + x;

        const food = this.foodField[idx];
        const home = this.homeField[idx];
        const foodNeighborAvg = (this.foodField[idxL] + this.foodField[idxR] + this.foodField[idxU] + this.foodField[idxD]) * 0.25;
        const homeNeighborAvg = (this.homeField[idxL] + this.homeField[idxR] + this.homeField[idxU] + this.homeField[idxD]) * 0.25;

        this.nextFoodField[idx] = Math.max(0, food * (1 - decay) + (foodNeighborAvg - food) * diffusion);
        this.nextHomeField[idx] = Math.max(0, home * (1 - decay) + (homeNeighborAvg - home) * diffusion);
      }
    }

    const tmpFood = this.foodField;
    this.foodField = this.nextFoodField;
    this.nextFoodField = tmpFood;

    const tmpHome = this.homeField;
    this.homeField = this.nextHomeField;
    this.nextHomeField = tmpHome;
  }

  depositField(field, x, y, amount) {
    if (amount <= 0) {
      return;
    }

    const size = this.fieldSize;
    const u = ((x / Math.max(this.params.worldSizeX, 1)) + 0.5) * (size - 1);
    const v = ((y / Math.max(this.params.worldSizeY, 1)) + 0.5) * (size - 1);
    const ix = THREE.MathUtils.clamp(Math.round(u), 0, size - 1);
    const iy = THREE.MathUtils.clamp(Math.round(v), 0, size - 1);
    const center = iy * size + ix;

    field[center] += amount;
    if (ix > 0) {
      field[center - 1] += amount * 0.35;
    }
    if (ix < size - 1) {
      field[center + 1] += amount * 0.35;
    }
    if (iy > 0) {
      field[center - size] += amount * 0.35;
    }
    if (iy < size - 1) {
      field[center + size] += amount * 0.35;
    }
  }

  sampleField(field, x, y) {
    const size = this.fieldSize;
    const u = ((x / Math.max(this.params.worldSizeX, 1)) + 0.5) * (size - 1);
    const v = ((y / Math.max(this.params.worldSizeY, 1)) + 0.5) * (size - 1);
    const ix = THREE.MathUtils.clamp(Math.round(u), 0, size - 1);
    const iy = THREE.MathUtils.clamp(Math.round(v), 0, size - 1);
    return field[iy * size + ix];
  }

  getClosestFoodSourceWithinRange(position, maxDistance) {
    let best = null;
    const maxDistanceSq = Math.max(0, maxDistance) * Math.max(0, maxDistance);
    let bestDistSq = maxDistanceSq;

    for (let i = 0; i < this.foodSources.length; i += 1) {
      const source = this.foodSources[i];
      if (!source || source.massUg <= 0) {
        continue;
      }
      const distanceSq = position.distanceToSquared(source.position);
      if (distanceSq < bestDistSq) {
        bestDistSq = distanceSq;
        best = source.position;
      }
    }

    return best;
  }

  getFoodSourceAtPosition(position, pickupRadius) {
    const radius = Math.max(0, pickupRadius);
    const radiusSq = radius * radius;
    for (let i = 0; i < this.foodSources.length; i += 1) {
      const source = this.foodSources[i];
      if (!source || source.massUg <= 0) {
        continue;
      }
      if (position.distanceToSquared(source.position) <= radiusSq) {
        return source;
      }
    }
    return null;
  }

  findNearestFoodSource(position, mergeRadius) {
    const mergeRadiusSq = mergeRadius * mergeRadius;
    for (let i = 0; i < this.foodSources.length; i += 1) {
      const source = this.foodSources[i];
      if (!source || source.massUg <= 0) {
        continue;
      }
      if (position.distanceToSquared(source.position) <= mergeRadiusSq) {
        return source;
      }
    }
    return null;
  }

  pruneDepletedFoodSources() {
    let dirty = false;
    for (let i = this.foodSources.length - 1; i >= 0; i -= 1) {
      if (!this.foodSources[i] || this.foodSources[i].massUg <= 0.00001) {
        this.foodSources.splice(i, 1);
        dirty = true;
      }
    }
    if (dirty) {
      this.syncFoodInstances();
    }
  }

  getFoodRadiusFromMass(massUg) {
    const safeMass = Math.max(0, massUg);
    return THREE.MathUtils.clamp(0.01 + Math.cbrt(safeMass) * 0.0015, 0.008, 0.08);
  }

  applyBoundaryConditions(ant) {
    const halfX = this.params.worldSizeX * 0.5;
    const halfY = this.params.worldSizeY * 0.5;

    if (this.params.boundaryMode === "cyclic") {
      ant.position.x = wrapAxisLocal(ant.position.x, halfX);
      ant.position.y = wrapAxisLocal(ant.position.y, halfY);
      ant.lost = false;
      return true;
    }

    const outOfBounds = Math.abs(ant.position.x) > halfX || Math.abs(ant.position.y) > halfY;
    ant.lost = outOfBounds;
    return !outOfBounds;
  }

  emitStats() {
    if (typeof this.onStats !== "function") {
      return;
    }

    let carryingCount = 0;
    for (let i = 0; i < this.ants.length; i += 1) {
      if (this.ants[i].carrying) {
        carryingCount += 1;
      }
    }

    this.stats.carrying = carryingCount;
    this.onStats({
      count: this.ants.length,
      carrying: carryingCount,
      trips: this.stats.trips,
      meanPheromone: this.stats.meanPheromone,
      maxPheromone: this.stats.maxPheromone,
    });
  }
}

function wrapAxisLocal(value, halfExtent) {
  const span = halfExtent * 2;
  if (span <= 0) {
    return 0;
  }
  if (value > halfExtent || value < -halfExtent) {
    return ((((value + halfExtent) % span) + span) % span) - halfExtent;
  }
  return value;
}

function shortestAngleDelta(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function wrapAngle(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function pointSegmentDistanceSq(ax, ay, bx, by, px, py) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 1e-12) {
    const dx = px - ax;
    const dy = py - ay;
    return dx * dx + dy * dy;
  }
  const t = THREE.MathUtils.clamp((apx * abx + apy * aby) / abLenSq, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}

function buildColormapLUT(stopsByName) {
  const maps = {};
  Object.keys(stopsByName).forEach((name) => {
    maps[name] = stopsByName[name].map((hex) => new THREE.Color(hex));
  });
  return maps;
}

function sampleColormap(name, normalized, outColor) {
  const colors = ANT_COLORMAPS[name] || ANT_COLORMAPS.turbo;
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
  antLerpA.copy(colors[index]);
  antLerpB.copy(colors[index + 1]);
  outColor.copy(antLerpA).lerp(antLerpB, fraction);
  return outColor;
}

function getAntStateColors(name) {
  const palette = ANT_DISCRETE_STATE_COLORMAPS[name];
  if (palette && palette.length >= 2) {
    return {
      searching: palette[0],
      carrying: palette[1],
    };
  }
  return {
    searching: 0x5fd6fa,
    carrying: 0xfaad42,
  };
}
