# Emergenverse

This first module is a pure static site:
- No backend
- No npm/node build step
- Runs from `index.html` + `styles.css` + `app.js`

## Simulation Applets

This section tracks simulation applets in Emergenverse. More applets will be added over time.

### 1. 3D Boids

- Concept: Emergent flocking from local interaction rules.
- Scientific explanation: Each boid follows three local behaviors, alignment (match nearby velocity), cohesion (move toward nearby center), and separation (avoid crowding). No global leader is required; coordinated flock motion emerges from decentralized updates.
- Reference implementation inspiration: https://boids.dan.onl/
- Foundational paper (Reynolds, 1987): https://www.red3d.com/cwr/papers/1987/boids.html
- Wikipedia overview: https://en.wikipedia.org/wiki/Boids

## Deploy to Static Hosting

Upload these files to any static host root (for example GitHub Pages, Netlify, Cloudflare Pages, Vercel static output):
- `index.html`
- `styles.css`
- `app.js`

The app pulls Bootstrap and Three.js directly from CDN at runtime.

## Notes

- The right panel controls simulation and camera behavior.
- The middle panel renders a real-time 3D boid scene with orbit camera controls.
- The left panel shows scene summary and live stats.

## Disclaimer

Parts of this project were created or assisted by generative AI tools (including Codex).

- AI-generated content may contain mistakes, omissions, or unintended similarity to existing work.
- Final responsibility for correctness, citations, and publication decisions belongs to the site owner/maintainer.
- If you believe this project includes material derived from your work without proper citation, please contact the site owner by opening an issue in this repository and include supporting links/details so we can review and acknowledge appropriately.
