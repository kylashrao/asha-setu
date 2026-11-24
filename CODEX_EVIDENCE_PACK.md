# Codex Evidence Pack — ASHA-Setu

- **Repository:** https://github.com/kylashrao/asha-setu
- **Live Deployment:** https://asha-setu-ashen.vercel.app
- **Agent & CLI Version:** OpenAI Codex CLI (`v0.171.0`)
- **Model Used:** `GPT-6.2-Sol` (default) guided by root `AGENTS.md`

## 1. Stage-by-Stage Lifecycle & Model Discipline

| Stage | Scope & Prompt Strategy | Files Produced / Updated | Verification |
| :--- | :--- | :--- | :--- |
| **1. Spec & Guardrails** | Defined `AGENTS.md` first so Codex never uses LLMs for clinical decisions and enforces static export (`output: 'export'`). | `AGENTS.md`, `next.config.ts` | Static export configured |
| **2. Clinical Core & 11-Language Extractor** | Scoped Prompt 1 to pure deterministic NHM/ICMR rules + spoken/Unicode number parsing across 11 Indian locales. | `src/lib/triage.ts`, `src/lib/extractor.ts`, `src/lib/__tests__/triage.test.ts` | `38/38` Vitest boundary tests passed |
| **3. Local-First EHR & Exports** | Scoped Prompt 2 to on-device IndexedDB (`Dexie.js`) + RCH/ANMOL CSV, JSON backup/restore, and `wa.me`/`sms:` referrals. | `src/lib/db.ts`, `src/lib/export.ts`, `src/lib/__tests__/export.test.ts` | `46/46` Vitest tests passed |
| **4. Mobile PWA UI & Offline Shell** | Scoped Prompt 3 to thumb-friendly UI, 11-language selector, system fonts (no remote font fetch), and SW precaching. | `src/app/page.tsx`, `src/app/layout.tsx`, `public/sw.js`, `public/manifest.json`, `scripts/precache.mjs` | `47/47` Vitest tests + `npm run build` + SW smoke test passed |
| **5. Production Debugging** | Targeted bugfix prompts after live testing on Vercel: removed strict `processLocally` block, fixed `Tap to start/stop` state reset on `onerror`/`abort()`, and switched SW navigation to network-first. | `src/app/page.tsx`, `src/app/globals.css`, `public/sw.js`, `scripts/precache.mjs` | Live mic transcription verified on `asha-setu-ashen.vercel.app` (`2abae3f`) |

## 2. Why This Stack & Codex Workflow Fit
- **Zero-Hallucination Safety:** Clinical thresholds (`BP >= 160/110`, `Hb < 7.0 g/dL`, reduced fetal movement) are deterministic TypeScript rules tested in Vitest—not LLM guesses.
- **Token & Reasoning Efficiency:** Splitting work into 3 bounded prompts + 1 surgical debug pass kept context focused and avoided unnecessary refactors.
- **₹0 Real-World Deployment:** Static Next.js PWA + IndexedDB + Vercel Hobby = ₹0 recurring cost for rural ASHA workers.
