# Contributing

Thanks for improving `ds-health`.

## Local setup

```bash
git clone https://github.com/AndrewAntoshkin/ds-health.git
cd ds-health
npm install
```

If Playwright cannot find a browser:

```bash
npx playwright install chromium
```

## Useful commands

```bash
npm start
npm test
npm run test:analyzer
```

## Repo map

- `src/server.js` handles the web server and API routes.
- `src/analyzer.js` contains URL validation, page sampling, scoring, and report-building logic.
- `public/index.html` contains the local UI.
- `test/analyzer.test.js` covers the report logic and URL validation.

## Change expectations

- If you change report fields, update `README.md` so the API shape stays discoverable.
- If you change scoring or recommendation logic, add or update tests.
- If you change sampling behavior, mention the reasoning in the PR so score shifts are understandable.

## Scope

This repo is a local heuristic analyzer, not a formal visual audit product.

Good fits:

- better report interpretation
- clearer API and docs
- safer heuristics
- improved local UX

Not the primary goal here:

- full crawler infrastructure
- enterprise-grade auditing
- screenshot diff pipelines
