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
const YEAR = { type: 'integer', enum: [2026, 2027], description: 'Tax year. Defaults to the current year (2026 or 2027).' };
const STATUS = { type: 'string', enum: ['single', 'mfj', 'mfs', 'hoh'], description: 'Filing status: single, mfj (married filing jointly), mfs (married filing separately), hoh (head of household). Default single.' };
const DOLLARS = (description) => ({ type: 'number', minimum: 0, description });

const ESTIMATE_PROPS = {
  year: YEAR,
  filingStatus: STATUS,
  grossIncome: DOLLARS('Self-employment / 1099 income for the year, before expenses.'),
  businessExpenses: DOLLARS('Deductible business expenses (Schedule C).'),
  w2Wages: DOLLARS('The person\'s own W-2 wages, if any. They use up the Social Security wage base first.'),
  spouseW2Wages: DOLLARS('Spouse\'s W-2 wages; only used with mfj.'),
  otherIncome: DOLLARS('Other taxable income (interest, etc.).'),
  isSpecifiedService: { type: 'boolean', description: 'True for a specified service business (consulting, law, health, accounting, financial services, performing arts...), which matters for the QBI deduction at high incomes.' },
  qualifiedTips: DOLLARS('Tips reported on a Form 1099 that qualify for the Section 224 deduction.'),
  businessAdjustments: DOLLARS('Self-employed health insurance and retirement contributions (lower income tax and QBI, not SE tax).'),
  stateTaxRate: { type: 'number', minimum: 0, maximum: 0.2, description: 'Optional flat state income tax rate as a decimal (0.05 = 5%), applied to net profit. Reported separately.' }
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
    description: 'Estimate US federal tax for a freelancer, gig worker or 1099 contractor (tax year 2026 or 2027): self-employment tax (Schedule SE), income tax after the standard and QBI deductions, Additional Medicare Tax, the share of each payment to set aside, and the quarterly amount. Handles W-2 wages on the side, a spouse\'s wages, business losses and qualified tips. Federal only; state tax only as an optional flat rate.',
    inputSchema: { type: 'object', properties: ESTIMATE_PROPS, required: ['grossIncome'], additionalProperties: false },
    annotations: READ_ONLY,
    run: estimate
  },
  {
    name: 'quarterly_estimated_tax',
    title: 'Plan quarterly estimated tax payments',
    description: 'Work out US federal quarterly estimated tax payments (Form 1040-ES) for a self-employed person: the least to pay to avoid the underpayment penalty under the 90% / 100% / 110% safe harbor rules, what to pay on each due date, missed installments, and W-2 withholding.',
    inputSchema: {
      type: 'object',
      properties: Object.assign({}, ESTIMATE_PROPS, {
        withholding: DOLLARS('Federal income tax withheld from W-2 pay this year.'),
        estimatedPaid: DOLLARS('Estimated tax payments already made this year.'),
        priorYearTax: DOLLARS('Last year\'s total federal tax (Form 1040 line 24), for the prior-year safe harbor. Leave out if unknown.'),
        priorYearAgi: DOLLARS('Last year\'s AGI; over $150,000 ($75,000 if married filing separately) makes the safe harbor 110%.'),
        asOf: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Date to plan from, YYYY-MM-DD. Defaults to today.' }
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
    description: 'Self-employment tax (Social Security and Medicare, Schedule SE) on a net profit, with the wage base shared with W-2 wages, and the deductible half.',
    inputSchema: {
      type: 'object',
      properties: { netProfit: { type: 'number', description: 'Net profit from self-employment (Schedule C line 31).' }, w2Wages: DOLLARS('W-2 Social Security wages, if any.'), year: YEAR },
      required: ['netProfit'],
      additionalProperties: false
    },
    annotations: READ_ONLY,
    run: seTax
  },
  {
    name: 'tax_figures',
    title: 'Look up US federal tax figures',
    description: 'Official 2026 or 2027 US federal tax figures with their IRS/SSA sources: tax brackets, standard deduction, self-employment tax, Additional Medicare Tax, QBI deduction, qualified tips deduction, estimated tax rules, 1099-NEC and 1099-K thresholds, business mileage rate, Solo 401(k)/SEP-IRA limits, home office rates, premium tax credit table.',
    inputSchema: {
      type: 'object',
      properties: { topic: { type: 'string', enum: Object.keys(TOPICS), description: 'Which figures. "all" returns every section.' }, year: YEAR },
      required: ['topic'],
      additionalProperties: false
    },
    annotations: READ_ONLY,
    run: figures
  },
  {
    name: 'tax_deadlines',
    title: 'Upcoming federal tax dates for freelancers',
    description: 'Upcoming US federal tax dates for the self-employed: quarterly estimated tax due dates, the January exception, the Form 1099-NEC deadline and the return due date.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'List dates on or after this day (YYYY-MM-DD). Defaults to today.' },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: 'How many dates (default 8).' }
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
