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

  return {
    url: raw.url,
    title: raw.title,
    health,
    summary,
    topValues: {
      textColors: countValues(raw.textStyles, "color"),
      backgroundColors: countValues(raw.backgrounds, "backgroundColor"),
      fontFamilies: countValues(raw.textStyles, "fontFamily"),
      fontSizes: countValues(raw.textStyles, "fontSize"),
      fontWeights: countValues(raw.textStyles, "fontWeight"),
      spacing: [...countValues(raw.spacing, "value"), ...countValues(raw.gaps, "value")]
        .sort((a, b) => b.count - a.count)
        .slice(0, 12),
      radius: countValues(raw.radius, "value"),
    },
    signals: buildSignals(summary),
  };
}

function resolveChromeExecutable() {
  return FALLBACK_CHROME_PATHS.find((candidate) => fs.existsSync(candidate)) || undefined;
}

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

    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

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
