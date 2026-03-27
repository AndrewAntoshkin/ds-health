import fs from "node:fs";
import { chromium } from "playwright";

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[::1\]$/i,
];

const FALLBACK_CHROME_PATHS = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);

function ensurePublicUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Please enter a valid URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }

  if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
    throw new Error("Local and private network URLs are not supported.");
  }

  return url.toString();
}

function countValues(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item[key];
    if (!value) {
      continue;
    }
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function countRawValues(values) {
  const counts = new Map();
  for (const value of values) {
    if (!value) {
      continue;
    }
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

function topRawValues(values, limit = 12) {
  return countRawValues(values).slice(0, limit);
}

function toCountMap(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

function normalizeScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreCategory(uniqueCount, idealMax, penalty) {
  if (uniqueCount <= idealMax) {
    return 100;
  }
  return normalizeScore(100 - (uniqueCount - idealMax) * penalty);
}

function scoreLabel(score) {
  if (score >= 90) {
    return "Healthy";
  }
  if (score >= 70) {
    return "Mostly consistent";
  }
  if (score >= 50) {
    return "Needs attention";
  }
  return "Fragmented";
}

function parseNumericValue(raw) {
  const match = String(raw).trim().match(/^(-?\d+(?:\.\d+)?)(px|rem|em|%)$/);
  if (!match) {
    return null;
  }

  return {
    number: Number.parseFloat(match[1]),
    unit: match[2],
  };
}

function clusterDimensionValues(items, step = 4) {
  const clustered = new Map();

  for (const item of items) {
    const parsed = parseNumericValue(item.value);
    if (!parsed) {
      const fallbackKey = item.value;
      clustered.set(fallbackKey, (clustered.get(fallbackKey) || 0) + item.count);
      continue;
    }

    let normalizedNumber = parsed.number;
    if (parsed.unit === "px") {
      normalizedNumber = Math.round(parsed.number / step) * step;
    } else if (parsed.unit === "%") {
      normalizedNumber = Math.round(parsed.number);
    } else {
      normalizedNumber = Math.round(parsed.number * 100) / 100;
    }

    const key = `${normalizedNumber}${parsed.unit}`;
    clustered.set(key, (clustered.get(key) || 0) + item.count);
  }

  return [...clustered.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function buildSignals(summary) {
  const signals = [];

  if (summary.cssVariables === 0) {
    signals.push({
      level: "warning",
      title: "No CSS variables detected",
      detail: "The page appears to rely on raw values instead of a token layer.",
    });
  }

  if (summary.textColors > 6) {
    signals.push({
      level: "warning",
      title: "Too many text colors",
      detail: `${summary.textColors} unique text colors were found. This often means semantic roles are not consolidated.`,
    });
  }

  if (summary.fontFamilies > 3) {
    signals.push({
      level: "warning",
      title: "Typography stack looks fragmented",
      detail: `${summary.fontFamilies} font families were detected across visible text.`,
    });
  }

  if (summary.spacingValues > 12) {
    signals.push({
      level: "warning",
      title: "Spacing scale looks noisy",
      detail: `${summary.spacingValues} unique padding and gap values were found.`,
    });
  }

  if (summary.radiusValues > 6) {
    signals.push({
      level: "warning",
      title: "Too many corner radii",
      detail: `${summary.radiusValues} unique non-zero radius values were detected.`,
    });
  }

  if (signals.length === 0) {
    signals.push({
      level: "good",
      title: "Baseline looks healthy",
      detail: "No obvious design-system drift signals were found in the sampled page.",
    });
  }

  return signals;
}

function buildPriorityIssues(health, summary) {
  const issues = [];

  if (health.spacing < 80) {
    issues.push({
      key: "spacing",
      score: health.spacing,
      title: "Spacing is the highest-priority issue",
      detail: `${summary.spacingValues} distinct spacing values were detected. This is the strongest sign that the page needs scale consolidation.`,
    });
  }

  if (health.radius < 80) {
    issues.push({
      key: "radius",
      score: health.radius,
      title: "Radius choices are fragmented",
      detail: `${summary.radiusValues} non-zero radius values were detected. Similar surfaces likely need a smaller shared radius set.`,
    });
  }

  if (health.typography < 80) {
    issues.push({
      key: "typography",
      score: health.typography,
      title: "Typography needs consolidation",
      detail: `${summary.fontFamilies} font families and ${summary.fontSizes} font sizes were detected across visible text.`,
    });
  }

  if (health.color < 80) {
    issues.push({
      key: "color",
      score: health.color,
      title: "Color roles look noisy",
      detail: `${summary.textColors} text colors and ${summary.backgroundColors} background colors were detected on the sampled page.`,
    });
  }

  return issues.sort((a, b) => a.score - b.score).slice(0, 3);
}

function buildRecommendations(summary, priorities, clustered) {
  const actions = [];

  for (const issue of priorities) {
    if (issue.key === "spacing") {
      actions.push({
        title: "Reduce the spacing scale",
        detail: `Collapse the current ${summary.spacingValues} spacing values into a smaller token set. Start with the dominant groups: ${clustered.spacing.slice(0, 4).map((item) => item.value).join(", ")}.`,
      });
    }

    if (issue.key === "radius") {
      actions.push({
        title: "Standardize corner radii",
        detail: `Reduce ${summary.radiusValues} radius values to a smaller semantic set. The dominant radius groups are ${clustered.radius.slice(0, 4).map((item) => item.value).join(", ")}.`,
      });
    }

    if (issue.key === "typography") {
      actions.push({
        title: "Trim the typography system",
        detail: `Reduce the number of active font roles. Aim for fewer families and merge near-identical font sizes into a clearer type scale.`,
      });
    }

    if (issue.key === "color") {
      actions.push({
        title: "Map recurring colors to semantic roles",
        detail: `Turn recurring text and surface colors into explicit semantic tokens instead of letting ad hoc values accumulate.`,
      });
    }
  }

  if (summary.cssVariables === 0) {
    actions.push({
      title: "Introduce a token layer",
      detail: "No CSS variables were detected. A token layer would make consolidation and future maintenance much easier.",
    });
  }

  if (actions.length === 0) {
    actions.push({
      title: "Preserve the current system",
      detail: "This page already looks controlled. The best next step is to keep new work aligned with the same token and component patterns.",
    });
  }

  return actions.slice(0, 4);
}

function buildExecutiveSummary(health, summary, priorities) {
  const label = scoreLabel(health.overall).toLowerCase();
  const tokenLayer = summary.cssVariables > 0
    ? `${summary.cssVariables} CSS variables were detected`
    : "no CSS variable layer was detected";

  if (!priorities.length) {
    return `This page looks ${label}. ${tokenLayer}, and no major consistency issues stood out in the sampled page.`;
  }

  return `This page looks ${label}. ${tokenLayer}, but the strongest issue is: ${priorities[0].title}`;
}

function buildReport(raw) {
  const textColors = toCountMap(raw.textStyles.map((item) => item.color));
  const bgColors = toCountMap(raw.backgrounds.map((item) => item.backgroundColor));
  const fontFamilies = toCountMap(raw.textStyles.map((item) => item.fontFamily));
  const fontSizes = toCountMap(raw.textStyles.map((item) => item.fontSize));
  const fontWeights = toCountMap(raw.textStyles.map((item) => item.fontWeight));
  const paddingValues = toCountMap(raw.spacing.map((item) => item.value));
  const gapValues = toCountMap(raw.gaps.map((item) => item.value));
  const radiusValues = toCountMap(raw.radius.map((item) => item.value));

  const spacingCount = new Set([...paddingValues.keys(), ...gapValues.keys()]).size;
  const health = {
    color: scoreCategory(textColors.size + bgColors.size, 10, 5),
    typography: Math.round(
      (scoreCategory(fontFamilies.size, 2, 18) +
        scoreCategory(fontSizes.size, 8, 8) +
        scoreCategory(fontWeights.size, 4, 12)) / 3
    ),
    spacing: scoreCategory(spacingCount, 12, 6),
    radius: scoreCategory(radiusValues.size, 6, 12),
  };
  health.overall = Math.round(
    (health.color + health.typography + health.spacing + health.radius) / 4
  );

  const summary = {
    elementsSampled: raw.elementsSampled,
    textNodesSampled: raw.textStyles.length,
    cssVariables: raw.cssVariables,
    textColors: textColors.size,
    backgroundColors: bgColors.size,
    fontFamilies: fontFamilies.size,
    fontSizes: fontSizes.size,
    fontWeights: fontWeights.size,
    spacingValues: spacingCount,
    radiusValues: radiusValues.size,
  };

  const clustered = {
    spacing: clusterDimensionValues(countRawValues([...raw.spacing.map((item) => item.value), ...raw.gaps.map((item) => item.value)]).map((item) => ({
      value: item.value,
      count: item.count,
    }))),
    radius: clusterDimensionValues(countRawValues(raw.radius.map((item) => item.value)).map((item) => ({
      value: item.value,
      count: item.count,
    }))),
    fontSizes: clusterDimensionValues(countRawValues(raw.textStyles.map((item) => item.fontSize)).map((item) => ({
      value: item.value,
      count: item.count,
    })), 2),
  };

  const priorities = buildPriorityIssues(health, summary);
  const recommendations = buildRecommendations(summary, priorities, clustered);
  const executiveSummary = buildExecutiveSummary(health, summary, priorities);

  return {
    url: raw.url,
    title: raw.title,
    health: {
      ...health,
      label: scoreLabel(health.overall),
      labels: {
        color: scoreLabel(health.color),
        typography: scoreLabel(health.typography),
        spacing: scoreLabel(health.spacing),
        radius: scoreLabel(health.radius),
      },
    },
    summary,
    executiveSummary,
    priorities,
    recommendations,
    topValues: {
      textColors: countValues(raw.textStyles, "color"),
      backgroundColors: countValues(raw.backgrounds, "backgroundColor"),
      fontFamilies: countValues(raw.textStyles, "fontFamily"),
      fontSizes: countValues(raw.textStyles, "fontSize"),
      fontWeights: countValues(raw.textStyles, "fontWeight"),
      spacing: topRawValues([...raw.spacing.map((item) => item.value), ...raw.gaps.map((item) => item.value)]),
      radius: countValues(raw.radius, "value"),
    },
    clustered,
    signals: buildSignals(summary),
  };
}

function resolveChromeExecutable() {
  return FALLBACK_CHROME_PATHS.find((candidate) => fs.existsSync(candidate)) || undefined;
}

export { ensurePublicUrl, buildReport, scoreLabel };

export async function analyzeUrl(inputUrl) {
  const url = ensurePublicUrl(inputUrl);
  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromeExecutable(),
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1200 },
    });

    await page.route("**/*", async (route) => {
      const request = route.request();
      const resourceType = request.resourceType();

      if (["image", "media", "font"].includes(resourceType)) {
        await route.abort();
        return;
      }

      await route.continue();
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1500);

    const raw = await page.evaluate(() => {
      const visibleElements = [...document.querySelectorAll("*")].filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number.parseFloat(style.opacity || "1") > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      });

      const sampled = visibleElements.slice(0, 1200);
      const textStyles = [];
      const backgrounds = [];
      const spacing = [];
      const gaps = [];
      const radius = [];

      for (const element of sampled) {
        const style = window.getComputedStyle(element);
        const text = element.textContent?.trim() || "";

        if (text) {
          textStyles.push({
            color: style.color,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
          });
        }

        if (style.backgroundColor && style.backgroundColor !== "rgba(0, 0, 0, 0)") {
          backgrounds.push({ backgroundColor: style.backgroundColor });
        }

        for (const value of [
          style.paddingTop,
          style.paddingRight,
          style.paddingBottom,
          style.paddingLeft,
        ]) {
          if (value && value !== "0px") {
            spacing.push({ value });
          }
        }

        if (style.gap && style.gap !== "normal" && style.gap !== "0px") {
          gaps.push({ value: style.gap });
        }

        if (style.borderRadius && style.borderRadius !== "0px") {
          radius.push({ value: style.borderRadius });
        }
      }

      const rootStyles = window.getComputedStyle(document.documentElement);
      const cssVariables = [...rootStyles].filter((name) => name.startsWith("--")).length;

      return {
        url: window.location.href,
        title: document.title || window.location.hostname,
        elementsSampled: sampled.length,
        cssVariables,
        textStyles,
        backgrounds,
        spacing,
        gaps,
        radius,
      };
    });

    return buildReport(raw);
  } finally {
    await browser.close();
  }
}
