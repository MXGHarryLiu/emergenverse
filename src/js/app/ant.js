// Ant trail applet config and simulation implementation.
import * as THREE from "three";
import { validateAppletConfig } from "./appletConfigUtils.js";
import antConfigData from "./ant_config.json" with { type: "json" };
import { BaseSimulation } from "./baseSimulation.js";

// Applet UI and metadata configuration.
export const ANT_APPLET_CONFIG = validateAppletConfig(antConfigData);

// Shell runtime hooks.
const ANT_APPLET_RUNTIME = {
  createChartMetrics(createChartMetricsEntry) {
    return [
      createChartMetricsEntry("count", () => "0", {
        stroke: "#7ec4ff",
        fill: "rgba(126, 196, 255, 0.14)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("trips", () => "0", {
        stroke: "#f1b55b",
        fill: "rgba(241, 181, 91, 0.18)",
        axisLabel: "trips",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("pheromone", () => "0.00", {
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

    ui.setText("ant-carrying-live", String(carryingCount));
    ui.updateChartMetrics("ant", [antCount, trips, meanPheromone], [
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

// File-local constants and helpers.
const ANT_COLORMAPS = buildColormapLUT(ANT_APPLET_CONFIG.visual?.colormap);
const antLerpA = new THREE.Color();
const antLerpB = new THREE.Color();

// Simulation implementation.
export class AntSimulation extends BaseSimulation {
  static APPLET_ID = "ant";
  static APPLET_RUNTIME = ANT_APPLET_RUNTIME;
  static getColormapConfig({ params, simulation, continuousColormapOptions, continuousColormapGradients }) {
    return buildAntColormapConfig({
      params,
      simulation,
      continuousColormapOptions,
      continuousColormapGradients,
    });
  }

  constructor({ scene, params, world, onStats }) {
    super({ scene, params, world, onStats });

    this.geometry = new THREE.ConeGeometry(0.45, 1.05, 8);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      vertexColors: false,
      fog: false,
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
      fog: false,
      toneMapped: false,
    });
    this.random = createSeededRandomGenerator(this.params?.randomSeed);
    this.nestMarkerGeometry = new THREE.CircleGeometry(1, 28);
    this.nestMarkerMaterial = new THREE.MeshBasicMaterial({
      color: 0x5b9dff,
      side: THREE.DoubleSide,
      fog: false,
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
      fog: false,
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
    this.syncMarkerColors();
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
    this.pheromoneMaterial.opacity = theme === "light" ? 0.6 : 0.72;
    this.foodMarkerMaterial.specular.set(theme === "light" ? 0x3a2918 : 0x251a12);
    // MeshBasicMaterial has no specular term.
    this.syncMarkerColors();
  }

  reset() {
    this.random = createSeededRandomGenerator(this.params?.randomSeed);
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
        heading: this.randAngle(),
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
        return `${Math.round(value)} mg`;
      });
    }

    if (!canvas || typeof getActiveApplet !== "function") {
      return;
    }

    canvas.addEventListener("dblclick", (event) => {
      if (event.button !== 0) {
        return;
      }
      if (getActiveApplet() !== "ant" || !this.params.foodPlacementEnabled) {
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
    if (hasAnyLostBoundaryAxis(this.params)) {
      this.removeLostAnts();
    }

    this.syncInstances();
    this.emitStats();
  }

  onBoundaryChanged() {
    for (let i = 0; i < this.ants.length; i += 1) {
      this.applyBoundaryConditions(this.ants[i]);
    }
    if (hasAnyLostBoundaryAxis(this.params)) {
      this.removeLostAnts();
    }
    this.syncInstances();
    this.emitStats();
  }

  step(dt) {
    const sensorAngleRad = THREE.MathUtils.degToRad(this.params.sensorAngle);
    const sensorDistance = Math.max(0.2, this.toWorldLength(this.params.sensorDistance, 0.08));
    const foodSenseRadius = Math.max(
      sensorDistance,
      this.toWorldLength(this.params.foodSenseDistance ?? this.params.sensorDistance, 0.18),
    );
    const foodPickupRadius = Math.max(0.005, Number(this.params.pickupRadius) || 0.04);
    const worldMinAxis = Math.max(0.1, Math.min(this.params.worldSizeX, this.params.worldSizeY));
    const nestRadius = Math.max(0.02, worldMinAxis * 0.025);
    const turnGain = Math.max(0, this.params.turnGain);
    const goalBias = Math.max(0, this.params.goalBias);
    const departureRate = Math.max(0, this.params.departureRate ?? 12);
    const depositRate = Math.max(0, this.params.depositRate);
    const speed = Math.max(0, this.toWorldLength(this.params.speed, 0.012));
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
          ant.heading = this.randAngle();
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
      const stochastic = this.randFloatSpread(2) * this.params.noiseStrength;

      if (ant.carrying) {
        // Returning ants do not "see" nest directly.
        // They primarily follow home pheromone gradient, with a nest-heading bias for robust homing.
        const nestHeading = Math.atan2(this.nest.y - ant.position.y, this.nest.x - ant.position.x);
        const nestHeadingError = shortestAngleDelta(nestHeading - ant.heading);
        const sensorySteer = (rightSignal - leftSignal) * turnGain * 1.3;
        const nestSteer = nestHeadingError * goalBias * 0.85;
        ant.heading = wrapAngle(ant.heading + (sensorySteer + nestSteer + stochastic * 0.35) * dt);
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
      const sourceOutsideNest = Boolean(foodSource) &&
        foodSource.position.distanceToSquared(this.nest) >
          (nestRadius + foodPickupRadius) * (nestRadius + foodPickupRadius);
      if (!ant.carrying && !reachedNest && sourceOutsideNest && foodSource) {
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

    if (hasAnyLostBoundaryAxis(this.params)) {
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

    const antScale = this.getAntBodyScale();
    const floorZ = -this.params.worldSizeZ * 0.5 + Math.max(0.006, antScale * 0.7);
    for (let i = 0; i < this.ants.length; i += 1) {
      const ant = this.ants[i];
      this.tempObject.position.set(ant.position.x, ant.position.y, floorZ);
      this.tempObject.rotation.set(0, 0, ant.heading - Math.PI * 0.5);
      this.tempObject.scale.setScalar(antScale);
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

  getAntBodyScale() {
    const configuredLength = Number(this.params.visualSizeAnt);
    if (Number.isFinite(configuredLength) && configuredLength > 0) {
      return Math.max(0.0005, configuredLength / 1.05);
    }
    return Math.max(0.0005, getAntVisualSizeDefault() / 1.05);
  }

  applyAntColor(ant, outColor) {
    const mode = this.params.colorMode ?? "state";
    if (mode === "solid") {
      this.antSolidColor.set(getAntSolidColor(this.params, "ant"));
      outColor.copy(this.antSolidColor);
      return;
    }

    if (mode === "state") {
      const stateColors = getAntStateColors(this.params);
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

    this.syncMarkerColors();

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

  syncMarkerColors() {
    // Food and nest are not controlled by colormap/state modes; keep their
    // configured single-color values persistent across all color modes.
    this.foodMarkerMaterial.color.set(getAntSolidColor(this.params, "food"));
    this.nestMarkerMaterial.color.set(getAntSolidColor(this.params, "nest"));
    this.foodMarkerMaterial.needsUpdate = true;
    this.nestMarkerMaterial.needsUpdate = true;
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
    const worldMinAxis = Math.max(0.1, Math.min(this.params.worldSizeX, this.params.worldSizeY));
    const nestRadius = Math.max(0.02, worldMinAxis * 0.025);
    const pickupRadius = Math.max(0.005, Number(this.params.pickupRadius) || 0.04);
    const minSafeRadius = nestRadius + pickupRadius + Math.max(0.02, worldMinAxis * 0.01);
    const minRadius = Math.max(minAxis * 0.12, 0.08, minSafeRadius);
    const maxRadius = Math.max(minRadius + 0.02, minAxis * 0.5);
    const angle = this.randAngle();
    const radius = this.randFloat(minRadius, maxRadius);
    const edgeMargin = Math.min(0.2, minAxis * 0.2);
    const x = THREE.MathUtils.clamp(Math.cos(angle) * radius, -halfX + edgeMargin, halfX - edgeMargin);
    const y = THREE.MathUtils.clamp(Math.sin(angle) * radius, -halfY + edgeMargin, halfY - edgeMargin);

    return [{ position: new THREE.Vector2(x, y), massUg: baseMass }];
  }

  diffuseAndEvaporate(dt) {
    const size = this.fieldSize;
    const diffusion = THREE.MathUtils.clamp(this.params.diffusionRate * dt, 0, 0.45);
    const decay = THREE.MathUtils.clamp(this.params.evapRate * dt, 0, 0.95);
    const periodicXY = isPeriodicXYBoundary(this.params);

    for (let y = 0; y < size; y += 1) {
      const yUp = y === 0 ? (periodicXY ? size - 1 : 0) : y - 1;
      const yDown = y === size - 1 ? (periodicXY ? 0 : size - 1) : y + 1;

      for (let x = 0; x < size; x += 1) {
        const xLeft = x === 0 ? (periodicXY ? size - 1 : 0) : x - 1;
        const xRight = x === size - 1 ? (periodicXY ? 0 : size - 1) : x + 1;

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
    const visualScaleCompensation = 0.4;
    const rawRadius = this.toWorldLength(0.01 + Math.cbrt(safeMass) * 0.0015, 0.01) * visualScaleCompensation;
    const minRadius = this.toWorldLength(0.008, 0.008) * visualScaleCompensation;
    const maxRadius = this.toWorldLength(0.08, 0.08) * visualScaleCompensation;
    return THREE.MathUtils.clamp(rawRadius, minRadius, maxRadius);
  }

  getWorldUnitsPerMeter() {
    const lengthUnitToSI = Number(ANT_APPLET_CONFIG?.unit?.length?.toSI);
    if (!Number.isFinite(lengthUnitToSI) || lengthUnitToSI <= 0) {
      return 1;
    }
    return 1 / lengthUnitToSI;
  }

  toWorldLength(value, fallback = 0) {
    const numeric = Number(value);
    const baseMeters = Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
    return baseMeters * this.getWorldUnitsPerMeter();
  }

  randFloat(min, max) {
    const safeMin = Number.isFinite(min) ? min : 0;
    const safeMax = Number.isFinite(max) ? max : safeMin;
    const low = Math.min(safeMin, safeMax);
    const high = Math.max(safeMin, safeMax);
    return low + (high - low) * this.random();
  }

  randFloatSpread(range) {
    const safeRange = Number.isFinite(range) ? range : 0;
    return (this.random() - 0.5) * safeRange;
  }

  randAngle() {
    return this.random() * Math.PI * 2;
  }

  applyBoundaryConditions(ant) {
    const halfX = this.params.worldSizeX * 0.5;
    const halfY = this.params.worldSizeY * 0.5;
    const axes = getBoundaryAxes(this.params);

    if (axes.x === "cyclic") {
      ant.position.x = wrapAxisLocal(ant.position.x, halfX);
    }
    if (axes.y === "cyclic") {
      ant.position.y = wrapAxisLocal(ant.position.y, halfY);
    }

    const outX = axes.x === "lost" && Math.abs(ant.position.x) > halfX;
    const outY = axes.y === "lost" && Math.abs(ant.position.y) > halfY;
    ant.lost = outX || outY;
    return !ant.lost;
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

function buildAntColormapConfig({
  params,
  simulation,
  continuousColormapOptions,
  continuousColormapGradients,
}) {
  const colorMode = params?.colorMode || "state";
  const colormap = params?.colormap || "turbo";
  const colorModeOption = getAntColorModeOption(colorMode);
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

  if (colorMode === "state") {
    return {
      visible: false,
      value: colormap,
      options: [],
      setValue() {},
      legend: null,
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
      minText: `min: -180${unit}`,
      maxText: `max: 180${unit}`,
    },
  };
}

function getAntColorModeOption(colorMode) {
  const visualParams = Array.isArray(ANT_APPLET_CONFIG.visual?.params)
    ? ANT_APPLET_CONFIG.visual.params
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

function getAntSolidColorDefaults() {
  const colorEntries = Array.isArray(ANT_APPLET_CONFIG.visual?.color)
    ? ANT_APPLET_CONFIG.visual.color
    : [];
  const antEntry = colorEntries.find((entry) => String(entry?.key || "").trim() === "ant");
  const foodEntry = colorEntries.find((entry) => String(entry?.key || "").trim() === "food");
  const nestEntry = colorEntries.find((entry) => String(entry?.key || "").trim() === "nest");
  return {
    ant: normalizeHexColor(antEntry?.default, "#62d6f9"),
    food: normalizeHexColor(foodEntry?.default, "#ffad52"),
    nest: normalizeHexColor(nestEntry?.default, "#5b9dff"),
  };
}

function getAntSolidColor(params, type) {
  const defaults = getAntSolidColorDefaults();
  if (type === "food") {
    return normalizeHexColor(params?.solidColorFood ?? defaults.food, defaults.food);
  }
  if (type === "nest") {
    return normalizeHexColor(params?.solidColorNest ?? defaults.nest, defaults.nest);
  }
  return normalizeHexColor(params?.solidColorAnt ?? defaults.ant, defaults.ant);
}

function getAntVisualSizeDefault() {
  const sizeEntries = Array.isArray(ANT_APPLET_CONFIG.visual?.size)
    ? ANT_APPLET_CONFIG.visual.size
    : [];
  const antEntry = sizeEntries.find((entry) => String(entry?.key || "").trim() === "ant");
  const fallbackEntry = sizeEntries[0] || null;
  const fallback = 15;
  const value = Number(antEntry?.default ?? fallbackEntry?.default ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
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

function isPeriodicXYBoundary(params) {
  const axes = getBoundaryAxes(params);
  return axes.x === "cyclic" && axes.y === "cyclic";
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

function hasAnyLostBoundaryAxis(params) {
  const axes = getBoundaryAxes(params);
  return axes.x === "lost" || axes.y === "lost" || axes.z === "lost";
}

function shortestAngleDelta(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function clampAntSeed(seedValue) {
  const { min, max } = getRandomSeedBounds(ANT_APPLET_CONFIG);
  const numeric = Number(seedValue);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  const rounded = Math.round(numeric);
  return THREE.MathUtils.clamp(rounded, min, max);
}

function createSeededRandomGenerator(seedValue) {
  let seed = clampAntSeed(seedValue) >>> 0;
  seed = (seed ^ 0xa5a5a5a5) >>> 0;
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getRandomSeedBounds(appletConfig) {
  const simulationParams = Array.isArray(appletConfig?.simulation?.params) ? appletConfig.simulation.params : [];
  const randomSeedParam = simulationParams.find((entry) => String(entry?.key || "").trim() === "randomSeed");
  const min = Number(randomSeedParam?.uiMin);
  const max = Number(randomSeedParam?.uiMax);
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return {
      min: Math.min(Math.round(min), Math.round(max)),
      max: Math.max(Math.round(min), Math.round(max)),
    };
  }
  const fallback = Math.round(Number(randomSeedParam?.default) || 0);
  return { min: fallback, max: fallback };
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

function getAntStateColors(params) {
  const searching = new THREE.Color(params?.stateColorSearching || "#5fd6fa").getHex();
  const carrying = new THREE.Color(params?.stateColorCarrying || "#faad42").getHex();
  return { searching, carrying };
}
