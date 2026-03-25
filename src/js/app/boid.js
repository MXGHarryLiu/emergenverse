// Boids applet config and simulation implementation.
import * as THREE from "three";
import { validateAppletConfig } from "./appletConfigUtils.js";
import boidConfigData from "./boid_config.json" with { type: "json" };
import { BaseSimulation } from "./baseSimulation.js";

// Applet UI and metadata configuration.
export const BOID_APPLET_CONFIG = validateAppletConfig(boidConfigData);

const BOID_REALISM_SUN_AZIMUTH_DEFAULT_DEG = 36;
const BOID_REALISM_SUN_ELEVATION_DEFAULT_DEG = 42;
const BOID_REALISM_SUN_INTENSITY = 1.15;
const BOID_REALISM_SKY_INTENSITY = 0.8;
const BOID_REALISM_SKY_COLOR = "#92b7e8";
const BOID_REALISM_GROUND_COLOR = "#7d9169";
const BOID_REALISM_HORIZON_COLOR = "#d5dcc9";
const BOID_REALISM_SUN_COLOR = "#fff5d7";

// Realism parameter resolver scaffold (kept local for now, reusable by other applets later).
function resolveRealismAngleParam(params, key, fallbackDeg) {
  const raw = Number(params?.[key]);
  return Number.isFinite(raw) ? raw : fallbackDeg;
}

// Shell runtime hooks.
const BOID_APPLET_RUNTIME = {
  createChartMetrics(createChartMetricsEntry) {
    return [
      createChartMetricsEntry("count", () => "0", {
        stroke: "#7ec4ff",
        fill: "rgba(126, 196, 255, 0.14)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("speed", () => "0.00 m/s", {
        stroke: "#4cd3b6",
        fill: "rgba(76, 211, 182, 0.14)",
        supportsDistribution: true,
        defaultViewMode: "distribution",
        distributionBins: 22,
        distributionSmoothing: 1.3,
        distributionXTickFormatter: (value) => value.toFixed(1),
        distributionYTickFormatter: (value) => `${Math.round(value * 100)}%`,
        axisLabel: "m/s",
        tickFormatter: (value) => value.toFixed(1),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("neighbors", () => "0.00", {
        stroke: "#5aa4ff",
        fill: "rgba(90, 164, 255, 0.14)",
        axisLabel: "count",
        tickFormatter: (value) => (value >= 10 ? value.toFixed(0) : value.toFixed(1)),
        forceZeroMin: true,
      }),
    ];
  },
  applyStats(stats, ui) {
    if (!stats) {
      return;
    }

    const boidCount = stats.count ?? 0;
    const speedSum = stats.speedSum ?? 0;
    const neighborSum = stats.neighborSum ?? 0;
    const speedSamples = stats.speedSamples ?? [];
    const avgSpeed = boidCount > 0 ? speedSum / boidCount : 0;
    const avgNeighbors = boidCount > 0 ? neighborSum / boidCount : 0;

    ui.updateChartMetrics("boid", [boidCount, avgSpeed, avgNeighbors], [
      String(boidCount),
      `${avgSpeed.toFixed(2)} m/s`,
      avgNeighbors.toFixed(2),
    ], {
      distributionSamples: {
        speed: speedSamples,
      },
    });
  },
};

// Simulation implementation.
export class BoidSimulation extends BaseSimulation {
  static APPLET_ID = "boid";
  static APPLET_RUNTIME = BOID_APPLET_RUNTIME;
  static getColormapConfig({ params, simulation, continuousColormapOptions, continuousColormapGradients }) {
    return buildBoidColormapConfig({
      params,
      simulation,
      continuousColormapOptions,
      continuousColormapGradients,
    });
  }

  constructor({ scene, params, world, renderer, onStats }) {
    super({ scene, params, world, renderer, onStats });

    this.geometry = new THREE.ConeGeometry(0.7, 2.6, 10);
    this.geometry.rotateX(Math.PI / 2);
    this.material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      specular: 0x222222,
      shininess: 34,
      flatShading: true,
      side: THREE.DoubleSide,
      vertexColors: false,
      toneMapped: false,
    });

    this.boids = [];
    this.mesh = null;

    this.tempObject = new THREE.Object3D();
    this.forwardVector = new THREE.Vector3(0, 0, 1);
    this.separationDelta = new THREE.Vector3();
    this.alignment = new THREE.Vector3();
    this.cohesion = new THREE.Vector3();
    this.separation = new THREE.Vector3();
    this.velocityDir = new THREE.Vector3();
    this.instanceColor = new THREE.Color();
    this.colormapLerpA = new THREE.Color();
    this.colormapLerpB = new THREE.Color();
    this.solidColorValue = new THREE.Color(getBoidSolidColor(this.params));
    this.defaultSpecular = new THREE.Color(0x222222);
    this.realismSpecular = new THREE.Color(0x2f2f2f);

    this.colormaps = buildColormapLUT(BOID_APPLET_CONFIG.visual?.colormap);

    this.realismSkyColor = new THREE.Color(BOID_REALISM_SKY_COLOR);
    this.realismGroundColor = new THREE.Color(BOID_REALISM_GROUND_COLOR);
    this.realismHorizonColor = new THREE.Color(BOID_REALISM_HORIZON_COLOR);
    this.realismSunColor = new THREE.Color(BOID_REALISM_SUN_COLOR);
    this.realismSunDirection = new THREE.Vector3(0, 0, 1);
    this.isRealismActive = false;
    this.isVisible = true;

    this.realismSunLight = new THREE.DirectionalLight(this.realismSunColor, BOID_REALISM_SUN_INTENSITY);
    this.realismSunLight.visible = false;
    this.realismSunLight.castShadow = false;
    this.realismSunLight.shadow.mapSize.set(1024, 1024);
    this.realismSunLight.shadow.bias = -0.00035;
    this.realismSunLight.shadow.normalBias = 0.02;
    this.scene.add(this.realismSunLight);
    this.scene.add(this.realismSunLight.target);

    this.realismSkyLight = new THREE.HemisphereLight(
      this.realismSkyColor,
      this.realismGroundColor,
      BOID_REALISM_SKY_INTENSITY,
    );
    this.realismSkyLight.visible = false;
    this.scene.add(this.realismSkyLight);

    this.realismSkyDome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 20),
      createBoidRealismSkyMaterial({
        skyColor: this.realismSkyColor,
        groundColor: this.realismGroundColor,
        horizonColor: this.realismHorizonColor,
        sunColor: this.realismSunColor,
        sunDirection: this.realismSunDirection,
      }),
    );
    this.realismSkyDome.visible = false;
    this.realismSkyDome.renderOrder = -50;
    this.realismSkyDome.frustumCulled = false;
    this.scene.add(this.realismSkyDome);

    this.realismShadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShadowMaterial({
        color: 0x000000,
        opacity: 0.26,
      }),
    );
    this.realismShadowCatcher.visible = false;
    this.realismShadowCatcher.receiveShadow = true;
    this.realismShadowCatcher.renderOrder = -15;
    this.scene.add(this.realismShadowCatcher);
  }

  init() {
    this.spawn(this.params.count);
    this.updateRealismEnvironment();
  }

  setVisible(visible) {
    this.isVisible = Boolean(visible);
    if (this.mesh) {
      this.mesh.visible = this.isVisible;
    }
    this.updateRealismEnvironment();
  }

  onTheme(theme) {
    const baseSpecular = theme === "light" ? 0x2c2c2c : 0x1c1c1c;
    this.defaultSpecular.set(baseSpecular);
    this.material.specular.copy(this.defaultSpecular);
    this.updateRealismEnvironment();
  }

  reset() {
    this.spawn(this.params.count);
  }

  setCount(count) {
    this.params.count = count;
    this.spawn(count);
  }

  getCount() {
    return this.boids.length;
  }

  getMesh() {
    return this.mesh;
  }

  onWorldGeometryChanged() {
    for (let i = 0; i < this.boids.length; i += 1) {
      this.world.applyBoundaryConditions(this.boids[i]);
    }
    if (hasAnyLostBoundaryAxis(this.params)) {
      this.removeLostBoids();
    }
    this.syncInstances();
    this.emitCurrentStats();
    this.updateRealismEnvironmentGeometry();
  }

  onBoundaryChanged() {
    for (let i = 0; i < this.boids.length; i += 1) {
      this.world.applyBoundaryConditions(this.boids[i]);
    }

    if (hasAnyLostBoundaryAxis(this.params)) {
      this.removeLostBoids();
    }

    this.syncInstances();
    this.emitCurrentStats();
  }

  syncInstances() {
    if (!this.mesh) {
      return;
    }

    const colorMode = String(this.params.colorMode || "solid").trim();
    const usesFixedSingleColor = colorMode === "solid" || colorMode === "realism";
    const halfZ = this.params.worldSizeZ * 0.5;
    const colorBounds =
      usesFixedSingleColor ? null : this.getColorScalarBounds(halfZ);
    const solidColor = getBoidSolidColor(this.params);

    for (let i = 0; i < this.boids.length; i += 1) {
      const boid = this.boids[i];

      this.velocityDir.copy(boid.velocity);
      if (this.velocityDir.lengthSq() < 0.00001) {
        this.velocityDir.copy(this.forwardVector);
      } else {
        this.velocityDir.normalize();
      }

      this.tempObject.position.copy(boid.position);
      this.tempObject.quaternion.setFromUnitVectors(this.forwardVector, this.velocityDir);
      this.tempObject.scale.setScalar(getBoidVisualSize(this.params));
      this.tempObject.updateMatrix();
      this.mesh.setMatrixAt(i, this.tempObject.matrix);

      if (usesFixedSingleColor) {
        this.solidColorValue.set(solidColor);
        this.instanceColor.copy(this.solidColorValue);
      } else {
        const scalar = this.computeColorScalar(boid, halfZ);
        const span = Math.max((colorBounds?.max ?? 1) - (colorBounds?.min ?? 0), 0.000001);
        const factor = THREE.MathUtils.clamp((scalar - (colorBounds?.min ?? 0)) / span, 0, 1);
        const liftedFactor = 0.08 + factor * 0.84;
        this.applyColormap(liftedFactor, this.instanceColor);
      }

      ensureVisibleColor(this.instanceColor, 0.25);
      this.mesh.setColorAt(i, this.instanceColor);
    }

    this.mesh.count = this.boids.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }

    this.updateRealismEnvironment();
  }

  step(dt) {
    const perceptionSq = this.params.perceptionRadius * this.params.perceptionRadius;
    const separationSq = this.params.separationDistance * this.params.separationDistance;
    const usingLostBounds = hasAnyLostBoundaryAxis(this.params);

    let speedSum = 0;
    let neighborSum = 0;

    for (let i = 0; i < this.boids.length; i += 1) {
      const boid = this.boids[i];

      this.alignment.set(0, 0, 0);
      this.cohesion.set(0, 0, 0);
      this.separation.set(0, 0, 0);

      let neighborCount = 0;
      let separationCount = 0;

      for (let j = 0; j < this.boids.length; j += 1) {
        if (j === i) {
          continue;
        }

        const other = this.boids[j];
        const distSq = boid.position.distanceToSquared(other.position);

        if (distSq < perceptionSq) {
          this.alignment.add(other.velocity);
          this.cohesion.add(other.position);
          neighborCount += 1;
        }

        if (distSq < separationSq && distSq > 0.000001) {
          this.separationDelta.subVectors(boid.position, other.position);
          this.separationDelta.divideScalar(distSq);
          this.separation.add(this.separationDelta);
          separationCount += 1;
        }
      }

      boid.neighbors = neighborCount;
      boid.acceleration.set(0, 0, 0);

      if (neighborCount > 0) {
        this.alignment.divideScalar(neighborCount);
        if (this.alignment.lengthSq() > 0) {
          this.alignment.setLength(this.params.maxSpeed);
          this.alignment.sub(boid.velocity);
          limitVector(this.alignment, this.params.maxAccel);
          this.alignment.multiplyScalar(this.params.alignmentWeight);
          boid.acceleration.add(this.alignment);
        }

        this.cohesion.divideScalar(neighborCount);
        this.cohesion.sub(boid.position);
        if (this.cohesion.lengthSq() > 0) {
          this.cohesion.setLength(this.params.maxSpeed);
          this.cohesion.sub(boid.velocity);
          limitVector(this.cohesion, this.params.maxAccel);
          this.cohesion.multiplyScalar(this.params.cohesionWeight);
          boid.acceleration.add(this.cohesion);
        }
      }

      if (separationCount > 0) {
        this.separation.divideScalar(separationCount);
        if (this.separation.lengthSq() > 0) {
          this.separation.setLength(this.params.maxSpeed);
          this.separation.sub(boid.velocity);
          limitVector(this.separation, this.params.maxAccel);
          this.separation.multiplyScalar(this.params.separationWeight);
          boid.acceleration.add(this.separation);
        }
      }

      boid.velocity.addScaledVector(boid.acceleration, dt);
      const minSpeed = Math.min(this.params.minSpeed, this.params.maxSpeed * 0.85);
      enforceSpeedBounds(boid.velocity, minSpeed, this.params.maxSpeed);
      boid.position.addScaledVector(boid.velocity, dt);

      const activeBoid = this.world.applyBoundaryConditions(boid);
      if (!activeBoid) {
        continue;
      }

      speedSum += boid.velocity.length();
      neighborSum += boid.neighbors;
    }

    if (usingLostBounds) {
      this.removeLostBoids();
    }

    this.syncInstances();
    this.emitStats(speedSum, neighborSum);
  }

  spawn(count) {
    this.boids.length = 0;

    const spawnRangeX = this.params.worldSizeX * 0.9;
    const spawnRangeY = this.params.worldSizeY * 0.9;
    const spawnRangeZ = this.params.worldSizeZ * 0.9;

    for (let i = 0; i < count; i += 1) {
      const startVelocity = randomDirection().multiplyScalar(
        THREE.MathUtils.randFloat(this.params.maxSpeed * 0.45, this.params.maxSpeed * 0.95),
      );

      this.boids.push({
        position: new THREE.Vector3(
          THREE.MathUtils.randFloatSpread(spawnRangeX),
          THREE.MathUtils.randFloatSpread(spawnRangeY),
          THREE.MathUtils.randFloatSpread(spawnRangeZ),
        ),
        velocity: startVelocity,
        acceleration: new THREE.Vector3(),
        neighbors: 0,
        lost: false,
      });
    }

    this.rebuildMesh();
    this.syncInstances();
    this.emitCurrentStats();
  }

  rebuildMesh() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh = null;
    }

    const capacity = Math.max(this.boids.length, 1);
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.count = this.boids.length;
    this.mesh.visible = this.isVisible;
    this.mesh.castShadow = this.isRealismActive;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < capacity; i += 1) {
      this.mesh.instanceColor.setXYZ(i, 1, 1, 1);
    }
    this.material.needsUpdate = true;
    this.scene.add(this.mesh);
    this.updateRealismEnvironment();
  }

  updateRealismEnvironment() {
    const colorMode = String(this.params.colorMode || "solid").trim();
    const realismEnabled = this.isVisible && colorMode === "realism";
    this.isRealismActive = realismEnabled;
    this.realismSunLight.visible = realismEnabled;
    this.realismSkyLight.visible = realismEnabled;
    this.realismSkyDome.visible = realismEnabled;
    this.realismShadowCatcher.visible = realismEnabled;
    this.realismSunLight.castShadow = realismEnabled;
    if (this.mesh) {
      this.mesh.castShadow = realismEnabled;
    }
    if (this.renderer?.shadowMap) {
      this.renderer.shadowMap.enabled = this.renderer.shadowMap.enabled || realismEnabled;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
    }
    this.material.specular.copy(realismEnabled ? this.realismSpecular : this.defaultSpecular);
    this.updateRealismEnvironmentGeometry();
  }

  updateRealismEnvironmentGeometry() {
    if (!this.isVisible) {
      return;
    }
    const halfX = Math.max(1, Number(this.params.worldSizeX) * 0.5);
    const halfY = Math.max(1, Number(this.params.worldSizeY) * 0.5);
    const halfZ = Math.max(1, Number(this.params.worldSizeZ) * 0.5);
    const maxExtent = Math.max(halfX, halfY, halfZ);

    const azimuthDeg = resolveRealismAngleParam(
      this.params,
      "sunAzimuth",
      BOID_REALISM_SUN_AZIMUTH_DEFAULT_DEG,
    );
    const elevationDeg = resolveRealismAngleParam(
      this.params,
      "sunElevation",
      BOID_REALISM_SUN_ELEVATION_DEFAULT_DEG,
    );
    const azimuth = THREE.MathUtils.degToRad(azimuthDeg);
    const elevation = THREE.MathUtils.degToRad(elevationDeg);
    const radius = Math.max(20, maxExtent * 3.2);
    const sunDirX = Math.cos(elevation) * Math.cos(azimuth);
    const sunDirY = Math.cos(elevation) * Math.sin(azimuth);
    const sunDirZ = Math.sin(elevation);
    this.realismSunDirection.set(sunDirX, sunDirY, sunDirZ).normalize();
    this.realismSunLight.position.set(radius * sunDirX, radius * sunDirY, radius * sunDirZ);
    this.realismSunLight.target.position.set(0, 0, 0);
    this.realismSunLight.target.updateMatrixWorld();
    const shadowFrustum = Math.max(40, maxExtent * 2.8);
    const shadowCam = this.realismSunLight.shadow.camera;
    shadowCam.left = -shadowFrustum;
    shadowCam.right = shadowFrustum;
    shadowCam.top = shadowFrustum;
    shadowCam.bottom = -shadowFrustum;
    shadowCam.near = 1;
    shadowCam.far = Math.max(400, maxExtent * 10);
    shadowCam.updateProjectionMatrix();

    const skyRadius = Math.max(10, maxExtent * 6);
    this.realismSkyDome.position.set(0, 0, 0);
    this.realismSkyDome.scale.setScalar(skyRadius);
    this.realismSkyDome.material.uniforms.uSunDir.value.copy(this.realismSunDirection);
    this.realismShadowCatcher.position.set(0, 0, -halfZ + 0.02);
    this.realismShadowCatcher.scale.set(maxExtent * 12, maxExtent * 12, 1);
  }

  removeLostBoids() {
    let removed = false;
    for (let i = this.boids.length - 1; i >= 0; i -= 1) {
      if (this.boids[i].lost) {
        this.boids.splice(i, 1);
        removed = true;
      }
    }

    if (removed) {
      this.rebuildMesh();
    }
  }

  emitCurrentStats() {
    let speedSum = 0;
    let neighborSum = 0;
    for (let i = 0; i < this.boids.length; i += 1) {
      speedSum += this.boids[i].velocity.length();
      neighborSum += this.boids[i].neighbors;
    }
    this.emitStats(speedSum, neighborSum);
  }

  emitStats(speedSum, neighborSum) {
    if (typeof this.onStats !== "function") {
      return;
    }
    const speedSamples = new Float32Array(this.boids.length);
    for (let i = 0; i < this.boids.length; i += 1) {
      speedSamples[i] = this.boids[i].velocity.length();
    }
    this.onStats({
      count: this.boids.length,
      speedSum,
      neighborSum,
      speedSamples,
    });
  }

  computeColorScalar(boid, halfZ) {
    if (this.params.colorMode === "speed") {
      return boid.velocity.length();
    }

    if (this.params.colorMode === "altitude") {
      return boid.position.z;
    }

    if (this.params.colorMode === "neighbors") {
      return boid.neighbors;
    }

    if (this.params.colorMode === "heading") {
      this.velocityDir.copy(boid.velocity);
      if (this.velocityDir.lengthSq() < 0.00001) {
        return 0;
      }
      this.velocityDir.normalize();
      return this.velocityDir.z;
    }

    return 0;
  }

  getColorScalarBounds(halfZ) {
    if (this.params.colorMode === "altitude") {
      return { min: -halfZ, max: halfZ };
    }

    if (this.params.colorMode === "heading") {
      return { min: -1, max: 1 };
    }

    if (this.boids.length === 0) {
      return this.params.colorMode === "neighbors"
        ? { min: 0, max: 16 }
        : { min: 0, max: Math.max(this.params.maxSpeed, 1) };
    }

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < this.boids.length; i += 1) {
      const scalar = this.computeColorScalar(this.boids[i], halfZ);
      if (scalar < min) {
        min = scalar;
      }
      if (scalar > max) {
        max = scalar;
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return this.params.colorMode === "neighbors"
        ? { min: 0, max: 16 }
        : { min: 0, max: Math.max(this.params.maxSpeed, 1) };
    }

    if (max - min < 0.0001) {
      return { min: min - 0.5, max: max + 0.5 };
    }

    return { min, max };
  }

  applyColormap(value, outColor) {
    const colors = this.colormaps[this.params.colormap] || this.colormaps.turbo;
    if (!colors || colors.length === 0) {
      return outColor.setRGB(1, 1, 1);
    }

    const normalized = this.params.colormapInverted ? 1 - value : value;
    const clamped = THREE.MathUtils.clamp(normalized, 0, 1);
    if (colors.length === 1) {
      return outColor.copy(colors[0]);
    }

    const scaled = clamped * (colors.length - 1);
    const index = Math.min(colors.length - 2, Math.floor(scaled));
    const t = scaled - index;

    this.colormapLerpA.copy(colors[index]);
    this.colormapLerpB.copy(colors[index + 1]);
    return outColor.copy(this.colormapLerpA).lerp(this.colormapLerpB, t);
  }
}

// File-local helper functions.
function createBoidRealismSkyMaterial({
  skyColor,
  groundColor,
  horizonColor,
  sunColor,
  sunDirection,
}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSkyColor: { value: skyColor.clone() },
      uGroundColor: { value: groundColor.clone() },
      uHorizonColor: { value: horizonColor.clone() },
      uSunColor: { value: sunColor.clone() },
      uSunDir: { value: sunDirection.clone() },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSkyColor;
      uniform vec3 uGroundColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      varying vec3 vWorldPos;

      float hash13(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      void main() {
        vec3 viewDir = normalize(vWorldPos - cameraPosition);
        vec3 sunDir = normalize(uSunDir);
        float upMix = clamp(viewDir.z * 0.5 + 0.5, 0.0, 1.0);
        float rawSunAlt = clamp(sunDir.z, -1.0, 1.0);
        float sunAlt = clamp(rawSunAlt, 0.0, 1.0);
        float lowSun = 1.0 - sunAlt;
        float dayFactor = smoothstep(0.06, 0.45, rawSunAlt);
        float nightFactor = 1.0 - smoothstep(-0.28, -0.04, rawSunAlt);
        float twilightFactor = clamp(1.0 - dayFactor - nightFactor, 0.0, 1.0);
        float sunVisibility = step(0.0, rawSunAlt);
        float sunFacing = max(dot(viewDir, sunDir), 0.0);
        float antiSunFacing = max(dot(viewDir, -sunDir), 0.0);

        // Multi-tone atmosphere palette (4-5 tones) for day and twilight.
        vec3 dayZenith = mix(uSkyColor, vec3(0.28, 0.46, 0.82), 0.34);      // deep blue
        vec3 dayMid = vec3(0.47, 0.66, 0.96);                                // middle blue
        vec3 daySunside = vec3(0.93, 0.97, 1.00);                            // near-sun white-blue
        vec3 dayHorizon = vec3(0.80, 0.89, 0.98);                            // bright pale horizon

        vec3 twZenith = vec3(0.13, 0.12, 0.24);                              // dark purple-blue
        vec3 twMid = vec3(0.24, 0.34, 0.58);                                 // middle twilight blue
        vec3 twHorizonBlue = vec3(0.38, 0.52, 0.73);                         // cool band near horizon
        vec3 twSunGlow = vec3(1.00, 0.60, 0.28);                             // orange-yellow
        vec3 twSunCore = vec3(1.00, 0.44, 0.20);                             // red-orange core

        vec3 nightZenith = vec3(0.015, 0.020, 0.045);
        vec3 nightMid = vec3(0.028, 0.040, 0.080);
        vec3 nightHorizon = vec3(0.050, 0.070, 0.115);

        vec3 zenithColor = mix(twZenith, dayZenith, dayFactor);
        vec3 midColor = mix(twMid, dayMid, dayFactor);
        vec3 horizonBase = mix(twHorizonBlue, dayHorizon, dayFactor);
        zenithColor = mix(zenithColor, nightZenith, nightFactor);
        midColor = mix(midColor, nightMid, nightFactor);
        horizonBase = mix(horizonBase, nightHorizon, nightFactor);

        // Vertical gradient: zenith -> mid -> horizon.
        float midBlend = smoothstep(0.40, 0.72, upMix);
        vec3 verticalColor = mix(horizonBase, midColor, midBlend);
        verticalColor = mix(verticalColor, zenithColor, smoothstep(0.72, 0.96, upMix));

        // Sun-side whitening in day, warm glow in low-sun conditions.
        float nearSun = pow(sunFacing, 2.2);
        float nearSunCore = pow(sunFacing, 9.0);
        vec3 sunSideDay = mix(verticalColor, daySunside, nearSun * 0.55 * dayFactor);
        vec3 sunSideTwilight = mix(
          verticalColor,
          mix(twSunGlow, twSunCore, nearSunCore),
          nearSun * (0.45 + 0.35 * lowSun)
        );
        vec3 skyColor = mix(sunSideTwilight, sunSideDay, dayFactor);

        // Anti-solar twilight colors (Belt of Venus + Earth shadow band).
        float beltBand = exp(-pow((upMix - 0.545) / 0.048, 2.0));
        float earthShadowBand = exp(-pow((upMix - 0.455) / 0.040, 2.0));
        float beltStrength = twilightFactor * pow(antiSunFacing, 1.7) * beltBand;
        float earthShadowStrength = twilightFactor * pow(antiSunFacing, 1.35) * earthShadowBand;
        vec3 beltColor = mix(vec3(0.72, 0.56, 0.76), vec3(0.96, 0.73, 0.79), smoothstep(-0.10, 0.08, rawSunAlt));
        skyColor = mix(skyColor, beltColor, beltStrength * 0.55);
        skyColor = mix(skyColor, vec3(0.10, 0.14, 0.24), earthShadowStrength * 0.62);

        // Ground shading reacts to sun elevation + azimuth (directional realism).
        vec2 sunPlanar = sunDir.xy;
        vec2 viewPlanar = viewDir.xy;
        float sunPlanarLen = max(length(sunPlanar), 1e-6);
        float viewPlanarLen = length(viewPlanar);
        float groundFacingRaw = max(dot(viewPlanar / max(viewPlanarLen, 1e-6), sunPlanar / sunPlanarLen), 0.0);
        float planarStability = smoothstep(0.08, 0.22, viewPlanarLen);
        float groundFacing = mix(0.5, groundFacingRaw, planarStability);
        float groundSun = sunVisibility * (0.20 + 0.80 * sunAlt) * (0.35 + 0.65 * groundFacing);
        float groundAmbient = mix(0.13, 0.40, dayFactor) + 0.10 * twilightFactor;
        float groundShade = clamp(groundAmbient + groundSun, 0.05, 1.0);
        vec3 groundLit = uGroundColor * groundShade;
        vec3 groundWarm = mix(uGroundColor, vec3(0.86, 0.66, 0.38), 0.42 * (0.20 + 0.80 * lowSun));
        groundLit = mix(groundLit, groundWarm, 0.35 * sunVisibility * groundFacing);

        // Clear horizon split with a crisp horizon line.
        float skyMix = smoothstep(0.498, 0.502, upMix);
        vec3 skyGround = mix(groundLit, skyColor, skyMix);
        float horizonBand = exp(-pow((upMix - 0.5) / 0.010, 2.0));
        vec3 baseColor = mix(skyGround, horizonBase, horizonBand * (0.10 + 0.14 * lowSun));
        float horizonLine = exp(-pow((upMix - 0.5) / 0.0028, 2.0));
        vec3 horizonLineColor = mix(vec3(0.88, 0.86, 0.80), horizonBase, 0.55);
        baseColor = mix(baseColor, horizonLineColor, horizonLine * 0.60);

        // Small atmospheric veil only.
        float aerialPerspective = pow(1.0 - upMix, 3.1);
        baseColor = mix(baseColor, horizonBase, aerialPerspective * (0.010 + 0.030 * lowSun));

        float sunDot = clamp(dot(viewDir, sunDir), -1.0, 1.0);
        float sunHalfAngle = radians(0.53) * 0.5;
        float sunSoftEdge = radians(0.08);
        float sunCore = smoothstep(
          cos(sunHalfAngle + sunSoftEdge),
          cos(sunHalfAngle),
          sunDot
        );
        float sunHalo = pow(max(sunDot, 0.0), 92.0);
        float mieScatter = pow(max(sunDot, 0.0), 10.0);
        float rayleighScatter = (1.0 + sunDot * sunDot) * 0.5;
        float sunScatter = mix(rayleighScatter * 0.07, mieScatter * 0.30, 0.62 + 0.30 * lowSun)
          * (0.12 + 0.88 * smoothstep(0.20, 1.0, upMix));

        vec3 orthoA = normalize(abs(sunDir.z) < 0.999 ? cross(sunDir, vec3(0.0, 0.0, 1.0)) : vec3(1.0, 0.0, 0.0));
        vec3 orthoB = normalize(cross(sunDir, orthoA));
        float tx = dot(viewDir, orthoA);
        float ty = dot(viewDir, orthoB);
        float rayAngle = atan(ty, tx);
        float angularFalloff = pow(max(sunDot, 0.0), 34.0);
        float dayRayStrength = mix(0.05, 0.24, dayFactor);
        float rays = pow(abs(cos(rayAngle * 8.0)), 26.0) * angularFalloff * dayRayStrength * sunVisibility;

        vec3 lowSunWarm = vec3(1.00, 0.70, 0.42);
        vec3 sunTint = mix(lowSunWarm, uSunColor, smoothstep(0.08, 0.65, sunAlt));
        vec3 color = baseColor
          + sunTint * (sunScatter + sunHalo * 0.72 + rays + sunCore * 3.0) * sunVisibility;

        // Procedural random star field (night-weighted, upper sky only).
        float starNight = nightFactor * smoothstep(0.50, 0.66, upMix);
        if (starNight > 0.0001) {
          // Use direction-space hashing to avoid atan seam artifacts in orthographic views.
          vec3 dirSample = normalize(viewDir);
          vec3 starGrid = vec3(220.0, 220.0, 220.0);
          vec3 cell3 = floor((dirSample * 0.5 + 0.5) * starGrid);
          vec3 local3 = fract((dirSample * 0.5 + 0.5) * starGrid) - 0.5;
          float rnd = hash13(cell3);
          float isStar = step(0.9925, rnd);
          float shape = exp(-dot(local3, local3) * 360.0);
          float twinkle = 0.78 + 0.22 * sin(rnd * 240.0 + (cell3.x + cell3.y + cell3.z) * 0.31);
          float starLum = isStar * shape * twinkle;
          float temp = hash13(cell3 + 19.31);
          vec3 starColor = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.95, 0.82), temp);
          color += starColor * starLum * (0.65 * starNight);
        }

        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  });
}

function buildBoidColormapConfig({
  params,
  simulation,
  continuousColormapOptions,
  continuousColormapGradients,
}) {
  const colorMode = params?.colorMode || "solid";
  const colormap = params?.colormap || "turbo";
  const range = getBoidColormapRange(colorMode, params);
  const colorModeOption = getBoidColorModeOption(colorMode);
  const unit = String(colorModeOption?.unit || "");

  return {
    visible: colorMode !== "solid" && colorMode !== "realism",
    value: colormap,
    options: continuousColormapOptions,
    setValue(value) {
      params.colormap = value;
      simulation?.syncInstances?.();
    },
    legend: {
      gradient: continuousColormapGradients[colormap] || continuousColormapGradients.turbo,
      minText: `min: ${Number(range.min).toFixed(range.digits)}${unit ? ` ${unit}` : ""}`,
      maxText: `max: ${Number(range.max).toFixed(range.digits)}${unit ? ` ${unit}` : ""}`,
    },
  };
}

function getBoidColormapRange(colorMode, params) {
  if (colorMode === "speed") {
    return {
      min: 0,
      max: params?.maxSpeed ?? 1,
      digits: 1,
    };
  }
  if (colorMode === "altitude") {
    const halfZ = (params?.worldSizeZ ?? 100) * 0.5;
    return {
      min: -halfZ,
      max: halfZ,
      digits: 1,
    };
  }
  if (colorMode === "neighbors") {
    return {
      min: 0,
      max: 16,
      digits: 0,
    };
  }
  return { min: -1, max: 1, digits: 2 };
}

function getBoidColorModeOption(colorMode) {
  const visualParams = Array.isArray(BOID_APPLET_CONFIG.visual?.params)
    ? BOID_APPLET_CONFIG.visual.params
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

function getBoidSolidColorDefault() {
  const colorEntries = Array.isArray(BOID_APPLET_CONFIG.visual?.color)
    ? BOID_APPLET_CONFIG.visual.color
    : [];
  const boidEntry = colorEntries.find((entry) => String(entry?.key || "").trim() === "boid");
  const fallbackEntry = colorEntries[0] || null;
  const fallback = "#4cd3b6";
  return normalizeHexColor(boidEntry?.default ?? fallbackEntry?.default ?? fallback, fallback);
}

function getBoidSolidColor(params) {
  const fallback = getBoidSolidColorDefault();
  return normalizeHexColor(params?.solidColorBoid ?? params?.solidColor ?? fallback, fallback);
}

function getBoidVisualSizeDefault() {
  const sizeEntries = Array.isArray(BOID_APPLET_CONFIG.visual?.size)
    ? BOID_APPLET_CONFIG.visual.size
    : [];
  const boidEntry = sizeEntries.find((entry) => String(entry?.key || "").trim() === "boid");
  const fallbackEntry = sizeEntries[0] || null;
  const fallback = 0.5;
  const value = Number(boidEntry?.default ?? fallbackEntry?.default ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getBoidVisualSize(params) {
  const defaultDiameter = getBoidVisualSizeDefault();
  const configuredDiameter = Number(params?.visualSizeBoid);
  if (Number.isFinite(configuredDiameter) && configuredDiameter > 0) {
    return Math.max(0.001, configuredDiameter / (2 * 0.7));
  }
  return Math.max(0.001, defaultDiameter / (2 * 0.7));
}

function hasAnyLostBoundaryAxis(params) {
  const explicit = params?.boundaryAxes;
  return [explicit?.x, explicit?.y, explicit?.z]
    .some((axisMode) => String(axisMode || "").trim().toLowerCase() === "lost");
}

function buildColormapLUT(colormapEntries) {
  const lut = {};
  const entries = Array.isArray(colormapEntries) ? colormapEntries : [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const name = String((entry?.key ?? "")).trim();
    const stops = Array.isArray(entry?.value) ? entry.value : [];
    if (!name || stops.length === 0) {
      continue;
    }
    lut[name] = stops.map((hex) => new THREE.Color(hex));
  }
  return lut;
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

function limitVector(vector, maxLength) {
  if (maxLength <= 0) {
    vector.set(0, 0, 0);
    return vector;
  }

  const maxLengthSq = maxLength * maxLength;
  if (vector.lengthSq() > maxLengthSq) {
    vector.setLength(maxLength);
  }
  return vector;
}

function enforceSpeedBounds(vector, minSpeed, maxSpeed) {
  const clampedMin = Math.max(0, minSpeed);
  const clampedMax = Math.max(clampedMin, maxSpeed);
  const speed = vector.length();

  if (speed < 0.000001) {
    vector.copy(randomDirection()).multiplyScalar(Math.max(clampedMin, 0.0001));
    return vector;
  }

  const bounded = THREE.MathUtils.clamp(speed, clampedMin, clampedMax);
  vector.multiplyScalar(bounded / speed);
  return vector;
}

function randomDirection() {
  const direction = new THREE.Vector3(
    THREE.MathUtils.randFloatSpread(2),
    THREE.MathUtils.randFloatSpread(2),
    THREE.MathUtils.randFloatSpread(2),
  );

  if (direction.lengthSq() < 0.000001) {
    direction.set(0, 0, 1);
  }

  return direction.normalize();
}
