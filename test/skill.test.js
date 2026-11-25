// Checks the skill's files and runs its script the way an agent would.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, 'skills', 'freelancer-tax');
const run = (...args) => execFileSync(process.execPath, [path.join(SKILL, 'scripts', 'estimate.js'), ...args], { encoding: 'utf8' });

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'SKILL.md starts with frontmatter');
  const out = {};
  let parent = null;
  for (const line of m[1].split('\n')) {
    const top = line.match(/^([a-z-]+):\s*(.*)$/);
    const nested = line.match(/^\s+([a-z-]+):\s*(.*)$/);
    if (top) { out[top[1]] = top[2] || {}; parent = top[2] ? null : top[1]; } else if (nested && parent) out[parent][nested[1]] = nested[2];
  }
  return out;
}

test('SKILL.md: only the portable frontmatter fields, within limits', () => {
  const text = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  const fm = frontmatter(text);
  assert.equal(fm.name, 'freelancer-tax');
  assert.match(fm.name, /^[a-z0-9-]+$/);
  assert.ok(fm.description.length > 100 && fm.description.length <= 1024, `description is ${fm.description.length} characters`);
  assert.ok(fm.compatibility.length <= 500);
  for (const key of Object.keys(fm)) assert.ok(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'].includes(key), `portable field: ${key}`);
  assert.ok(text.split('\n').length < 500, 'SKILL.md under 500 lines');
  assert.match(text, /not tax advice/);
  assert.match(text, /Never say a CPA or tax professional reviewed it/);
  for (const [, link] of text.matchAll(/\]\(((?!https?:)[^)]+)\)/g)) assert.ok(fs.existsSync(path.join(SKILL, link)), `linked file exists: ${link}`);
});

test('plugin and marketplace manifests agree', () => {
  const market = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(market.plugins.length, 1);
  assert.equal(market.plugins[0].name, plugin.name);
  assert.equal(market.plugins[0].source, './');
  assert.equal(market.plugins[0].version, plugin.version);
  assert.ok(!/^(claude|anthropic)-/.test(plugin.name));
  assert.ok(fs.existsSync(path.join(ROOT, 'skills', plugin.name, 'SKILL.md')));
});

test('estimate_1099_tax with key=value arguments', () => {
  const out = run('estimate_1099_tax', 'grossIncome=60000', 'businessExpenses=8000', 'year=2026');
  assert.match(out, /Total federal tax: \$10,193/);
  assert.match(out, /jajpo\.com\/taxes\/1099-tax-calculator/);
});

test('dollar signs and commas, JSON input and --json output', () => {
  const a = JSON.parse(run('estimate_1099_tax', 'grossIncome=$10,000', 'w2Wages=50,000', 'year=2026', '--json'));
  assert.equal(Math.round(a.taxAddedBySelfEmployment), 2305);
  const b = JSON.parse(run('estimate_1099_tax', '{"year":2026,"grossIncome":60000,"businessExpenses":8000}', '--json'));
  assert.equal(b.totalFederalTax, 10193.09);
});

test('the other tools', () => {
  assert.match(run('quarterly_estimated_tax', 'grossIncome=60000', 'businessExpenses=8000', 'priorYearTax=8000', 'asOf=2026-03-01', 'year=2026'), /at least \$2,000/);
  assert.match(run('self_employment_tax', 'netProfit=433', 'year=2026'), /No self-employment tax/);
  assert.match(run('tax_figures', 'topic=1099_thresholds', 'year=2027'), /"threshold": 2100/);
  assert.match(run('tax_deadlines', 'from=2026-11-25', 'limit=2'), /2027-01-15/);
});

test('help, unknown tools and bad input fail clearly', () => {
  assert.match(run('--help'), /estimate_1099_tax/);
  assert.throws(() => run('nope'), /Unknown tool/);
  assert.throws(() => run('estimate_1099_tax', 'grossIncome=1000', 'filingStatus=widow'), /Unknown filing status/);
});

test('reference figures list IRS sources', () => {
  const ref = fs.readFileSync(path.join(SKILL, 'reference', 'figures.md'), 'utf8');
  assert.match(ref, /2026 tax brackets/);
  assert.match(ref, /\(https:\/\/www\.irs\.gov\//);
});
