import * as THREE from "three";

export function createWorldManager({ params, getBoids, onWorldGeometryChanged } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030713);
  scene.fog = new THREE.FogExp2(0x050a17, 0.0022);

  const ambientLight = new THREE.AmbientLight(0x9cb7eb, 1.15);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xbef5ff, 1.1);
  keyLight.position.set(70, -70, 130);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x53d7ba, 0.72);
  fillLight.position.set(-80, 95, -55);
  scene.add(fillLight);

  const starField = buildStarField(900, 680);
  scene.add(starField);

  let boundsLines = null;
  let floorGrid = null;

  function rebuildBoundsAndGrid() {
    if (boundsLines) {
      scene.remove(boundsLines);
      boundsLines.geometry.dispose();
      boundsLines.material.dispose();
    }

    if (floorGrid) {
      scene.remove(floorGrid);
      floorGrid.geometry.dispose();
      if (Array.isArray(floorGrid.material)) {
        floorGrid.material.forEach((material) => material.dispose());
      } else {
        floorGrid.material.dispose();
      }
    }

    const boundsGeometry = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(params.worldSizeX, params.worldSizeY, params.worldSizeZ),
    );
    const boundsMaterial = new THREE.LineBasicMaterial({
      color: 0x4d7dd8,
      transparent: true,
      opacity: 0.4,
    });

    boundsLines = new THREE.LineSegments(boundsGeometry, boundsMaterial);
    boundsLines.visible = params.showBounds;
    scene.add(boundsLines);

    const groundBase = Math.max(params.worldSizeX, params.worldSizeY);
    floorGrid = new THREE.GridHelper(
      groundBase,
      Math.max(10, Math.floor(groundBase / 6)),
      0x4269b2,
      0x1a3558,
    );
    floorGrid.rotation.x = Math.PI / 2;
    floorGrid.scale.set(
      params.worldSizeX / Math.max(groundBase, 1),
      1,
      params.worldSizeY / Math.max(groundBase, 1),
    );
    floorGrid.position.z = -params.worldSizeZ * 0.5;

    const gridMaterials = Array.isArray(floorGrid.material)
      ? floorGrid.material
      : [floorGrid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.2;
    });

    scene.add(floorGrid);

    const boids = typeof getBoids === "function" ? getBoids() : [];
    for (let i = 0; i < boids.length; i += 1) {
      applyBoundaryConditions(boids[i]);
    }

    if (typeof onWorldGeometryChanged === "function") {
      onWorldGeometryChanged();
    }
  }

  function setBoundsVisibility(visible) {
    if (boundsLines) {
      boundsLines.visible = visible;
    }
  }

  function applyBoundaryConditions(boid) {
    const halfX = params.worldSizeX * 0.5;
    const halfY = params.worldSizeY * 0.5;
    const halfZ = params.worldSizeZ * 0.5;

    if (params.boundaryMode === "cyclic") {
      boid.position.x = wrapAxis(boid.position.x, halfX);
      boid.position.y = wrapAxis(boid.position.y, halfY);
      boid.position.z = wrapAxis(boid.position.z, halfZ);
      boid.lost = false;
      return true;
    }

    const outOfBounds =
      Math.abs(boid.position.x) > halfX ||
      Math.abs(boid.position.y) > halfY ||
      Math.abs(boid.position.z) > halfZ;

    boid.lost = outOfBounds;
    return !outOfBounds;
  }

  function applyTheme(theme) {
    if (theme === "light") {
      scene.background.set(0xdfe8f8);
      scene.fog.color.set(0xd8e2f5);
      scene.fog.density = 0.0017;
      return;
    }

    scene.background.set(0x030713);
    scene.fog.color.set(0x050a17);
    scene.fog.density = 0.0022;
  }

  return {
    scene,
    rebuildBoundsAndGrid,
    setBoundsVisibility,
    applyBoundaryConditions,
    applyTheme,
  };
}

function wrapAxis(value, halfExtent) {
  const worldSpan = halfExtent * 2;
  if (worldSpan <= 0) {
    return 0;
  }

  if (value > halfExtent || value < -halfExtent) {
    return ((((value + halfExtent) % worldSpan) + worldSpan) % worldSpan) - halfExtent;
  }

  return value;
}

function buildStarField(count, spread) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const starColor = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    positions[i3] = THREE.MathUtils.randFloatSpread(spread * 2.2);
    positions[i3 + 1] = THREE.MathUtils.randFloatSpread(spread * 2.2);
    positions[i3 + 2] = THREE.MathUtils.randFloat(-spread * 0.8, spread * 1.8);

    starColor.setHSL(
      THREE.MathUtils.randFloat(0.52, 0.64),
      THREE.MathUtils.randFloat(0.28, 0.54),
      THREE.MathUtils.randFloat(0.62, 0.96),
    );

    colors[i3] = starColor.r;
    colors[i3 + 1] = starColor.g;
    colors[i3 + 2] = starColor.b;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.75,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    vertexColors: true,
  });

  return new THREE.Points(geometry, material);
}
