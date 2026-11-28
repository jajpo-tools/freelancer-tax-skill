'use strict';
/**
 * The MCP tools: US federal tax estimates and figures for freelancers and 1099 contractors.
 * Calculations come from the self-employment-tax library and figures from us-tax-data, both
 * generated from the engine behind https://jajpo.com/ (copies in this folder, no dependencies).
 */
const TAX = require('./self-employment-tax.js');
const DATA = {
  2026: require('./tax-data/2026.json'),
  2027: require('./tax-data/2027.json')
};

const SITE = 'https://jajpo.com';
const LINKS = {
  calculator: { label: 'JAJPO 1099 Tax Calculator (every step shown)', url: SITE + '/taxes/1099-tax-calculator/' },
  quarterly: { label: 'JAJPO Quarterly Estimated Tax Calculator', url: SITE + '/taxes/quarterly-tax-calculator/' },
  penalty: { label: 'JAJPO Underpayment Penalty Calculator', url: SITE + '/taxes/underpayment-penalty-calculator/' },
  seGuide: { label: 'Self-employment tax, explained (JAJPO)', url: SITE + '/taxes/self-employment-tax/' },
  qbi: { label: 'JAJPO QBI Deduction Calculator', url: SITE + '/taxes/qbi-deduction-calculator/' },
  gig: { label: 'JAJPO Gig Driver Tax Calculator', url: SITE + '/taxes/gig-driver-tax-calculator/' },
  nec: { label: 'JAJPO 1099-NEC Checker', url: SITE + '/taxes/1099-nec-checker/' },
  mileage: { label: 'JAJPO Mileage Deduction Calculator', url: SITE + '/taxes/mileage-deduction-calculator/' },
  retirement: { label: 'JAJPO Solo 401(k) / SEP-IRA Calculator', url: SITE + '/business-planning/solo-401k-sep-ira-calculator/' },
  home: { label: 'JAJPO Home Office Deduction Calculator', url: SITE + '/taxes/home-office-deduction-calculator/' },
  health: { label: 'JAJPO Self-Employed Health Insurance Deduction Calculator', url: SITE + '/taxes/self-employed-health-insurance-deduction/' },
  calendar: { label: 'JAJPO Tax Deadline Calendar', url: SITE + '/taxes/tax-deadline-calendar/' },
  all: { label: 'All free JAJPO tools', url: SITE + '/all-tools/' }
};

const NOTE = 'Estimate only, not tax advice. Federal figures from IRS and SSA publications.';
const STATUS_NAMES = { single: 'single', mfj: 'married filing jointly', mfs: 'married filing separately', hoh: 'head of household' };

const money = (n) => (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US');
const cents = (n) => Math.round(n * 100) / 100;
const pct = (r, digits = 1) => (r * 100).toFixed(digits).replace(/\.0+$/, '') + '%';
const today = () => new Date().toISOString().slice(0, 10);

function defaultYear(date) {
  const y = Number((date || today()).slice(0, 4));
  const years = TAX.supportedYears();
  if (years.includes(y)) return y;
  return y > years[years.length - 1] ? years[years.length - 1] : years[0];
}

function coreSources(year) {
  return TAX.TAX_YEARS[year].sources.filter((s) => s.topic === 'core' || s.topic === 'estimated' || s.topic === 'qbi')
    .slice(0, 6).map((s) => ({ label: s.label, url: s.url }));
}

// ---- input schemas ----
const YEAR = { type: 'integer', enum: [2026, 2027], description: 'Tax year, 2026 or 2027. If omitted: the current calendar year when supported, otherwise the nearest supported year.' };
const STATUS = { type: 'string', enum: ['single', 'mfj', 'mfs', 'hoh'], default: 'single', description: 'Filing status: "single", "mfj" (married filing jointly), "mfs" (married filing separately) or "hoh" (head of household). Default "single".' };
const DOLLARS = (description, example) => ({ type: 'number', minimum: 0, description: description + (example !== undefined ? ` In US dollars, e.g. ${example}.` : ' In US dollars.') });

const ESTIMATE_PROPS = {
  year: YEAR,
  filingStatus: STATUS,
  grossIncome: DOLLARS('Total self-employment / 1099 income for the year, before expenses (required).', 60000),
  businessExpenses: Object.assign(DOLLARS('Deductible business expenses for the year (Schedule C). Default 0.', 8000), { default: 0 }),
  w2Wages: Object.assign(DOLLARS('The person\'s own W-2 wages from a job, if any. They raise the income tax bracket and use up the Social Security wage base first. Default 0.', 50000), { default: 0 }),
  spouseW2Wages: Object.assign(DOLLARS('Spouse\'s W-2 wages. Only used when filingStatus is "mfj"; ignored otherwise. Default 0.', 40000), { default: 0 }),
  otherIncome: Object.assign(DOLLARS('Other taxable income such as interest. Default 0.', 500), { default: 0 }),
  isSpecifiedService: { type: 'boolean', default: false, description: 'true for a specified service trade or business (consulting, law, health, accounting, financial services, performing arts, athletics). Only matters for the QBI deduction when taxable income is above about $201,750 single / $403,500 joint (2026). Default false.' },
  qualifiedTips: Object.assign(DOLLARS('Tips reported on a Form 1099 that qualify for the Section 224 tips deduction (lowers income tax, not SE tax). Default 0.', 3000), { default: 0 }),
  businessAdjustments: Object.assign(DOLLARS('Self-employed health insurance premiums plus retirement contributions (Solo 401(k), SEP-IRA). They lower income tax and the QBI amount, not SE tax. Default 0.', 6000), { default: 0 }),
  stateTaxRate: { type: 'number', minimum: 0, maximum: 0.2, default: 0, description: 'Optional flat state income tax rate as a decimal, applied to net profit and reported separately (never changes the federal figures). e.g. 0.05 for 5%. Default 0 (state tax not included).' }
};

const TOPICS = {
  brackets: { key: 'incomeTaxBrackets', link: 'calculator' },
  standard_deduction: { key: 'standardDeduction', link: 'calculator' },
  self_employment: { key: 'selfEmploymentTax', link: 'seGuide' },
  additional_medicare: { key: 'additionalMedicareTax', link: 'calculator' },
  qbi: { key: 'qbiDeduction', link: 'qbi' },
  qualified_tips: { key: 'qualifiedTipsDeduction', link: 'gig' },
  estimated_tax: { key: 'estimatedTax', link: 'quarterly' },
  '1099_thresholds': { key: 'informationReturns', link: 'nec' },
  mileage: { key: 'businessMileageRates', link: 'mileage' },
  retirement: { key: 'retirement', link: 'retirement' },
  home_office: { key: 'homeOffice', link: 'home' },
  premium_tax_credit: { key: 'premiumTaxCredit', link: 'health' },
  all: { key: null, link: 'all' }
};

// ---- handlers ----
function estimate(args) {
  const input = Object.assign({}, args, { year: args.year || defaultYear() });
  const r = TAX.estimate1099(input);
  const status = r.inputs.filingStatus;
  const lines = [
    `${r.year} federal tax estimate (${STATUS_NAMES[status]})`,
    `- Net profit: ${money(r.netProfit)}`,
    `- Self-employment tax: ${money(r.selfEmploymentTax)} (Social Security ${money(r.socialSecurityTax)} + Medicare ${money(r.medicareTax)}); half of it, ${money(r.selfEmploymentTaxDeduction)}, is deductible`,
    `- Income tax: ${money(r.incomeTax)} on taxable income of ${money(r.taxableIncome)} (after the ${money(r.standardDeduction)} ${r.standardDeduction > TAX.TAX_YEARS[r.year].standardDeduction[status] ? 'itemized' : 'standard'} deduction` +
      (r.qbiDeduction > 0 ? ` and a ${money(r.qbiDeduction)} QBI deduction` : '') + (r.qualifiedTipsDeduction > 0 ? ` and a ${money(r.qualifiedTipsDeduction)} tips deduction` : '') + ')',
    r.additionalMedicareTax > 0 ? `- Additional Medicare Tax: ${money(r.additionalMedicareTax)}` : null,
    `- Total federal tax: ${money(r.totalFederalTax)}`,
    `- Tax added by the self-employment income: ${money(r.taxAddedBySelfEmployment)}, so set aside about ${pct(r.setAsideRate)} of each payment (${money(r.equalQuarterlyPayment)} a quarter)`,
    r.stateTaxRate > 0 ? `- State tax at the flat ${pct(r.stateTaxRate)} given: ${money(r.stateTax)}; with it, set aside about ${pct(r.setAsideRateWithState)}` : '- State income tax is not included.',
    `- Marginal income tax rate: ${pct(r.marginalRate, 0)}`,
    `Estimated tax due dates: ${r.estimatedTaxDueDates.join(', ')}.`,
    `Check every step or change the numbers: ${LINKS.calculator.url}`,
    `${NOTE} Last verified ${r.lastVerified}.`
  ].filter(Boolean);
  const keep = ['netProfit', 'netEarningsFromSelfEmployment', 'socialSecurityTax', 'medicareTax', 'selfEmploymentTax', 'selfEmploymentTaxDeduction',
    'additionalMedicareTax', 'adjustedGrossIncome', 'standardDeduction', 'qualifiedTipsDeduction', 'qbiDeduction', 'taxableIncome', 'incomeTax',
    'marginalRate', 'totalFederalTax', 'taxAddedBySelfEmployment', 'setAsideRate', 'equalQuarterlyPayment', 'stateTax', 'setAsideRateWithState'];
  const structured = { year: r.year, filingStatus: status };
  for (const k of keep) structured[k] = /Rate$/.test(k) ? Math.round(r[k] * 10000) / 10000 : cents(r[k]);
  structured.estimatedTaxDueDates = r.estimatedTaxDueDates;
  structured.lastVerified = r.lastVerified;
  structured.checkStepByStep = LINKS.calculator;
  structured.sources = coreSources(r.year);
  return { text: lines.join('\n'), structured };
}

function quarterly(args) {
  const input = Object.assign({}, args, { year: args.year || defaultYear(args.asOf), asOf: args.asOf || today() });
  const p = TAX.estimatedTaxPlan(input);
  const lines = [`${p.year} quarterly estimated tax plan (as of ${p.asOf})`, `- Projected federal tax: ${money(p.projectedTax)}`];
  if (p.withholding) lines.push(`- W-2 withholding (counts as paid evenly through the year): ${money(p.withholding)}`);
  if (p.noPaymentsRequired) {
    lines.push('- No estimated payments are required to avoid the penalty (under $1,000 owed after withholding, or no tax last year).');
  } else {
    lines.push(`- Least to pay in the year to avoid the underpayment penalty: ${money(p.requiredAnnualPayment)} (${p.safeHarborBasis === 'prior' ? pct(p.priorYearRate, 0) + ' of last year\'s tax' : '90% of this year\'s tax'})`);
  }
  if (p.nextDueDate) {
    lines.push(`- Next payment due ${p.nextDueDate}: at least ${money(p.nextMinimumPayment)} to avoid a penalty, or ${money(p.nextFullPayment)} to owe nothing at filing time`);
  } else {
    lines.push(`- All due dates for ${p.year} have passed. Balance due with the return: ${money(p.balanceDueAtFiling)}`);
  }
  for (const s of p.schedule) lines.push(`  - Q${s.quarter} ${s.date} (${s.status}): minimum ${money(s.minimumPayment)}, full ${money(s.fullPayment)}`);
  if (p.pastShortfall > 0) {
    lines.push(`- Earlier installments look short by about ${money(p.pastShortfall)}, so a penalty may apply. Estimate it: ${LINKS.penalty.url}`);
  }
  lines.push(`Plan it or change the numbers: ${LINKS.quarterly.url}`, NOTE);
  const structured = {
    year: p.year, asOf: p.asOf, projectedTax: cents(p.projectedTax), requiredAnnualPayment: cents(p.requiredAnnualPayment),
    safeHarborBasis: p.safeHarborBasis, noPaymentsRequired: p.noPaymentsRequired, nextDueDate: p.nextDueDate,
    nextMinimumPayment: cents(p.nextMinimumPayment), nextFullPayment: cents(p.nextFullPayment), pastShortfall: cents(p.pastShortfall),
    balanceDueAtFiling: cents(p.balanceDueAtFiling),
    schedule: p.schedule.map((s) => ({ quarter: s.quarter, date: s.date, status: s.status, minimumPayment: cents(s.minimumPayment), fullPayment: cents(s.fullPayment) })),
    planOnline: LINKS.quarterly,
    sources: TAX.TAX_YEARS[p.year].sources.filter((s) => s.topic === 'estimated' || s.topic === 'withholding').map((s) => ({ label: s.label, url: s.url }))
  };
  return { text: lines.join('\n'), structured };
}

function seTax(args) {
  const year = args.year || defaultYear();
  const se = TAX.selfEmploymentTax(Number(args.netProfit) || 0, Number(args.w2Wages) || 0, year);
  const cfg = TAX.TAX_YEARS[year].selfEmployment;
  const lines = [
    `${year} self-employment tax on ${money(Number(args.netProfit) || 0)} of net profit`,
    `- Net earnings (${pct(cfg.netEarningsFactor, 2)} of profit): ${money(se.netEarnings)}`,
    se.total === 0 ? `- No self-employment tax: net earnings are under $${cfg.minimumNetEarnings}.` :
      `- Social Security (12.4%, up to ${money(cfg.socialSecurityWageBase)} including W-2 wages): ${money(se.socialSecurity)}\n- Medicare (2.9%, no limit): ${money(se.medicare)}\n- Total: ${money(se.total)}; half (${money(se.deduction)}) is deductible from income`,
    'Income tax is separate: use estimate_1099_tax for the full picture.',
    `How it works: ${LINKS.seGuide.url}`,
    NOTE
  ];
  return {
    text: lines.join('\n'),
    structured: { year, netEarnings: cents(se.netEarnings), socialSecurity: cents(se.socialSecurity), medicare: cents(se.medicare), total: cents(se.total), deduction: cents(se.deduction), learnMore: LINKS.seGuide }
  };
}

function figures(args) {
  const year = args.year || defaultYear();
  const topic = TOPICS[args.topic] ? args.topic : 'all';
  const t = TOPICS[topic];
  const data = DATA[year];
  const section = t.key ? data[t.key] : data;
  const link = LINKS[t.link];
  const text = [
    `${year} federal figures: ${topic.replace(/_/g, ' ')}`,
    '```json', JSON.stringify(section, null, 1), '```',
    `Related free tool: ${link.label}: ${link.url}`,
    'Federal figures from IRS and SSA publications (sources included). Not tax advice.'
  ].join('\n');
  return { text, structured: { year, topic, figures: section, relatedTool: link } };
}

const PERIODS = ['January 1 to March 31', 'April 1 to May 31', 'June 1 to August 31', 'September 1 to December 31'];

function deadlineList() {
  const list = [];
  for (const year of Object.keys(DATA).map(Number)) {
    const d = DATA[year];
    const provisional = d.estimatedTax.provisional;
    d.estimatedTax.dueDates.forEach((date, i) => list.push({
      date, title: `Q${i + 1} ${year} estimated tax payment (income earned ${PERIODS[i]})`, provisional, link: LINKS.quarterly
    }));
    list.push({ date: d.estimatedTax.januaryExceptionFileBy, title: `File the ${year} return and pay in full by today to skip the January estimated payment`, provisional, link: LINKS.quarterly });
    if (d.informationReturns) list.push({ date: d.informationReturns.form1099NEC.dueDate, title: `Forms 1099-NEC due to contractors and the IRS for payments made in ${year} (threshold ${money(d.informationReturns.form1099NEC.threshold)})`, provisional: false, link: LINKS.nec });
    list.push({ date: d.estimatedTax.returnDueDate, title: `${year} federal tax return and any balance due`, provisional, link: LINKS.calculator });
  }
  return list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function deadlines(args) {
  const from = args.from || today();
  const limit = Math.min(20, Math.max(1, Number(args.limit) || 8));
  const list = deadlineList().filter((e) => e.date >= from).slice(0, limit);
  const lines = [`Upcoming federal tax dates for freelancers (from ${from})`];
  for (const e of list) lines.push(`- ${e.date}: ${e.title}${e.provisional ? ' (provisional until the IRS confirms it)' : ''}`);
  if (!list.length) lines.push('- No dates on file after that day yet.');
  lines.push(`Add them to a calendar: ${LINKS.calendar.url}`, 'Dates can move, for example after a disaster declaration: check IRS.gov. Not tax advice.');
  return { text: lines.join('\n'), structured: { from, deadlines: list.map((e) => ({ date: e.date, title: e.title, provisional: !!e.provisional, link: e.link.url })), calendar: LINKS.calendar } };
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const TOOLS = [
  {
    name: 'estimate_1099_tax',
    title: 'Estimate 1099 / self-employment taxes',
    description: 'Estimate the total US federal tax a freelancer, gig worker or 1099 contractor owes for tax year 2026 or 2027. Use it for questions like "how much tax will I owe on my 1099 income?" or "what share of each payment should I set aside?". It works through Schedule C net profit, self-employment tax (Schedule SE), the deduction for half of it, the standard deduction, the QBI deduction (Form 8995), the income tax brackets and the 0.9% Additional Medicare Tax. It handles a W-2 job on the side (reporting only the tax the 1099 work adds), a spouse\'s wages, business losses and qualified tips. Federal only; state tax only as an optional flat rate. Use quarterly_estimated_tax instead to plan payments against the IRS safe harbor rules, and self_employment_tax for SE tax alone. Returns a plain-text breakdown plus structuredContent with every figure in dollars (set-aside and marginal rates as decimals), the IRS sources and a link to a free calculator that shows each step. Read-only, no network access.',
    inputSchema: { type: 'object', properties: ESTIMATE_PROPS, required: ['grossIncome'], additionalProperties: false },
    annotations: READ_ONLY,
    run: estimate
  },
  {
    name: 'quarterly_estimated_tax',
    title: 'Plan quarterly estimated tax payments',
    description: 'Plan US federal quarterly estimated tax payments (Form 1040-ES) for a self-employed person for tax year 2026 or 2027. Use it when the user asks what to pay by a due date (e.g. January 15), how to avoid the underpayment penalty, or whether they missed an installment. Applies the IRS safe harbor rules: pay the smaller of 90% of this year\'s tax or 100% of last year\'s (110% if last year\'s AGI was over $150,000, $75,000 if married filing separately); no payments are needed when less than $1,000 is owed after withholding or there was no tax last year. W-2 withholding counts as paid evenly through the year, and payments already made are assumed on time. Takes the same income inputs as estimate_1099_tax plus withholding, payments made and last year\'s tax. Returns the least to pay to avoid the penalty, the amount to owe nothing at filing, a per-due-date schedule (status passed / next / upcoming) and any earlier shortfall, as text plus structuredContent in dollars. Read-only, no network access.',
    inputSchema: {
      type: 'object',
      properties: Object.assign({}, ESTIMATE_PROPS, {
        withholding: Object.assign(DOLLARS('Federal income tax withheld from W-2 pay this year. Default 0.', 4000), { default: 0 }),
        estimatedPaid: Object.assign(DOLLARS('Estimated tax payments already made for this tax year. Default 0.', 2000), { default: 0 }),
        priorYearTax: DOLLARS('Last year\'s total federal tax (Form 1040 line 24), for the 100% / 110% prior-year safe harbor. Omit if unknown; then only the 90% current-year rule is used.', 8000),
        priorYearAgi: DOLLARS('Last year\'s adjusted gross income. Over $150,000 ($75,000 if married filing separately) makes the prior-year safe harbor 110%. Omit if unknown.', 70000),
        asOf: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Date to plan from, as YYYY-MM-DD, e.g. "2026-11-28". Due dates before it count as passed. Defaults to today.' }
      }),
      required: ['grossIncome'],
      additionalProperties: false
    },
    annotations: READ_ONLY,
    run: quarterly
  },
  {
    name: 'self_employment_tax',
    title: 'Self-employment tax only',
    description: 'Compute US self-employment tax only (Social Security and Medicare, Schedule SE) on a net profit for tax year 2026 or 2027, without income tax. Use it when the user asks about SE tax or "the 15.3% tax" specifically; use estimate_1099_tax for the total federal tax. Rules applied: net earnings are 92.35% of net profit; no SE tax when net earnings are under $400 (about $433 of profit); 12.4% Social Security up to the wage base ($184,500 for 2026, $192,300 for 2027), which the person\'s own W-2 wages use up first; 2.9% Medicare on all net earnings; half of the total is deductible from income. Returns net earnings, the Social Security part, the Medicare part, the total and the deductible half, as text plus structuredContent in dollars. Read-only, no network access.',
    inputSchema: {
      type: 'object',
      properties: {
        netProfit: { type: 'number', description: 'Net profit from self-employment for the year (Schedule C line 31), in US dollars, e.g. 52000. A loss (zero or negative) gives no SE tax.' },
        w2Wages: Object.assign(DOLLARS('The person\'s own W-2 Social Security wages (Form W-2 box 3), which use up the Social Security wage base first. Default 0.', 150000), { default: 0 }),
        year: YEAR
      },
      required: ['netProfit'],
      additionalProperties: false
    },
    annotations: READ_ONLY,
    run: seTax
  },
  {
    name: 'tax_figures',
    title: 'Look up US federal tax figures',
    description: 'Look up official 2026 or 2027 US federal tax figures, each section with its IRS or SSA source. Use it when the user wants a specific number rather than a calculation, e.g. "the 2027 standard deduction", "the 1099-NEC threshold", "the IRS mileage rate" or "Solo 401(k) limits". Topics: brackets, standard_deduction, self_employment, additional_medicare, qbi, qualified_tips, estimated_tax (due dates and safe harbor percentages), 1099_thresholds (1099-NEC and 1099-K), mileage, retirement (Solo 401(k) / SEP-IRA), home_office, premium_tax_credit, or all. Returns the section as JSON (amounts in US dollars, rates as decimals, "max": null meaning no upper limit, dates as YYYY-MM-DD) with its sources, plus a link to a related free calculator. Figures the IRS has not published yet (for example the 2027 mileage rate) are left empty rather than guessed. Read-only, no network access.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', enum: Object.keys(TOPICS), description: 'Which section of figures to return, e.g. "1099_thresholds" or "retirement". "all" returns every section (a large response; prefer a specific topic).' },
        year: YEAR
      },
      required: ['topic'],
      additionalProperties: false
    },
    annotations: READ_ONLY,
    run: figures
  },
  {
    name: 'tax_deadlines',
    title: 'Upcoming federal tax dates for freelancers',
    description: 'List upcoming US federal tax dates for freelancers and the self-employed, in date order: quarterly estimated tax due dates, the January exception (file and pay in full to skip the January installment), the Form 1099-NEC deadline for payers and the tax return due date. Use it when the user asks when the next payment or filing is due. Weekend and holiday shifts are already applied; 2027 estimated tax dates are marked provisional until the IRS publishes the 2027 Form 1040-ES. Returns each date (YYYY-MM-DD) with what is due and a related link, as text plus structuredContent. For how much to pay, use quarterly_estimated_tax. Read-only, no network access.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Only list dates on or after this day, as YYYY-MM-DD, e.g. "2026-12-01". Defaults to today.' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 8, description: 'How many dates to return, from 1 to 20. Default 8.' }
      },
      additionalProperties: false
    },
    annotations: READ_ONLY,
    run: deadlines
  }
];

function listTools() {
  return TOOLS.map(({ run, ...def }) => def);
}

function callTool(name, args) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return null;
  try {
    const { text, structured } = tool.run(args || {});
    return { content: [{ type: 'text', text }], structuredContent: structured };
  } catch (err) {
    return { content: [{ type: 'text', text: 'Error: ' + err.message }], isError: true };
  }
}

module.exports = { listTools, callTool, defaultYear, deadlineList, LINKS };
