// Spaceship HUD and navball rendering/state.
import * as THREE from "three";

// Marker styles
const NAVBALL_MARKER_STYLE = {
  prograde: { shape: "circle", filled: false, color: "#ccf700" },
  retrograde: { shape: "circle", filled: true, color: "#ccf700" },
  normal: { shape: "triangle-up", filled: false, color: "#db23e8" },
  antinormal: { shape: "triangle-down", filled: true, color: "#db23e8" },
  radialOut: { shape: "square", filled: false, color: "#22d6db" },
  radialIn: { shape: "square", filled: true, color: "#22d6db" },
};

// HUD controller
export function createSpaceshipHudController({
  dom,
  params,
  cameraController,
  getActiveApplet,
  getWorldUnitLabel,
  formatDisplayNumber,
}) {
  // Math state
  const invQuat = new THREE.Quaternion();
  const markerLocal = new THREE.Vector3();
  const radialWorld = new THREE.Vector3();
  const progradeWorld = new THREE.Vector3();
  const viewWorld = new THREE.Vector3();
  const normalWorld = new THREE.Vector3();
  const tmpWorld = new THREE.Vector3();
  const radialLocal = new THREE.Vector3();
  const northLocal = new THREE.Vector3();
  const guideU = new THREE.Vector3();
  const guideV = new THREE.Vector3();
  const guidePoint = new THREE.Vector3();
  const guideRef = new THREE.Vector3();
  const guidePrevU = new THREE.Vector3(1, 0, 0);
  let guideBasisInitialized = false;

  // World basis
  const worldNorthAxis = new THREE.Vector3(0, 1, 0);
  const worldUpAxis = new THREE.Vector3(0, 0, 1);

  // Raster cache
  const rasterCache = {
    width: 0,
    height: 0,
    imageData: null,
  };

  // Utilities
  function clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }

  function getNavballRaster(context, width, height) {
    if (!rasterCache.imageData || rasterCache.width !== width || rasterCache.height !== height) {
      rasterCache.width = width;
      rasterCache.height = height;
      rasterCache.imageData = context.createImageData(width, height);
    }
    return rasterCache.imageData;
  }

  // Background rendering
  function drawNavballBackground(context, width, height, centerX, centerY, radius, currentRadialLocal, theme) {
    const imageData = getNavballRaster(context, width, height);
    const data = imageData.data;
    data.fill(0);

    const horizonBand = 0.028;
    const skyTop = theme === "light" ? [133, 170, 228] : [84, 123, 198];
    const skyBottom = theme === "light" ? [94, 133, 195] : [48, 79, 136];
    const groundTop = theme === "light" ? [168, 138, 98] : [122, 98, 69];
    const groundBottom = theme === "light" ? [121, 95, 66] : [78, 57, 40];
    const horizonColor = theme === "light" ? [244, 248, 255] : [210, 223, 247];

    for (let py = 0; py < height; py += 1) {
      const y = (centerY - (py + 0.5)) / radius;
      const verticalLerp = clamp01((y + 1) * 0.5);

      for (let px = 0; px < width; px += 1) {
        const x = ((px + 0.5) - centerX) / radius;
        const rr = x * x + y * y;
        if (rr > 1) {
          continue;
        }

        const z = -Math.sqrt(Math.max(0, 1 - rr));
        const dot = x * currentRadialLocal.x + y * currentRadialLocal.y + z * currentRadialLocal.z;
        const i = ((py * width) + px) * 4;

        let r;
        let g;
        let b;
        if (Math.abs(dot) <= horizonBand) {
          const t = 1 - clamp01(Math.abs(dot) / horizonBand);
          const boost = 0.72 + (0.28 * t);
          r = Math.round(horizonColor[0] * boost);
          g = Math.round(horizonColor[1] * boost);
          b = Math.round(horizonColor[2] * boost);
        } else {
          const top = dot >= 0 ? skyTop : groundTop;
          const bottom = dot >= 0 ? skyBottom : groundBottom;
          const baseR = bottom[0] + ((top[0] - bottom[0]) * verticalLerp);
          const baseG = bottom[1] + ((top[1] - bottom[1]) * verticalLerp);
          const baseB = bottom[2] + ((top[2] - bottom[2]) * verticalLerp);
          const depthShade = 0.76 + (0.24 * clamp01(-z));
          r = Math.round(baseR * depthShade);
          g = Math.round(baseG * depthShade);
          b = Math.round(baseB * depthShade);
        }

        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }

    context.putImageData(imageData, 0, 0);
  }

  // Horizon guides
  function drawNavballPoleGuides(context, centerX, centerY, radius, dpr) {
    if (northLocal.lengthSq() < 1e-8) {
      return;
    }

    guideU.copy(northLocal).cross(radialLocal);
    if (guideU.lengthSq() < 1e-8) {
      if (guideBasisInitialized && guidePrevU.lengthSq() > 1e-8) {
        guideU.copy(guidePrevU);
      } else {
        guideRef.set(1, 0, 0);
        guideU.copy(northLocal).cross(guideRef);
      }
    }
    if (guideU.lengthSq() < 1e-8) {
      return;
    }
    guideU.normalize();
    guideV.copy(northLocal).cross(guideU).normalize();

    guidePrevU.copy(guideU);
    guideBasisInitialized = true;

    context.lineCap = "round";
    context.lineWidth = Math.max(1.3, dpr * 1.55);
    const steps = 192;
    const redColor = "#e15454";
    const blueColor = "#4f93ff";
    const visibilityEpsilon = 0.004;
    let activeSign = 0;
    let pathOpen = false;

    for (let i = 0; i <= steps; i += 1) {
      const t = (Math.PI * 2 * i) / steps;
      guidePoint
        .copy(guideU)
        .multiplyScalar(Math.cos(t))
        .addScaledVector(guideV, Math.sin(t));

      const x = centerX + (guidePoint.x * radius);
      const y = centerY - (guidePoint.y * radius);
      const sign = guidePoint.dot(radialLocal) >= 0 ? 1 : -1;
      const visible = guidePoint.z <= visibilityEpsilon;

      if (!visible) {
        if (pathOpen) {
          context.stroke();
          pathOpen = false;
        }
        continue;
      }

      if (!pathOpen) {
        activeSign = sign;
        context.strokeStyle = activeSign > 0 ? redColor : blueColor;
        context.beginPath();
        context.moveTo(x, y);
        pathOpen = true;
        continue;
      }

      if (sign !== activeSign) {
        context.lineTo(x, y);
        context.stroke();
        activeSign = sign;
        context.strokeStyle = activeSign > 0 ? redColor : blueColor;
        context.beginPath();
        context.moveTo(x, y);
      }

      context.lineTo(x, y);
    }

    if (pathOpen) {
      context.stroke();
    }
  }

  // Marker rendering
  function projectNavballDirection(directionWorld, centerX, centerY, radius) {
    markerLocal.copy(directionWorld).applyQuaternion(invQuat);
    const lengthSq = markerLocal.lengthSq();
    if (lengthSq < 1e-10) {
      return null;
    }

    markerLocal.multiplyScalar(1 / Math.sqrt(lengthSq));
    if (markerLocal.z > 0.04) {
      return null;
    }

    const depth = clamp01(-markerLocal.z);
    return {
      x: centerX + (markerLocal.x * radius),
      y: centerY - (markerLocal.y * radius),
      depth,
    };
  }

  function drawNavballMarker(context, markerKey, directionWorld, centerX, centerY, radius, dpr) {
    const style = NAVBALL_MARKER_STYLE[markerKey];
    if (!style) {
      return;
    }

    const projected = projectNavballDirection(directionWorld, centerX, centerY, radius);
    if (!projected) {
      return;
    }

    const alpha = 0.46 + (0.54 * projected.depth);
    const markerSize = Math.max(7 * dpr, (9.6 * dpr) * (0.72 + (0.44 * projected.depth)));
    const half = markerSize * 0.5;
    const lineWidth = Math.max(1.2, dpr * 1.35);

    context.save();
    context.globalAlpha = alpha;
    context.strokeStyle = style.color;
    context.fillStyle = style.color;
    context.lineWidth = lineWidth;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.translate(projected.x, projected.y);

    if (style.shape === "circle") {
      context.beginPath();
      context.arc(0, 0, half * 0.9, 0, Math.PI * 2);
    } else if (style.shape === "square") {
      context.beginPath();
      context.rect(-half * 0.86, -half * 0.86, half * 1.72, half * 1.72);
    } else if (style.shape === "triangle-up") {
      context.beginPath();
      context.moveTo(0, -half * 1.05);
      context.lineTo(half * 0.98, half * 0.88);
      context.lineTo(-half * 0.98, half * 0.88);
      context.closePath();
    } else if (style.shape === "triangle-down") {
      context.beginPath();
      context.moveTo(0, half * 1.05);
      context.lineTo(half * 0.98, -half * 0.88);
      context.lineTo(-half * 0.98, -half * 0.88);
      context.closePath();
    }

    if (style.filled) {
      context.fill();
    } else {
      context.stroke();
    }

    context.restore();
  }

  function drawNavballCenterCross(context, centerX, centerY, radius, dpr, theme) {
    const crossHalf = radius * 0.125;
    const lineWidth = Math.max(1.4, dpr * 1.5);
    const crossColor = theme === "light" ? "rgba(34, 59, 98, 0.95)" : "rgba(232, 241, 255, 0.95)";

    context.strokeStyle = crossColor;
    context.lineWidth = lineWidth;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(centerX - crossHalf, centerY);
    context.lineTo(centerX + crossHalf, centerY);
    context.moveTo(centerX, centerY - crossHalf);
    context.lineTo(centerX, centerY + crossHalf);
    context.stroke();

    context.fillStyle = crossColor;
    context.beginPath();
    context.arc(centerX, centerY, Math.max(1.9, dpr * 2), 0, Math.PI * 2);
    context.fill();
  }

  // Scope rendering
  function drawScope(telemetry) {
    const canvas = dom.spaceshipHudScope;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    const activeCamera = cameraController.getActiveCamera?.();
    if (!context || !activeCamera) {
      return;
    }

    const cssWidth = Math.max(1, Math.floor(canvas.clientWidth || 128));
    const cssHeight = Math.max(1, Math.floor(canvas.clientHeight || 128));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const radius = Math.min(width, height) * 0.42;
    const theme = document.body.getAttribute("data-theme") === "light" ? "light" : "dark";

    context.clearRect(0, 0, width, height);

    invQuat.copy(activeCamera.quaternion).invert();
    radialWorld.copy(worldUpAxis);

    radialLocal.copy(radialWorld).applyQuaternion(invQuat).normalize();
    northLocal.copy(worldNorthAxis).applyQuaternion(invQuat).normalize();

    drawNavballBackground(context, width, height, centerX, centerY, radius, radialLocal, theme);

    context.save();
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.clip();

    drawNavballPoleGuides(context, centerX, centerY, radius, dpr);

    const speed = Number(telemetry.speed) || 0;
    if (speed > 1e-6) {
      progradeWorld
        .set(telemetry.velocity?.x ?? 0, telemetry.velocity?.y ?? 0, telemetry.velocity?.z ?? 0)
        .normalize();
      viewWorld
        .set(telemetry.view?.x ?? 0, telemetry.view?.y ?? 0, telemetry.view?.z ?? 0)
        .normalize();
      drawNavballMarker(context, "prograde", progradeWorld, centerX, centerY, radius, dpr);

      tmpWorld.copy(progradeWorld).multiplyScalar(-1);
      drawNavballMarker(context, "retrograde", tmpWorld, centerX, centerY, radius, dpr);

      normalWorld.copy(progradeWorld).cross(viewWorld);
      if (normalWorld.lengthSq() < 1e-9) {
        normalWorld.copy(worldUpAxis).cross(progradeWorld);
      }
      if (normalWorld.lengthSq() < 1e-9) {
        normalWorld.copy(worldNorthAxis).cross(progradeWorld);
      }
      if (normalWorld.lengthSq() >= 1e-9) {
        normalWorld.normalize();
        drawNavballMarker(context, "normal", normalWorld, centerX, centerY, radius, dpr);
        tmpWorld.copy(normalWorld).multiplyScalar(-1);
        drawNavballMarker(context, "antinormal", tmpWorld, centerX, centerY, radius, dpr);

        radialWorld.copy(normalWorld).cross(progradeWorld).normalize();
        drawNavballMarker(context, "radialOut", radialWorld, centerX, centerY, radius, dpr);
        tmpWorld.copy(radialWorld).multiplyScalar(-1);
        drawNavballMarker(context, "radialIn", tmpWorld, centerX, centerY, radius, dpr);
      }
    }

    context.restore();
    drawNavballCenterCross(context, centerX, centerY, radius, dpr, theme);
  }

  // Button state helpers
  function setButtonsDisabled(disabled) {
    const nextDisabled = Boolean(disabled);
    if (dom.spaceshipSasToggle) {
      dom.spaceshipSasToggle.disabled = nextDisabled;
      const sasOn = Boolean(params.spaceshipSas);
      dom.spaceshipSasToggle.classList.toggle("is-active", sasOn);
      dom.spaceshipSasToggle.classList.toggle("is-off", !sasOn);
    }
    if (dom.spaceshipHaltRotation) {
      dom.spaceshipHaltRotation.disabled = nextDisabled;
    }
    if (dom.spaceshipHaltMotion) {
      dom.spaceshipHaltMotion.disabled = nextDisabled;
    }
  }

  // HUD update
  function update() {
    if (!dom.spaceshipHud) {
      return;
    }

    const enabled = Boolean(params.spaceshipMode && params.projectionMode === "perspective");
    dom.spaceshipHud.classList.toggle("is-hidden", !enabled);
    if (!enabled) {
      setButtonsDisabled(true);
      return;
    }

    const telemetry = cameraController.getSpaceshipTelemetry?.();
    if (!telemetry) {
      setButtonsDisabled(true);
      return;
    }

    const activeApplet = typeof getActiveApplet === "function" ? getActiveApplet() : null;
    const unitLabel = typeof getWorldUnitLabel === "function" ? getWorldUnitLabel(activeApplet) : "m";
    if (dom.spaceshipSpeed) {
      dom.spaceshipSpeed.textContent =
        `${formatDisplayNumber(telemetry.speed, { trailingDigits: 2 })} ${unitLabel}/s`;
    }
    if (dom.spaceshipSasToggle) {
      const sasOn = Boolean(params.spaceshipSas);
      dom.spaceshipSasToggle.disabled = false;
      dom.spaceshipSasToggle.classList.toggle("is-active", sasOn);
      dom.spaceshipSasToggle.classList.toggle("is-off", !sasOn);
      dom.spaceshipSasToggle.title = sasOn ? "SAS on" : "SAS off";
      dom.spaceshipSasToggle.setAttribute("aria-label", sasOn ? "SAS on" : "SAS off");
      dom.spaceshipSasToggle.setAttribute("aria-pressed", sasOn ? "true" : "false");
      const sasIcon = dom.spaceshipSasToggle.querySelector("i");
      if (sasIcon) {
        sasIcon.className = `bi ${sasOn ? "bi-bullseye" : "bi-circle"}`;
      }
    }

    const angular = telemetry.angular || {};
    const linearSpeed = Number(telemetry.speed) || 0;
    const angularRate = Math.hypot(
      Number(angular.yaw) || 0,
      Number(angular.pitch) || 0,
      Number(angular.roll) || 0,
    );
    const rotationZero = angularRate <= 1e-4;
    const motionZero = rotationZero && linearSpeed <= 1e-4;

    if (dom.spaceshipHaltRotation) {
      dom.spaceshipHaltRotation.disabled = rotationZero;
      dom.spaceshipHaltRotation.title = rotationZero ? "Rotation already zero" : "Halt rotation";
      dom.spaceshipHaltRotation.setAttribute(
        "aria-label",
        rotationZero ? "Rotation already zero" : "Halt rotation",
      );
    }
    if (dom.spaceshipHaltMotion) {
      dom.spaceshipHaltMotion.disabled = motionZero;
      dom.spaceshipHaltMotion.title = motionZero ? "Motion already zero" : "Halt all motion";
      dom.spaceshipHaltMotion.setAttribute(
        "aria-label",
        motionZero ? "Motion already zero" : "Halt all motion",
      );
    }

    drawScope(telemetry);
  }

  return {
    update,
  };
}
