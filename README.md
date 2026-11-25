# Freelancer tax skill for AI agents

[![tests](https://github.com/jajpo-tools/freelancer-tax-skill/actions/workflows/test.yml/badge.svg)](https://github.com/jajpo-tools/freelancer-tax-skill/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An [Agent Skill](https://code.claude.com/docs/en/skills) that teaches Claude and other agents to work out **US federal taxes for freelancers, gig workers and 1099 contractors** correctly, for tax years 2026 and 2027. It covers:
- self-employment tax
- income tax with the QBI deduction
- how much of each payment to set aside
- quarterly estimated taxes with the IRS safe harbor rules
- official IRS figures and deadlines

Agents often get freelancer tax wrong: they forget the 92.35% step, the Social Security wage base, the QBI cap or the safe harbor rules. This skill makes the agent run a tested calculator instead of doing the math from memory.

**Ask things like:**
- "I made $85,000 freelancing with $12,000 of expenses. What will I owe, and how much should I set aside from each invoice?"
- "I have a $50,000 job and a $10,000 side gig. How much extra tax is that?"
- "How much do I pay on January 15 to avoid a penalty? Last year's tax was $9,000."
- "What's the 2027 Solo 401(k) limit?" or "When is the next estimated payment due?"

## Install

**Claude Code, as a plugin:**

```text
/plugin marketplace add jajpo-tools/freelancer-tax-skill
/plugin install freelancer-tax@jajpo-tools
```

**Claude Code, as a plain skill:** copy the `skills/freelancer-tax` folder to `~/.claude/skills/` (all projects) or `.claude/skills/` (one project).

```bash
git clone https://github.com/jajpo-tools/freelancer-tax-skill
cp -r freelancer-tax-skill/skills/freelancer-tax ~/.claude/skills/
```

**Claude.ai and other agents that read `SKILL.md`:** upload or copy the `skills/freelancer-tax` folder. The skill needs a code tool that can run Node.js 18+.

## What's inside

```text
skills/freelancer-tax/
├── SKILL.md              instructions: which tool to use, what to ask, how to present results, rules people get wrong
├── scripts/estimate.js   the calculator (no dependencies, no network)
├── scripts/lib/          tax engine and 2026/2027 IRS figures
└── reference/figures.md  brackets, key figures and every IRS/SSA source
```

The script works on its own too:

```bash
node skills/freelancer-tax/scripts/estimate.js estimate_1099_tax grossIncome=60000 businessExpenses=8000 year=2026
```

```text
2026 federal tax estimate (single)
- Net profit: $52,000
- Self-employment tax: $7,347 (Social Security $5,955 + Medicare $1,393); half of it, $3,674, is deductible
- Income tax: $2,846 on taxable income of $25,781 (after the $16,100 standard deduction and a $6,445 QBI deduction)
- Total federal tax: $10,193
- Tax added by the self-employment income: $10,193, so set aside about 17% of each payment ($2,548 a quarter)
...
Check every step or change the numbers: https://jajpo.com/taxes/1099-tax-calculator/
```

Tools: `estimate_1099_tax`, `quarterly_estimated_tax`, `self_employment_tax`, `tax_figures`, `tax_deadlines`. Add `--json` for exact figures.

## Accuracy

- The engine is the one behind JAJPO's free [1099 Tax Calculator](https://jajpo.com/taxes/1099-tax-calculator/), which shows every step on the page.
- It's tested against the IRS bracket tables (Rev. Proc. 2025-32 and 2026-35) and the IRS Additional Medicare Tax examples ([self-employment-tax](https://github.com/jajpo-tools/self-employment-tax)).
- The figures come from [us-tax-data](https://github.com/jajpo-tools/us-tax-data), where every section links to its IRS or SSA source.
- The skill tells the agent to present results as estimates, to say state tax isn't included, and never to claim professional review.

**Not covered:** state tax brackets, credits, capital gains rates, the AMT and S corporation payroll.

## Prefer MCP?

The same tools are available as an MCP server for Claude Desktop, Cursor and VS Code: [freelancer-tax-mcp](https://github.com/jajpo-tools/freelancer-tax-mcp).

## License

MIT. Maintained by [JAJPO](https://jajpo.com/): free tax and invoicing tools for US freelancers. Estimates only, not tax advice.
