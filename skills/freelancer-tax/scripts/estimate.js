#!/usr/bin/env node
/**
 * US federal tax estimates for freelancers and 1099 contractors (2026, 2027). No dependencies.
 *
 *   node estimate.js estimate_1099_tax grossIncome=60000 businessExpenses=8000 year=2026
 *   node estimate.js quarterly_estimated_tax grossIncome=60000 priorYearTax=8000 asOf=2026-11-25
 *   node estimate.js self_employment_tax netProfit=52000
 *   node estimate.js tax_figures topic=1099_thresholds year=2027
 *   node estimate.js tax_deadlines from=2026-11-25
 *
 * Arguments are key=value pairs or one JSON object. Add --json for the exact figures as JSON.
 */
'use strict';
const { listTools, callTool } = require('./lib/tools.js');

function parseArgs(parts) {
  if (parts.length === 1 && parts[0].trim().startsWith('{')) return JSON.parse(parts[0]);
  const out = {};
  for (const p of parts) {
    const i = p.indexOf('=');
    if (i < 1) throw new Error(`Expected key=value, got "${p}"`);
    const key = p.slice(0, i);
    const raw = p.slice(i + 1);
    if (raw === 'true' || raw === 'false') out[key] = raw === 'true';
    else if (/^-?\$?[\d,]*\.?\d+$/.test(raw)) out[key] = Number(raw.replace(/[$,]/g, '')); // 60000, $60,000, 0.05
    else out[key] = raw; // dates, filing status, topic
  }
  return out;
}

function usage() {
  const tools = listTools();
  return ['Usage: node estimate.js <tool> [key=value ...] [--json]', '', 'Tools:']
    .concat(tools.map((t) => `  ${t.name}: ${t.title}\n    inputs: ${Object.keys(t.inputSchema.properties).join(', ')}` + (t.inputSchema.required ? ` (required: ${t.inputSchema.required.join(', ')})` : '')))
    .join('\n');
}

function main(argv) {
  const json = argv.includes('--json');
  const rest = argv.filter((a) => a !== '--json');
  const [tool, ...parts] = rest;
  if (!tool || tool === '--help' || tool === '-h') { console.log(usage()); return 0; }
  let args;
  try { args = parseArgs(parts); } catch (e) { console.error(e.message); return 2; }
  const result = callTool(tool, args);
  if (!result) { console.error(`Unknown tool "${tool}".\n\n${usage()}`); return 2; }
  if (result.isError) { console.error(result.content[0].text); return 1; }
  console.log(json ? JSON.stringify(result.structuredContent, null, 2) : result.content[0].text);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
