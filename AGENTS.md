# AGENTS.md — ASHA-Setu
- Goal: Build an offline-first, ₹0-cost Maternal Triage & Digital EHR PWA for Indian ASHA workers.
- Stack: Next.js App Router (`output: 'export'` in next.config.ts), Tailwind CSS, Dexie.js (IndexedDB), Web Speech API + Transformers.js fallback, Vitest.
- Storage: 100% on-device IndexedDB via Dexie.js (`patients` and `visits` tables). Never add paid APIs or external databases.
- Clinical Safety: Triage MUST be 100% deterministic in `src/lib/triage.ts` using NHM/ICMR thresholds:
  - RED (Urgent PHC / 108 Referral): BP >= 160/110, OR BP >= 140/90 with danger signs, OR Hb < 7.0 g/dL, OR reduced/absent fetal movement, OR bleeding/convulsions/blurred vision/severe headache.
  - YELLOW (Moderate / Follow-up): BP 140-159 / 90-109 without severe symptoms, OR Hb 7.0-10.9 g/dL.
  - GREEN (Normal): BP < 140/90, Hb >= 11.0 g/dL (or >= 10.5 in 2nd trimester), normal fetal movement, no danger signs.
- Languages: Support hi-IN, kn-IN, ta-IN, te-IN, ml-IN, gu-IN, mr-IN, bn-IN, or-IN, pa-IN, en-IN.
