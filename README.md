# ASHA-Setu — Vernacular Voice-to-EHR & Maternal Triage Copilot

**Live App:** [https://asha-setu-ashen.vercel.app](https://asha-setu-ashen.vercel.app)  
**Repository:** [https://github.com/kylashrao/asha-setu](https://github.com/kylashrao/asha-setu)

ASHA-Setu is a **₹0-cost, offline-first Progressive Web App (PWA)** built with **OpenAI Codex CLI** to help India's frontline **ASHA (Accredited Social Health Activist)** workers record home-visit vitals by voice, run **deterministic ICMR / NHM maternal risk checks**, trigger urgent **108 / PHC WhatsApp & SMS referrals**, and store patient records **100% locally on the user's device**.

## Supported Languages (11)
Hindi (`hi-IN`) · Kannada (`kn-IN`) · Tamil (`ta-IN`) · Telugu (`te-IN`) · Malayalam (`ml-IN`) · Gujarati (`gu-IN`) · Marathi (`mr-IN`) · Bengali (`bn-IN`) · Odia (`or-IN`) · Punjabi (`pa-IN`) · English (`en-IN`)

## Architecture (₹0 & Local-First)

~~~mermaid
flowchart LR
  A[ASHA Voice / Text Input<br/>11 Indian Languages] --> B[Browser SpeechRecognition<br/>+ Offline Text/Whisper Fallback]
  B --> C[Multilingual Vital Extractor<br/>BP · Hb · Fetal Movement · Danger Signs]
  C --> D[Deterministic NHM Triage Engine<br/>No LLM Hallucination]
  D --> E[(On-Device IndexedDB<br/>Dexie.js Local EHR)]
  E --> F[108 Call · wa.me / SMS PHC Alert<br/>RCH/ANMOL CSV & JSON Backup]
~~~

## Deterministic ICMR / NHM Maternal Risk Thresholds

All triage decisions execute deterministically in `src/lib/triage.ts` (verified by 47 Vitest unit tests):

| Vital / Indicator | Green (Normal) | Yellow (Follow-up) | Red (Urgent PHC / 108 Referral) |
| :--- | :--- | :--- | :--- |
| **Blood Pressure (BP)** | `< 140/90 mmHg` | `140–159 / 90–109 mmHg` | **`>= 160/110 mmHg`** or `>= 140/90` with danger signs |
| **Hemoglobin (Hb)** | `>= 11.0 g/dL` (`>= 10.5` in 2nd trimester) | `7.0–10.9 g/dL` (mild/moderate anemia) | **`< 7.0 g/dL`** (severe anemia) |
| **Fetal Movement** | Normal (`>= 10` kicks / 12h) | Unknown / incomplete | **Reduced or absent** |
| **Danger Signs** | None observed | Mild swelling only | **Bleeding, convulsions, blurred vision, severe headache** |

## Zero-Cost Tech Stack
- **Framework:** Next.js App Router (`output: 'export'`), TypeScript, Tailwind CSS
- **Hosting:** Vercel Hobby Plan (₹0/month static deployment)
- **Local Storage:** IndexedDB via Dexie.js (`patients` & `visits` tables on-device)
- **Offline PWA:** Custom Service Worker (`public/sw.js`) + `scripts/precache.mjs`
- **Testing:** Vitest (`47` passing unit & boundary tests)

## Local Development & Verification

~~~bash
npm install
npx vitest run
npm run build
npm run dev
~~~
