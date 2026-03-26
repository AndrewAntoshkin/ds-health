# ds-health

Analyze live websites for design-system consistency.

`ds-health` takes a public URL, loads the page in a real browser, and returns a quick health report for:

- colors
- typography
- spacing
- radius
- presence of a CSS variable layer

## Why

Most teams can feel when a UI is drifting, but they cannot easily quantify it.

This tool gives a lightweight signal:

- how many text colors exist
- how fragmented typography looks
- whether spacing is converging to a scale
- whether corner radii are controlled
- whether a token layer seems to exist

## MVP shape

- backend: Express + Playwright
- frontend: static HTML/CSS/JS
- analysis: computed styles from visible DOM elements

## Run locally

```bash
npm install
npx playwright install chromium
npm start
```

Open `http://localhost:3000`.

## Sample CLI-style test

```bash
npm run test:analyzer
```

This runs the analyzer against `https://barvian.me/`.

## Notes

- only public `http` and `https` URLs are supported
- localhost and private-network URLs are blocked
- current scoring is heuristic and intended as an early signal, not a formal audit
