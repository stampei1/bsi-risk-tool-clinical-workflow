---
name: bsi-watch
description: Daily bloodstream-infection risk brief for an allogeneic HCT unit. Use each morning (or when a new stool 16S result posts) to score every patient for E. coli and Enterococcus BSI risk over the next 14 days, triage them, and write a short brief for the care team. Research prototype; not validated for clinical use.
---

# BSI Watch — EHR agent skill (design sketch)

Turns new stool microbiome results into a two-line brief and a short worklist. The agent does the data
gathering and scoring; clinicians only review flagged patients.

## When to run
- Daily at 06:00 for every patient on the unit, and
- whenever a new stool 16S result is filed for a patient on the unit.

## 1. Gather (read-only EHR tools)
For each patient currently admitted to the unit:

| Data | Source (Epic example) | Window |
|---|---|---|
| Stool 16S relative abundances (ASV table) | lab results / research LIMS | all results this admission |
| Antibacterial administrations: drug, route, start/stop | MAR | last 60 days |
| ANC (absolute neutrophil count) | CBC with differential | last 30 days |
| Max temperature per day | flowsheet vitals | last 2 days |
| Blood cultures and organisms | microbiology | last 7 days |
| Transplant date | transplant episode | — |

If the most recent stool result is older than 7 days, do not score; mark the patient **Stool due**.

## 2. Score
Build the model features from the data above (pathogen abundance and its 7–30-day trajectory, antibiotic
exposure by class, ANC level and trend, day relative to transplant, community composition) and run both
models on the newest stool sample:

- `ecoli_14d` → P(E. coli BSI within 14 days)
- `enterococcus_14d` → P(Enterococcus BSI within 14 days)

Also compute per-feature contributions (TreeSHAP), summed into plain-language groups, for the "main factors".
Skip an organism if the patient already has a positive blood culture for it (risk is moot).

## 3. Triage
Per organism, using cut-offs fixed in advance on the development cohort:

| Tier | Definition | Development-cohort rate of BSI ≤ 14 d |
|---|---|---|
| High | top 10% of risk scores | E. coli ~1 in 8 · Enterococcus ~1 in 7 |
| Watch | next 20% | ~1 in 42 · ~1 in 21 |
| Low | remaining 70% | ~1 in 447 · ~1 in 155 |

Patient tier = the higher of the two organisms. Patients with a positive blood culture in the last 7 days are
listed separately.

## 4. Brief and worklist
Output to the team's channel (EHR in-basket, unit dashboard or chat):

1. **Headline**: number of High patients today.
2. **What changed since yesterday**: patients newly High, positive cultures, stool samples due.
3. **Worklist**: one line per High/Watch patient — bed, organism, tier, the single most specific factor.
4. **Per-patient card on request**: risk and 30-day trend, top 3 factors, context (ANC, fever, current
   antibiotics, dominant gut taxon), suggested next steps from the unit's protocol.

Suggested next steps are configured by the unit (examples: review with transplant ID; repeat stool sample in
2–3 days). The skill never recommends a specific treatment.

## Guardrails
- Write actions (e.g. ordering a stool sample) only as drafts for clinician sign-off.
- Always show the score's age (days since the stool sample) and the tier's observed rate, not a bare number.
- Log every brief and every clinician acknowledgement for audit and for prospective evaluation.
- Status: single-center retrospective development (MSK); cut-offs chosen on the same cohort; not prospectively
  validated. Use for research and workflow design only.
