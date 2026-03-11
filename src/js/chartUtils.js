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
    axisLabel = "",
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

  if (axisLabel) {
    ctx.save();
    ctx.translate(13 * dpr, padTop + plotHeight * 0.5);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = palette.label;
    ctx.fillText(axisLabel, 0, 0);
    ctx.restore();
  }
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

export function pushTrendValue(series, value, maxPoints = 160) {
  series.push(value);
  if (series.length > maxPoints) {
    series.shift();
  }
}
