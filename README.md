# BSI Watch — clinical-workflow demo

What a stool-microbiome bloodstream-infection (BSI) risk model could look like inside a clinical workflow:
an agent with EHR access prepares a short daily brief for an allogeneic HCT unit, and the care team only
looks at the patients who need it.

- **Brief** — what changed since yesterday (patients newly at high risk, positive cultures, stool samples due).
- **Worklist** — patients grouped High / Watch / Stool due / Low, one line each.
- **Patient card** — risk and 30-day trend, main factors in plain language, context, suggested next steps.
- **Skill spec** — [`SKILL.md`](SKILL.md) describes the agent workflow (gather → score → triage → brief).

Use ‹ › (or the arrow keys) to step through days on the simulated unit.

**Data.** Real, de-identified, retrospective allo-HCT timelines from MSK, time-shifted onto one simulated
unit; bed numbers are synthetic. Risk scores are out-of-fold predictions of the 14-day *E. coli* and
*Enterococcus* models (Xavier Lab). Tiers: High = top 10% of risk scores in the cohort, Watch = next 20%.

Research prototype, not for clinical use. The research version of the tool, with full timelines, is at
https://stampei1.github.io/bsi-risk-simulator/.
