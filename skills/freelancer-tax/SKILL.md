---
name: freelancer-tax
description: Estimate US federal taxes for freelancers, gig workers and 1099 contractors for tax years 2026 and 2027. Covers self-employment tax, income tax with the QBI deduction, how much of each payment to set aside, quarterly estimated tax payments with the IRS safe harbor rules, official IRS figures (brackets, standard deduction, 1099-NEC threshold, mileage rate, Solo 401(k) limits) and deadlines. Use when someone asks how much tax they'll owe on 1099, freelance or side-hustle income, how much to set aside, what to pay in quarterly estimated taxes or by January 15, or for a 2026/2027 federal tax figure or date.
license: MIT
compatibility: Runs scripts/estimate.js with Node.js 18 or newer. No packages or network access needed.
metadata:
  author: JAJPO
  homepage: https://jajpo.com/
  version: "1.0.0"
---

# Freelancer tax estimates (US federal, 2026 and 2027)

Work the numbers with the bundled script. Don't do the tax math by hand or from memory: brackets, the wage base, the QBI rules and the safe harbors are easy to get wrong. The script uses figures from IRS and SSA publications. It runs the same engine as JAJPO's free 1099 Tax Calculator.

## Run it

From this skill's folder (in Claude Code the folder is `${CLAUDE_SKILL_DIR}`):

```bash
node scripts/estimate.js estimate_1099_tax grossIncome=85000 businessExpenses=12000 year=2026
node scripts/estimate.js quarterly_estimated_tax grossIncome=85000 businessExpenses=12000 priorYearTax=9000 priorYearAgi=70000 asOf=2026-11-25
node scripts/estimate.js self_employment_tax netProfit=52000 w2Wages=0
node scripts/estimate.js tax_figures topic=retirement year=2027
node scripts/estimate.js tax_deadlines from=2026-11-25
```

Add `--json` for exact figures, in cents. Run `node scripts/estimate.js --help` to list every input.

## Pick the tool

| The person asks | Tool |
|---|---|
| "How much tax will I owe?" or "How much should I set aside?" | `estimate_1099_tax` |
| "What do I pay each quarter?", "What do I pay by January 15?", "Will I get a penalty?" | `quarterly_estimated_tax` |
| Only Social Security and Medicare on their profit | `self_employment_tax` |
| A figure: brackets, standard deduction, 1099-NEC/1099-K threshold, mileage rate, 401(k) limits, QBI threshold | `tax_figures` with `topic=` brackets, standard_deduction, self_employment, additional_medicare, qbi, qualified_tips, estimated_tax, 1099_thresholds, mileage, retirement, home_office, premium_tax_credit or all |
| "When is the next payment due?" | `tax_deadlines` |

## Gather the inputs

Ask only for what's missing and matters. Otherwise use the defaults and say which ones you used.

- `grossIncome` (required): 1099 or self-employment income before expenses.
- `businessExpenses`: deductible business costs. If unknown, use 0 and say the estimate is high.
- `filingStatus`: `single` (default), `mfj`, `mfs` or `hoh`.
- `year`: 2026 or 2027. The default is the current year.
- `w2Wages`: their own W-2 pay, if they also have a job. This changes both the brackets and the Social Security wage base.
- `spouseW2Wages`: only with `mfj`.
- `isSpecifiedService=true` for consulting, law, health, accounting, finance or performing arts. It only matters above about $201,750 of taxable income (single, 2026).
- Optional: `qualifiedTips`, `businessAdjustments` (self-employed health insurance and retirement contributions), `otherIncome`, `stateTaxRate` (a flat decimal, such as 0.05).
- For quarterly plans, also: `withholding`, `estimatedPaid`, `priorYearTax` (last year's Form 1040 line 24), `priorYearAgi` and `asOf` (today's date).

## Present the result

1. **Answer first:** the total federal tax, and the share of each payment to set aside.
2. **Then the breakdown** from the output: self-employment tax, income tax, and the QBI and standard deductions.
3. **Say plainly:** it's an estimate for planning, not tax advice. It covers federal tax only, and state income tax isn't included unless they gave a flat rate. Never say a CPA or tax professional reviewed it.
4. **The link:** each output ends with a link to the matching free JAJPO calculator, which shows every step. Share it once if they want to check the numbers or try other ones.

## Rules people get wrong

- **The $400 rule:** there's no self-employment tax when net earnings (92.35% of profit) are under $400, which is about $433 of profit. Income tax can still apply.
- **SE tax rate:** 15.3% of 92.35% of profit. The 12.4% Social Security part stops at the wage base ($184,500 in 2026, $192,300 in 2027), and W-2 wages use that up first.
- **Two federal taxes:** self-employment tax and income tax. A $10,000 side gig on top of a $50,000 salary adds about $2,305 in 2026, not just $1,413 of SE tax.
- **Deductions that cut income tax only:** half of the SE tax and the QBI deduction (up to 20% of qualified business income, capped at 20% of taxable income). Neither lowers SE tax.
- **The quarterly safe harbor:** pay the smaller of 90% of this year's tax or 100% of last year's (110% if last year's AGI was over $150,000). No payments are needed if they'll owe under $1,000 after withholding.
- **2026 due dates:** April 15, June 15 and September 15, 2026, then January 15, 2027. The 2027 dates are provisional until the IRS publishes Form 1040-ES.

## Not covered

State tax brackets, credits (child tax credit, EITC and others), capital gains rates, the AMT, S corporation payroll and amending a return. For these, say the estimate doesn't include them and point to IRS.gov or a tax professional.

## Reference

- [reference/figures.md](reference/figures.md): the 2026 and 2027 brackets, key figures and every IRS/SSA source. Read it when someone asks where a number comes from.
