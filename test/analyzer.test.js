import test from "node:test";
import assert from "node:assert/strict";

import { buildReport, ensurePublicUrl, scoreLabel } from "../src/analyzer.js";

test("ensurePublicUrl rejects local and private hosts", () => {
  assert.throws(() => ensurePublicUrl("http://localhost:3000"), /Local and private network URLs are not supported/);
  assert.throws(() => ensurePublicUrl("http://127.0.0.1:3000"), /Local and private network URLs are not supported/);
});

test("buildReport returns a healthy summary for a restrained page", () => {
  const report = buildReport({
    url: "https://example.com",
    title: "Example",
    elementsSampled: 12,
    cssVariables: 6,
    textStyles: [
      { color: "rgb(20, 20, 20)", fontFamily: "Inter", fontSize: "16px", fontWeight: "400" },
      { color: "rgb(20, 20, 20)", fontFamily: "Inter", fontSize: "16px", fontWeight: "400" },
      { color: "rgb(120, 120, 120)", fontFamily: "Inter", fontSize: "14px", fontWeight: "500" },
    ],
    backgrounds: [
      { backgroundColor: "rgb(255, 255, 255)" },
      { backgroundColor: "rgb(250, 250, 250)" },
    ],
    spacing: [{ value: "8px" }, { value: "16px" }, { value: "16px" }],
    gaps: [{ value: "24px" }],
    radius: [{ value: "8px" }, { value: "8px" }],
  });

  assert.equal(report.health.label, "Healthy");
  assert.equal(scoreLabel(report.health.overall), "Healthy");
  assert.equal(report.priorities.length, 0);
  assert.match(report.executiveSummary, /no major consistency issues/i);
  assert.deepEqual(report.recommendations, [
    {
      title: "Preserve the current system",
      detail: "This page already looks controlled. The best next step is to keep new work aligned with the same token and component patterns.",
    },
  ]);
});

test("buildReport highlights fragmented systems with priorities and recommendations", () => {
  const report = buildReport({
    url: "https://example.com/heavy",
    title: "Heavy Example",
    elementsSampled: 240,
    cssVariables: 0,
    textStyles: [
      { color: "rgb(0, 0, 0)", fontFamily: "Inter", fontSize: "14px", fontWeight: "400" },
      { color: "rgb(10, 10, 10)", fontFamily: "Inter", fontSize: "15px", fontWeight: "400" },
      { color: "rgb(20, 20, 20)", fontFamily: "Saans", fontSize: "16px", fontWeight: "500" },
      { color: "rgb(30, 30, 30)", fontFamily: "Mono", fontSize: "18px", fontWeight: "400" },
      { color: "rgb(40, 40, 40)", fontFamily: "Sans", fontSize: "20px", fontWeight: "500" },
      { color: "rgb(50, 50, 50)", fontFamily: "Display", fontSize: "24px", fontWeight: "400" },
      { color: "rgb(60, 60, 60)", fontFamily: "Inter", fontSize: "28px", fontWeight: "500" },
    ],
    backgrounds: [
      { backgroundColor: "rgb(255, 255, 255)" },
      { backgroundColor: "rgb(250, 250, 250)" },
      { backgroundColor: "rgb(245, 245, 245)" },
      { backgroundColor: "rgb(240, 240, 240)" },
      { backgroundColor: "rgb(235, 235, 235)" },
    ],
    spacing: [
      { value: "4px" }, { value: "8px" }, { value: "10px" }, { value: "12px" }, { value: "14px" },
      { value: "16px" }, { value: "18px" }, { value: "20px" }, { value: "24px" }, { value: "28px" },
      { value: "32px" }, { value: "36px" }, { value: "40px" }, { value: "44px" },
    ],
    gaps: [{ value: "6px" }, { value: "22px" }, { value: "30px" }],
    radius: [
      { value: "2px" }, { value: "4px" }, { value: "6px" }, { value: "8px" },
      { value: "10px" }, { value: "12px" }, { value: "16px" },
    ],
  });

  assert.ok(report.health.overall < 90);
  assert.notEqual(report.health.label, "Healthy");
  assert.ok(report.priorities.length > 0);
  assert.ok(report.recommendations.length > 0);
  assert.match(report.executiveSummary, /strongest issue/i);
  assert.ok(report.signals.some((signal) => signal.title === "No CSS variables detected"));
});
