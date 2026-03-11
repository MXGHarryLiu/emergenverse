# Emergenverse

Emergenverse is a browser-based lab for exploring emergent behavior from simple local rules.

Goal: provide interactive, scientifically grounded simulations that make pattern formation, collective dynamics, and rule-to-structure transitions directly observable in real time.

This project is intentionally static-first:
- No backend
- No npm/node build step
- Runs directly in the browser

## Simulations

### Boids

- Concept: Emergent flocking from local interaction rules.
- Scientific explanation: Each boid follows three local behaviors, alignment (match nearby velocity), cohesion (move toward nearby center), and separation (avoid crowding). No global leader is required; coordinated flock motion emerges from decentralized updates.
- Reference implementation inspiration: https://boids.dan.onl/
- Foundational paper (Reynolds, 1987): https://www.red3d.com/cwr/papers/1987/boids.html
- Wikipedia: [Boids](https://en.wikipedia.org/wiki/Boids)

### Ant Trail Simulation

- Concept: Collective path formation from local pheromone deposition, sensing, and reinforcement.
- Scientific explanation: Individual ants move using local rules and bias their motion toward stronger pheromone signals. At the colony level, positive feedback (trail reinforcement) and negative feedback (evaporation/diffusion and stochastic exploration) produce emergent trail networks and shortest-path selection.
- Reference implementation inspiration: https://github.com/iai6203/ant-simulation/blob/main/README.en.md
- Seminal biological paper (Deneubourg et al., 1990): https://doi.org/10.1007/BF01417909
- Related seminal optimization paper (Dorigo et al., 1996, Ant System): https://doi.org/10.1109/3477.484436
- Wikipedia: [Trail pheromone](https://en.wikipedia.org/wiki/Trail_pheromone), [Ant colony optimization algorithms](https://en.wikipedia.org/wiki/Ant_colony_optimization_algorithms)

### Prey (Food Chain)

- Concept: Predator-prey ecosystem dynamics from local pursuit, evasion, predation, and prey reproduction.
- Scientific explanation: This applet is an agent-based interpretation of predator-prey coupling. At the population level, it qualitatively reflects Lotka-Volterra-like oscillation behavior: prey growth, predation pressure, predator response, and subsequent decline/recovery cycles.
- Reference implementation inspiration: [Mesa Wolf-Sheep Predation Example](https://github.com/projectmesa/mesa/tree/main/mesa/examples/basic/wolf_sheep)
- Foundational paper (Lotka, 1920): [Analytical Note on Certain Rhythmic Relations in Organic Systems](https://doi.org/10.1073/pnas.6.7.410)
- Wikipedia: [Lotka–Volterra equations](https://en.wikipedia.org/wiki/Lotka%E2%80%93Volterra_equations), [Food chain](https://en.wikipedia.org/wiki/Food_chain)

## Deploy to Static Hosting

Deploy to any static host (for example GitHub Pages, Netlify, Cloudflare Pages, or Vercel static output).
Use `index.html` as the entry point.

The app pulls Bootstrap and Three.js directly from CDN at runtime.

## Disclaimer

Parts of this project were created or assisted by generative AI tools (including Codex).

- AI-generated content may contain mistakes, omissions, or unintended similarity to existing work.
- Final responsibility for correctness, citations, and publication decisions belongs to the site owner/maintainer.
- If you believe this project includes material derived from your work without proper citation, please contact the site owner by opening an issue in this repository and include supporting links/details so we can review and acknowledge appropriately.
