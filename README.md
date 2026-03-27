# ds-health

Analyze live websites for design-system consistency.

Project: https://github.com/AndrewAntoshkin/ds-health

`ds-health` takes a public URL, loads the page in a real browser, and returns a quick health report for:

- colors
- typography
- spacing
- radius
- presence of a CSS variable layer
- executive summary
- priority issues
- recommended actions
- normalized value groups

## Quick navigation

- [What it is right now](#what-it-is-right-now)
- [Why](#why)
- [Repository layout](#repository-layout)
- [Run locally](#run-locally)
- [API](#api)
- [Typical flow](#typical-flow)
- [How to read the report](#how-to-read-the-report)
- [Testing](#testing)
- [Contributing](#contributing)

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
- what the main problems are
- what to fix first

## Repository layout

- `src/server.js`
  Express server and API endpoints
- `src/analyzer.js`
  URL validation, page sampling, report scoring, and recommendation logic
- `src/run-sample-analysis.js`
  one-shot CLI-style sample run
- `public/index.html`
  static UI for running analyses locally
- `test/analyzer.test.js`
  lightweight report-logic tests

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

## API

### `POST /api/analyze`

Request body:

```json
{
  "url": "https://example.com"
}
```

Success response shape:

```json
{
  "ok": true,
  "report": {
    "url": "https://example.com",
    "title": "Example",
    "health": {
      "color": 100,
      "typography": 100,
      "spacing": 100,
      "radius": 100,
      "overall": 100,
      "label": "Healthy",
      "labels": {
        "color": "Healthy",
        "typography": "Healthy",
        "spacing": "Healthy",
        "radius": "Healthy"
      }
    },
    "summary": {},
    "executiveSummary": "…",
    "priorities": [],
    "recommendations": [],
    "topValues": {},
    "clustered": {},
    "signals": []
  }
}
```

Error response shape:

```json
{
  "ok": false,
  "error": "Please enter a valid URL."
}
```

### `GET /health`

Returns:

```json
{
  "ok": true
}
```

## Typical flow

1. Start the app locally.
2. Paste a public URL.
3. Review the overall health score.
4. Read the executive summary for the plain-English interpretation.
5. Check priority issues and recommended actions.
6. Inspect signals and top values for supporting evidence.
7. Use normalized spacing and radius groups to spot consolidation opportunities.

This is especially useful when you want a quick signal that a page feels inconsistent but you need something more concrete than taste alone.

## How to read the report

Treat the report as a fast signal, not as a final design review.

- `90-100` means the sampled page looks tightly controlled: few colors, restrained typography, and a small spacing/radius set
- `70-89` usually means the page is mostly consistent but has some fragmentation or a few one-off values
- `50-69` is a sign that the visual system may be drifting and needs a closer look
- below `50` usually means too many competing values are showing up in the sampled page

How to read each section:

- `Overall health` is the average of the four category scores
- `Color` rewards fewer text/background colors and the presence of CSS variables
- `Typography` looks at the number of font families, font sizes, and font weights in visible text
- `Spacing` looks at how many distinct padding and gap values appear
- `Radius` looks at how many distinct non-zero border-radius values appear
- `Signals` call out the most obvious reasons the score may be high or low
- `Executive summary` translates the raw report into a human-readable conclusion
- `Priority issues` show what is worth fixing first
- `Recommended actions` suggest the next practical cleanup steps
- `Top values` help you see where consolidation would likely have the biggest impact
- `Normalized groups` collapse near-identical spacing and radius values into clearer buckets

The most useful pattern is: score first, then summary, then priority issues, then supporting values.

## Example result

Running the analyzer against `https://barvian.me/` produced:

```json
{
  "url": "https://barvian.me/",
  "title": "Maxwell Barvian",
  "health": {
    "color": 100,
    "typography": 100,
    "spacing": 100,
    "radius": 100,
    "overall": 100,
    "label": "Healthy"
  },
  "summary": {
    "elementsSampled": 69,
    "textNodesSampled": 41,
    "cssVariables": 4,
    "textColors": 3,
    "backgroundColors": 3,
    "fontFamilies": 1,
    "fontSizes": 1,
    "fontWeights": 2,
    "spacingValues": 4,
    "radiusValues": 1
  },
  "executiveSummary": "This page looks healthy. 4 CSS variables were detected, and no major consistency issues stood out in the sampled page."
}
```

This is the kind of output you want from a disciplined site: restrained values, clear consistency, and no obvious fragmentation signals.

## Testing

Quick checks:

```bash
npm test
npm run test:analyzer
```

`npm test` covers report logic and URL validation.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for local setup and expectations when changing scoring, sampling, or the API shape.

## Notes

- only public `http` and `https` URLs are supported
- localhost and private-network URLs are blocked
- current scoring is heuristic and intended as an early signal, not a formal audit
