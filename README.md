# BSI Watch — clinical demo

The simplest view of a stool-microbiome bloodstream-infection (BSI) risk model for an allogeneic HCT unit:
one list of the patients on the unit, highest risk first, and a short card for the selected patient.

Use ‹ › (or the arrow keys) to step through days on the simulated unit.

**Data.** Real, de-identified, retrospective allo-HCT timelines from MSK, time-shifted onto one simulated
unit (6–12 patients per day; bed numbers are made up). Risk scores are out-of-fold predictions of the
14-day *E. coli* and *Enterococcus* models (Xavier Lab). Tiers: High = top 10% of risk scores in the cohort,
Watch = next 20%; cut-offs chosen on the same cohort.

Research prototype, not for clinical use. Research version with full timelines:
https://stampei1.github.io/bsi-risk-simulator/
