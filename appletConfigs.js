export const APPLET_ORDER = ["boid", "ants", "prey", "firefly"];

export const APPLET_CONFIGS = {
  boid: {
    defaultProjection: "perspective",
    world: {
      defaults: { x: 100, y: 100, z: 100 },
      range: { minX: 40, maxX: 320, minY: 40, maxY: 320, minZ: 30, maxZ: 260, step: 2 },
      gridSize: 5,
    },
    left: {
      intro: {
        sectionKey: "information-introduction",
        title: "Introduction",
        icon: "bi-journal-text",
        paragraphs: [
          "This applet implements the 3D Reynolds flocking model as a discrete-time multi-agent system in SI units. Each boid state is position x_i (m) and velocity v_i (m/s), advanced by steering acceleration with bounded speed and acceleration.",
        ],
        equations: [
          "$$\\mathbf{x}_i(t+\\Delta t)=\\mathbf{x}_i(t)+\\mathbf{v}_i(t)\\,\\Delta t$$",
          "$$\\mathbf{v}_i(t+\\Delta t)=\\mathrm{clip}\\!\\left(\\mathbf{v}_i(t)+\\mathbf{a}_i(t)\\,\\Delta t\\right)$$",
          "$$v_{\\min}\\le \\|\\mathbf{v}_i\\|\\le v_{\\max}$$",
          "$$\\mathbf{a}_i=w_{a}\\mathbf{a}_{\\mathrm{align}}+w_{c}\\mathbf{a}_{\\mathrm{cohesion}}+w_{s}\\mathbf{a}_{\\mathrm{separation}}$$",
          "$$\\|\\mathbf{a}_i\\|\\le a_{\\max}$$",
        ],
        mapping: [
          "<strong>Perception Radius</strong> controls which neighbors contribute to alignment/cohesion.",
          "<strong>Separation Distance</strong> controls near-field repulsion.",
          "<strong>Alignment / Cohesion / Separation Weight</strong> map to wₐ, wᶜ, wₛ in the steering equation.",
        ],
      },
      stats: {
        sectionKey: "information-stats",
        title: "Stats",
        icon: "bi-bar-chart-line-fill",
        stats: [{ label: "FPS", valueId: "fps-live", initial: "--" }],
        charts: [
          { title: "Counts", liveId: "chart-count-live", liveInitial: "0", canvasId: "chart-count", aria: "count trend chart" },
          { title: "Speed", liveId: "chart-speed-live", liveInitial: "0.00 m/s", canvasId: "chart-speed", aria: "speed trend chart" },
          { title: "Neighbors", liveId: "chart-neighbors-live", liveInitial: "0.00", canvasId: "chart-neighbors", aria: "neighbor trend chart" },
        ],
      },
    },
    right: {
      simulation: {
        sectionKey: "simulation",
        title: "Simulation",
        icon: "bi-sliders2",
        sliderHub: {
          title: "Count",
          value: "220",
          min: "30",
          max: "650",
          step: "10",
          valueNum: "220",
        },
        sliders: [
          slider("boid-count", "Count", "bi-people-fill", "boid-count-value", "220", "30", "650", "10", "220"),
          slider("boid-scale", "Object Size", "bi-rulers", "boid-scale-value", "0.5 m", "0.1", "1.0", "0.1", "0.5"),
          slider("perception-radius", "Perception Radius", "bi-eye-fill", "perception-radius-value", "18.0 m", "2", "60", "0.5", "18"),
          slider("separation-distance", "Separation Distance", "bi-arrows-angle-contract", "separation-distance-value", "8.0 m", "2", "40", "0.5", "8"),
          slider("max-speed", "Max Speed", "bi-speedometer2", "max-speed-value", "8.0 m/s", "1", "25", "0.25", "8"),
          slider("max-accel", "Max Acceleration", "bi-lightning-charge-fill", "max-accel-value", "6.0 m/s²", "0.5", "30", "0.25", "6"),
          slider("alignment-weight", "Alignment Weight (wₐ)", "bi-layout-three-columns", "alignment-weight-value", "1.00", "0", "3", "0.05", "1"),
          slider("cohesion-weight", "Cohesion Weight (wᶜ)", "bi-diagram-3-fill", "cohesion-weight-value", "0.90", "0", "3", "0.05", "0.9"),
          slider("separation-weight", "Separation Weight (wₛ)", "bi-arrow-left-right", "separation-weight-value", "1.35", "0", "4", "0.05", "1.35"),
        ],
        pauseButtonId: "toggle-pause",
        defaultButtonId: "default-sim",
        resetButtonId: "reset-sim",
      },
    },
  },
  ants: {
    defaultProjection: "orthographic",
    world: {
      defaults: { x: 2, y: 2, z: 2 },
      range: { minX: 0.5, maxX: 10, minY: 0.5, maxY: 10, minZ: 0.5, maxZ: 8, step: 0.05 },
      gridSize: 0.1,
    },
    left: {
      intro: {
        sectionKey: "ants-introduction",
        title: "Introduction",
        icon: "bi-journal-text",
        hidden: true,
        paragraphs: [
          "This applet uses a pheromone-coupled agent model on a 2D floor embedded in the 3D scene. Ants follow local concentration gradients, deposit trails, and switch between explore/return states based on nest-food encounters.",
          "Ant color encodes state: cyan/greenish ants are searching, orange ants are carrying food.",
        ],
        equations: [
          "$$\\mathbf{x}_i(t+\\Delta t)=\\mathbf{x}_i(t)+v_a[\\cos\\theta_i,\\sin\\theta_i]\\,\\Delta t$$",
          "$$\\theta_i(t+\\Delta t)=\\theta_i(t)+k_{\\theta}(S_R-S_L)\\,\\Delta t+k_g\\,\\Delta\\theta_{\\mathrm{goal}}\\,\\Delta t+\\xi_i$$",
          "$$P_j(t+\\Delta t)=(1-\\lambda\\,\\Delta t)P_j(t)+D\\,\\nabla^2P_j+Q_j$$",
        ],
        mapping: [
          "<strong>Sensor Distance / Sensor Angle</strong> define left-right probe locations in (S_R-S_L).",
          "<strong>Turn Gain</strong> maps to k_θ, controlling steering responsiveness.",
          "<strong>Deposit / Diffusion / Evaporation</strong> map to Q_j, D, and λ.",
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
          slider("ant-count", "Count", "bi-people-fill", "ant-count-value", "120", "20", "400", "5", "120"),
          slider("ant-scale", "Object Size", "bi-rulers", "ant-scale-value", "0.003 m", "0.001", "0.005", "0.0001", "0.003"),
          slider("ant-speed", "Speed", "bi-speedometer2", "ant-speed-value", "0.12 m/s", "0.02", "0.40", "0.005", "0.12"),
          slider("ant-sensor-distance", "Sensor Distance", "bi-broadcast", "ant-sensor-distance-value", "0.08 m", "0.01", "0.40", "0.005", "0.08"),
          slider("ant-food-sense-distance", "Food Sensing Distance", "bi-bullseye", "ant-food-sense-distance-value", "0.18 m", "0.02", "0.70", "0.01", "0.18"),
          slider("ant-sensor-angle", "Sensor Angle", "bi-compass", "ant-sensor-angle-value", "35°", "5", "90", "1", "35"),
          slider("ant-turn-gain", "Turn Gain (kθ)", "bi-arrow-repeat", "ant-turn-gain-value", "3.00 1/s", "0", "8", "0.05", "3.0"),
          slider("ant-goal-bias", "Goal Bias (kg)", "bi-bullseye", "ant-goal-bias-value", "1.00 1/s", "0", "2", "0.05", "1.0"),
          slider("ant-departure-rate", "Departure Rate", "bi-box-arrow-up-right", "ant-departure-rate-value", "6.0 ants/s", "0", "20", "0.25", "6"),
          slider("ant-deposit-rate", "Deposit Rate", "bi-droplet-fill", "ant-deposit-rate-value", "5.0", "0", "20", "0.25", "5.0"),
          slider("ant-diffusion-rate", "Diffusion Rate", "bi-water", "ant-diffusion-rate-value", "3.00 1/s", "0", "12", "0.05", "3.0"),
          slider("ant-evap-rate", "Evaporation Rate", "bi-wind", "ant-evap-rate-value", "0.80 1/s", "0", "4", "0.05", "0.8"),
        ],
        pauseButtonId: "toggle-ant-pause",
        defaultButtonId: "default-ant-sim",
        resetButtonId: "reset-ant-sim",
      },
    },
  },
  prey: {
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
  },
  firefly: {
    defaultProjection: "perspective",
    world: {
      defaults: { x: 100, y: 100, z: 100 },
      range: { minX: 40, maxX: 320, minY: 40, maxY: 320, minZ: 30, maxZ: 260, step: 2 },
      gridSize: 5,
    },
    left: {
      intro: {
        sectionKey: "firefly-introduction",
        title: "Introduction",
        icon: "bi-journal-text",
        hidden: true,
        paragraphs: [
          "This applet models firefly blink synchronization as coupled phase oscillators with local interactions in a 3D volume.",
          "Each agent advances by intrinsic frequency and coupling to nearby phases, producing spontaneous phase-locking and collective flashing.",
        ],
        equations: [
          "$$\\dot{\\theta}_i = \\omega_i + \\frac{K}{N_i}\\sum_{j\\in\\mathcal{N}_i}\\sin(\\theta_j-\\theta_i) + \\eta_i(t)$$",
          "$$\\theta_i \\mapsto \\theta_i \\bmod 2\\pi,\\quad \\text{blink when } \\theta_i \\to 2\\pi$$",
          "$$R=\\left|\\frac{1}{N}\\sum_{k=1}^N e^{\\,i\\theta_k}\\right|$$",
        ],
        mapping: [
          "<strong>Coupling</strong> sets synchronization strength K.",
          "<strong>Interaction Radius</strong> defines local neighborhood N_i.",
          "<strong>Base Frequency / Jitter / Phase Noise</strong> set ω_i and stochastic phase perturbations.",
        ],
      },
      stats: {
        sectionKey: "firefly-stats",
        title: "Stats",
        icon: "bi-bar-chart-line-fill",
        hidden: true,
        stats: [{ label: "FPS", valueId: "firefly-fps-live", initial: "--" }],
        charts: [
          { title: "Count", liveId: "chart-firefly-count-live", liveInitial: "0", canvasId: "chart-firefly-count", aria: "firefly count trend chart" },
          { title: "Order (R)", liveId: "chart-firefly-order-live", liveInitial: "0.000", canvasId: "chart-firefly-order", aria: "firefly synchronization order trend chart" },
          { title: "Blink Rate", liveId: "chart-firefly-blink-live", liveInitial: "0.0 /s", canvasId: "chart-firefly-blink", aria: "firefly blink rate trend chart" },
        ],
      },
    },
    right: {
      simulation: {
        sectionKey: "firefly-simulation",
        title: "Simulation",
        icon: "bi-sliders2",
        hidden: true,
        className: "mt-2",
        sliderHub: { title: "Count", value: "180", min: "20", max: "900", step: "10", valueNum: "180" },
        sliders: [
          slider("firefly-count", "Count", "bi-lightbulb-fill", "firefly-count-value", "180", "20", "900", "10", "180"),
          slider("firefly-size", "Object Size", "bi-rulers", "firefly-size-value", "0.80 m", "0.2", "2.5", "0.05", "0.8"),
          slider("firefly-speed", "Speed", "bi-arrow-repeat", "firefly-speed-value", "1.2 m/s", "0.1", "4.0", "0.1", "1.2"),
          slider("firefly-coupling", "Coupling (K)", "bi-diagram-2", "firefly-coupling-value", "2.20", "0", "8", "0.05", "2.2"),
          slider("firefly-radius", "Interaction Radius", "bi-broadcast", "firefly-radius-value", "18.0 m", "1", "60", "0.5", "18.0"),
          slider("firefly-frequency", "Base Frequency", "bi-speedometer2", "firefly-frequency-value", "1.80 Hz", "0.2", "6.0", "0.05", "1.8"),
          slider("firefly-jitter", "Frequency Jitter", "bi-slash-circle", "firefly-jitter-value", "0.20 Hz", "0", "2.0", "0.02", "0.2"),
          slider("firefly-noise", "Phase Noise", "bi-shuffle", "firefly-noise-value", "0.40 rad/s", "0", "3.0", "0.02", "0.4"),
        ],
        pauseButtonId: "toggle-firefly-pause",
        defaultButtonId: "default-firefly-sim",
        resetButtonId: "reset-firefly-sim",
      },
    },
  },
};

function slider(id, label, icon, valueId, valueText, min, max, step, value) {
  return { id, label, icon, valueId, valueText, min, max, step, value };
}
