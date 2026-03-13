// Canvas chart helpers for resizing backing stores and drawing trend lines.
const distributionRangeCache = new WeakMap();

export function resizeCanvasBackingStore(canvas) {
  if (!canvas) {
    return;
  }

  const cssWidth = Math.max(1, Math.floor(canvas.clientWidth));
  const cssHeight = Math.max(1, Math.floor(canvas.clientHeight));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const backingWidth = Math.max(1, Math.floor(cssWidth * dpr));
  const backingHeight = Math.max(1, Math.floor(cssHeight * dpr));

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
}

export function drawTrendChart(canvas, values, options) {
  const viewMode = String(options?.viewMode || "time").trim().toLowerCase();
  if (viewMode === "distribution") {
    drawDistributionChart(canvas, values, options || {});
    return;
  }
  drawTimeSeriesChart(canvas, values, options || {});
}

function drawTimeSeriesChart(canvas, values, options) {
  if (!canvas || canvas.width < 2 || canvas.height < 2) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const {
    stroke,
    fill,
    tickFormatter = (value) => value.toFixed(1),
    forceZeroMin = false,
  } = options;

  const width = canvas.width;
  const height = canvas.height;
  const dpr = width / Math.max(canvas.clientWidth, 1);
  const padLeft = 40 * dpr;
  const padRight = 10 * dpr;
  const padTop = 8 * dpr;
  const padBottom = 12 * dpr;

  ctx.clearRect(0, 0, width, height);

  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  if (plotWidth <= 1 || plotHeight <= 1) {
    return;
  }

  let minValue = values.length > 0 ? values[0] : 0;
  let maxValue = values.length > 0 ? values[0] : 1;
  for (let i = 1; i < values.length; i += 1) {
    const value = values[i];
    if (value < minValue) {
      minValue = value;
    }
    if (value > maxValue) {
      maxValue = value;
    }
  }

  if (forceZeroMin) {
    minValue = Math.min(minValue, 0);
    maxValue = Math.max(maxValue, 0);
  }

  const span = Math.max(maxValue - minValue, 0.001);
  const theme = document.body.getAttribute("data-theme") === "light" ? "light" : "dark";
  const palette =
    theme === "light"
      ? {
          grid: "rgba(88, 114, 156, 0.22)",
          axis: "rgba(76, 106, 148, 0.68)",
          label: "rgba(64, 89, 132, 0.94)",
        }
      : {
          grid: "rgba(153, 190, 255, 0.16)",
          axis: "rgba(145, 186, 255, 0.54)",
          label: "rgba(173, 205, 255, 0.92)",
        };

  const tickCount = 4;
  const labelFont = `${Math.max(10, Math.round(12 * dpr))}px "Space Grotesk", sans-serif`;

  ctx.save();
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = Math.max(1, dpr * 0.75);
  ctx.font = labelFont;
  ctx.textBaseline = "middle";
  ctx.fillStyle = palette.label;

  for (let i = 0; i <= tickCount; i += 1) {
    const t = i / tickCount;
    const y = padTop + plotHeight * (1 - t);

    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.stroke();

    const tickValue = minValue + span * t;
    const tickText = tickFormatter(tickValue);
    ctx.textAlign = "right";
    ctx.fillText(tickText, padLeft - 6 * dpr, y);
  }

  ctx.strokeStyle = palette.axis;
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop);
  ctx.lineTo(padLeft, height - padBottom);
  ctx.lineTo(width - padRight, height - padBottom);
  ctx.stroke();

  ctx.restore();

  if (values.length === 0) {
    return;
  }

  const toX = (index) =>
    values.length === 1
      ? padLeft + plotWidth * 0.5
      : padLeft + (index / (values.length - 1)) * plotWidth;
  const toY = (value) => padTop + ((maxValue - value) / span) * plotHeight;

  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < values.length; i += 1) {
    const x = toX(i);
    const y = toY(values[i]);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  const lastX = toX(values.length - 1);
  ctx.lineTo(lastX, padTop + plotHeight);
  ctx.lineTo(toX(0), padTop + plotHeight);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < values.length; i += 1) {
    const x = toX(i);
    const y = toY(values[i]);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1.6, dpr * 1.2);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

function drawDistributionChart(canvas, values, options) {
  if (!canvas || canvas.width < 2 || canvas.height < 2) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const {
    stroke,
    fill,
    distributionValues = null,
    distributionBins = 20,
    distributionSmoothing = 1.4,
    distributionQuantileMin = 0.05,
    distributionQuantileMax = 0.95,
    distributionRangeUpdateMs = 1000,
    distributionXTicks = 5,
    distributionXTickFormatter = (value) => value.toFixed(1),
    distributionYTickFormatter = (value) => `${Math.round(value * 100)}%`,
  } = options;

  const width = canvas.width;
  const height = canvas.height;
  const dpr = width / Math.max(canvas.clientWidth, 1);
  const padLeft = 40 * dpr;
  const padRight = 10 * dpr;
  const padTop = 8 * dpr;
  const padBottom = 24 * dpr;

  ctx.clearRect(0, 0, width, height);

  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  if (plotWidth <= 1 || plotHeight <= 1) {
    return;
  }

  const sourceValues = (distributionValues && typeof distributionValues.length === "number")
    ? distributionValues
    : values;

  if (!sourceValues || sourceValues.length === 0) {
    drawDistributionAxes({
      ctx,
      width,
      height,
      dpr,
      padLeft,
      padRight,
      padTop,
      padBottom,
      plotWidth,
      plotHeight,
      minValue: 0,
      maxValue: 1,
      maxDensity: 1,
      distributionXTicks,
      distributionXTickFormatter,
      distributionYTickFormatter,
    });
    return;
  }

  const finiteValues = [];
  for (let i = 0; i < sourceValues.length; i += 1) {
    const value = Number(sourceValues[i]);
    if (Number.isFinite(value)) {
      finiteValues.push(value);
    }
  }
  if (finiteValues.length === 0) {
    return;
  }

  const range = getDistributionRange({
    canvas,
    values: finiteValues,
    quantileMin: distributionQuantileMin,
    quantileMax: distributionQuantileMax,
    updateMs: distributionRangeUpdateMs,
  });
  let minValue = range.min;
  let maxValue = range.max;

  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return;
  }

  if (Math.abs(maxValue - minValue) < 1e-9) {
    minValue -= 0.5;
    maxValue += 0.5;
  }

  const binCount = Math.max(8, Math.min(60, Math.round(distributionBins)));
  const bins = new Float64Array(binCount);
  for (let i = 0; i < finiteValues.length; i += 1) {
    const clamped = Math.max(minValue, Math.min(maxValue, finiteValues[i]));
    const normalized = (clamped - minValue) / Math.max(maxValue - minValue, 1e-9);
    const index = Math.max(0, Math.min(binCount - 1, Math.floor(normalized * binCount)));
    bins[index] += 1;
  }

  const smoothed = smoothBinsGaussian(bins, distributionSmoothing);
  const totalSamples = Math.max(1, finiteValues.length);
  const densities = new Float64Array(binCount);
  let maxDensity = 0;
  for (let i = 0; i < binCount; i += 1) {
    densities[i] = smoothed[i] / totalSamples;
    if (densities[i] > maxDensity) {
      maxDensity = densities[i];
    }
  }
  maxDensity = Math.max(maxDensity, 0.001);

  drawDistributionAxes({
    ctx,
    width,
    height,
    dpr,
    padLeft,
    padRight,
    padTop,
    padBottom,
    plotWidth,
    plotHeight,
    minValue,
    maxValue,
    maxDensity,
    distributionXTicks,
    distributionXTickFormatter,
    distributionYTickFormatter,
  });

  const toX = (binIndex) => {
    const centerRatio = (binIndex + 0.5) / binCount;
    return padLeft + centerRatio * plotWidth;
  };
  const toY = (density) => {
    const ratio = density / maxDensity;
    return padTop + (1 - ratio) * plotHeight;
  };

  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < binCount; i += 1) {
    const x = toX(i);
    const y = toY(densities[i]);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.lineTo(padLeft + plotWidth, padTop + plotHeight);
  ctx.lineTo(padLeft, padTop + plotHeight);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < binCount; i += 1) {
    const x = toX(i);
    const y = toY(densities[i]);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1.6, dpr * 1.2);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

function drawDistributionAxes({
  ctx,
  width,
  height,
  dpr,
  padLeft,
  padRight,
  padTop,
  padBottom,
  plotWidth,
  plotHeight,
  minValue,
  maxValue,
  maxDensity,
  distributionXTicks,
  distributionXTickFormatter,
  distributionYTickFormatter,
}) {
  const theme = document.body.getAttribute("data-theme") === "light" ? "light" : "dark";
  const palette =
    theme === "light"
      ? {
          grid: "rgba(88, 114, 156, 0.22)",
          axis: "rgba(76, 106, 148, 0.68)",
          label: "rgba(64, 89, 132, 0.94)",
        }
      : {
          grid: "rgba(153, 190, 255, 0.16)",
          axis: "rgba(145, 186, 255, 0.54)",
          label: "rgba(173, 205, 255, 0.92)",
        };

  const yTickCount = 4;
  const xTickCount = Math.max(2, Math.min(8, Math.round(distributionXTicks)));
  const labelFont = `${Math.max(10, Math.round(12 * dpr))}px "Space Grotesk", sans-serif`;

  ctx.save();
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = Math.max(1, dpr * 0.75);
  ctx.font = labelFont;
  ctx.textBaseline = "middle";
  ctx.fillStyle = palette.label;

  for (let i = 0; i <= yTickCount; i += 1) {
    const t = i / yTickCount;
    const y = padTop + plotHeight * (1 - t);

    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.stroke();

    const tickDensity = maxDensity * t;
    const tickText = distributionYTickFormatter(tickDensity);
    ctx.textAlign = "right";
    ctx.fillText(tickText, padLeft - 6 * dpr, y);
  }

  ctx.strokeStyle = palette.axis;
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop);
  ctx.lineTo(padLeft, height - padBottom);
  ctx.lineTo(width - padRight, height - padBottom);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i < xTickCount; i += 1) {
    const t = xTickCount === 1 ? 0 : i / (xTickCount - 1);
    const x = padLeft + t * plotWidth;
    const value = minValue + (maxValue - minValue) * t;
    const text = distributionXTickFormatter(value);
    ctx.fillText(text, x, height - padBottom + 4 * dpr);
  }
  ctx.restore();
}

function smoothBinsGaussian(bins, sigmaBins) {
  const count = bins.length;
  const sigma = Number.isFinite(sigmaBins) ? Math.max(0, sigmaBins) : 0;
  if (sigma <= 0.001 || count <= 2) {
    return bins;
  }

  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = [];
  let kernelSum = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(weight);
    kernelSum += weight;
  }

  const smoothed = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) {
      const source = Math.max(0, Math.min(count - 1, i + k));
      const weight = kernel[k + radius] / kernelSum;
      sum += bins[source] * weight;
    }
    smoothed[i] = sum;
  }
  return smoothed;
}

function getDistributionRange({
  canvas,
  values,
  quantileMin,
  quantileMax,
  updateMs,
}) {
  const now = (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();
  const cacheEntry = distributionRangeCache.get(canvas);
  const cacheDuration = Number.isFinite(updateMs) ? Math.max(0, updateMs) : 1000;
  if (
    cacheEntry &&
    Number.isFinite(cacheEntry.min) &&
    Number.isFinite(cacheEntry.max) &&
    now - cacheEntry.updatedAt < cacheDuration
  ) {
    return cacheEntry;
  }

  const sorted = values.slice().sort((a, b) => a - b);
  let min = sorted[0];
  let max = sorted[sorted.length - 1];

  const qMin = Number.isFinite(quantileMin) ? quantileMin : 0.05;
  const qMax = Number.isFinite(quantileMax) ? quantileMax : 0.95;
  const clippedQMin = Math.max(0, Math.min(1, qMin));
  const clippedQMax = Math.max(clippedQMin, Math.min(1, qMax));

  if (sorted.length >= 5) {
    min = quantileAtSorted(sorted, clippedQMin);
    max = quantileAtSorted(sorted, clippedQMax);
  }

  const resolved = {
    min,
    max,
    updatedAt: now,
  };
  distributionRangeCache.set(canvas, resolved);
  return resolved;
}

function quantileAtSorted(sortedValues, quantile) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    return 0;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const q = Math.max(0, Math.min(1, quantile));
  const position = q * (sortedValues.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(sortedValues.length - 1, lower + 1);
  const t = position - lower;
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * t;
}

export function pushTrendValue(series, value, maxPoints = 160) {
  series.push(value);
  if (series.length > maxPoints) {
    series.shift();
  }
}
