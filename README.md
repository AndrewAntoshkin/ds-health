# ds-health

Analyze live websites for design-system consistency.

Project: https://github.com/AndrewAntoshkin/ds-health

`ds-health` takes a public URL, loads the page in a real browser, and returns a quick health report for:

- colors
- typography
- spacing
- radius
- presence of a CSS variable layer

## What it is right now

This is a local demo tool.

- meant to be cloned and run on your machine
- useful for quick exploratory checks, not formal design audits
- good for validating the idea and showing what a live DS health report can look like

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
npm start
```

Open `http://localhost:3000`.

If port `3000` is busy:

```bash
PORT=3002 npm start
```

Then open `http://localhost:3002`.

If Playwright cannot find a browser on your machine:

```bash
npx playwright install chromium
```

## Sample CLI-style test

```bash
npm run test:analyzer
```

This runs the analyzer against `https://barvian.me/`.

## Typical flow

1. Start the app locally
2. Paste a public URL
3. Review the overall health score
4. Check the signals section for likely drift
5. Inspect top colors, typography, spacing, and radius values

This is especially useful when you want a quick signal that a page feels inconsistent but you need something more concrete than taste alone.

## Notes

- only public `http` and `https` URLs are supported
- localhost and private-network URLs are blocked
- current scoring is heuristic and intended as an early signal, not a formal audit
