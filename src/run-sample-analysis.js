import { analyzeUrl } from "./analyzer.js";

const report = await analyzeUrl("https://barvian.me/");

console.log(JSON.stringify({
  url: report.url,
  title: report.title,
  health: report.health,
  summary: report.summary,
  firstSignal: report.signals[0],
}, null, 2));
