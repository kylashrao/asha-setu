"use client";

import {
  Activity, ArrowUpRight, BookUser, ChevronDown, ClipboardPlus, Download, FileUp, HeartPulse,
  Languages, MessageCircle, Mic, Phone, Save, Search, ShieldCheck, Square, Wifi, WifiOff,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { db, type Patient, type Visit } from "../lib/db";
import { downloadAnmolCsv, downloadBackup, createReferralLinks, restoreBackup } from "../lib/export";
import { extractVitals, type TranscriptLocale } from "../lib/extractor";
import { transcriptLanguages } from "../lib/extractor-language";
import { assessTriage, type DangerSign, type FetalMovement, type TriageLevel } from "../lib/triage";

const languages: Record<TranscriptLocale, string> = {
  "hi-IN": "हिन्दी · Hindi", "kn-IN": "ಕನ್ನಡ · Kannada", "ta-IN": "தமிழ் · Tamil",
  "te-IN": "తెలుగు · Telugu", "ml-IN": "മലയാളം · Malayalam", "gu-IN": "ગુજરાતી · Gujarati",
  "mr-IN": "मराठी · Marathi", "bn-IN": "বাংলা · Bengali", "or-IN": "ଓଡ଼ିଆ · Odia",
  "pa-IN": "ਪੰਜਾਬੀ · Punjabi", "en-IN": "English",
};

const signs: [DangerSign, string][] = [
  ["bleeding", "Bleeding"], ["convulsions", "Convulsions"], ["blurredVision", "Blurred vision"],
  ["severeHeadache", "Severe headache"], ["other", "Other danger sign"],
];

const riskLabels: Record<TriageLevel, string> = {
  RED: "Urgent referral", YELLOW: "Follow-up needed", GREEN: "Normal observations",
};

const identityWords: Record<TranscriptLocale, [string, string, string]> = {
  "en-IN": ["name", "village", "trimester"],
  "hi-IN": ["नाम", "गाँव|गांव", "तिमाही"],
  "kn-IN": ["ಹೆಸರು", "ಗ್ರಾಮ", "ತ್ರೈಮಾಸಿಕ"],
  "ta-IN": ["பெயர்", "கிராமம்", "மும்மாதம்"],
  "te-IN": ["పేరు", "గ్రామం", "త్రైమాసికం"],
  "ml-IN": ["പേര്", "ഗ്രാമം", "ത്രൈമാസികം"],
  "gu-IN": ["નામ", "ગામ", "ત્રિમાસિક"],
  "mr-IN": ["नाव", "गाव", "तिमाही"],
  "bn-IN": ["নাম", "গ্রাম", "ত্রৈমাসিক"],
  "or-IN": ["ନାମ", "ଗାଁ|ଗ୍ରାମ", "ତ୍ରୈମାସିକ"],
  "pa-IN": ["ਨਾਮ", "ਪਿੰਡ", "ਤਿਮਾਹੀ"],
};

interface Recognition {
  lang: string;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

type RecognitionConstructor = new () => Recognition;

function abortRecognition(active: Recognition | null) {
  try {
    active?.abort();
  } catch {
    // The browser may have already ended the session.
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <h2 className="section-title">{icon}{children}</h2>;
}

function positive(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function labelValue(text: string, labels: string) {
  return text.match(new RegExp(
    `(?:^|[,;।\\n]\\s*|\\s)(?:${labels})(?:\\s*[:=]\\s*|\\s+)(?:is\\s+)?([^,;।\\n]+)`, "iu",
  ))?.[1].trim();
}

const trimesterWords = [
  /^(?:1|१|೧|௧|౧|൧|૧|১|୧|੧|first|one|पहली|पहिली|ಮೊದಲ|முதல்|మొదటి|ആദ്യ|પહેલી|প্রথম|ପ୍ରଥମ|ਪਹਿਲੀ)(?![\p{L}\p{M}\p{N}])/iu,
  /^(?:2|२|೨|௨|౨|൨|૨|২|୨|੨|second|two|दूसरी|दुसरी|ಎರಡನೇ|இரண்டாம்|రెండవ|രണ്ടാം|બીજી|দ্বিতীয়|ଦ୍ୱିତୀୟ|ਦੂਜੀ)(?![\p{L}\p{M}\p{N}])/iu,
  /^(?:3|३|೩|௩|౩|൩|૩|৩|୩|੩|third|three|तीसरी|तिसरी|ಮೂರನೇ|மூன்றாம்|మూడవ|മൂന്നാം|ત્રીજી|তৃতীয়|ତୃତୀୟ|ਤੀਜੀ)(?![\p{L}\p{M}\p{N}])/iu,
];

export default function Home() {
  const [tab, setTab] = useState<"visit" | "register">("visit");
  const [locale, setLocale] = useState<TranscriptLocale>("en-IN");
  const [online, setOnline] = useState<boolean | null>(null);
  const [patientId, setPatientId] = useState<string>();
  const [name, setName] = useState("");
  const [village, setVillage] = useState("");
  const [age, setAge] = useState("");
  const [weeks, setWeeks] = useState("");
  const [phone, setPhone] = useState("");
  const [trimester, setTrimester] = useState<Patient["trimester"]>();
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [hb, setHb] = useState("");
  const [movement, setMovement] = useState<FetalMovement>();
  const [dangerSigns, setDangerSigns] = useState<DangerSign[]>();
  const [transcript, setTranscript] = useState("");
  const [phcPhone, setPhcPhone] = useState("");
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<TriageLevel | "all">("all");
  const [notice, setNotice] = useState("");
  const [speechNotice, setSpeechNotice] = useState("");
  const [speechPhase, setSpeechPhase] = useState<"idle" | "starting" | "listening">("idle");
  const speechActive = speechPhase !== "idle";
  const micLabel = speechActive ? "Tap to stop" : "Tap to start";
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const recognition = useRef<Recognition | null>(null);
  const speechTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const transcriptField = useRef<HTMLTextAreaElement>(null);
  const phcField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      const active = recognition.current;
      recognition.current = null;
      clearTimeout(speechTimeout.current);
      abortRecognition(active);
    };
  }, []);

  const register = useLiveQuery(async () => {
    try {
      return await db.transaction("r", db.patients, db.visits, async () => ({
        patients: await db.patients.orderBy("name").toArray(),
        visits: await db.visits.toArray(),
      }));
    } catch {
      return null;
    }
  }, []);

  const latestVisits = new Map<string, Visit>();
  for (const visit of register?.visits ?? []) {
    const latest = latestVisits.get(visit.patientId);
    if (!latest || Date.parse(visit.visitDate) > Date.parse(latest.visitDate)) latestVisits.set(visit.patientId, visit);
  }
  const query = search.trim().toLocaleLowerCase();
  const filteredPatients = register?.patients.filter((patient) =>
    (riskFilter === "all" || latestVisits.get(patient.id)?.riskLevel === riskFilter) &&
    [patient.name, patient.village, patient.phone].some((value) => value.toLocaleLowerCase().includes(query)),
  );

  const readings = { systolic: positive(systolic), diastolic: positive(diastolic), hemoglobin: positive(hb) };
  const assessment = assessTriage({ ...readings, trimester, fetalMovement: movement, dangerSigns });

  function applyTranscript(value: string) {
    const extraction = extractVitals(value, locale);
    const [nameLabel, villageLabel, trimesterLabel] = identityWords[locale];
    const language = transcriptLanguages[locale];
    const english = transcriptLanguages["en-IN"];
    const labels = [nameLabel, villageLabel, trimesterLabel, "name|village|trimester",
      language.bp, language.hb, language.movement, english.bp, english.hb, english.movement].join("|");
    // Separate labeled identity fields even when recognition supplies no punctuation.
    const fields = value.replace(new RegExp(
      `\\s+(?=(?:${labels})(?:\\s|:))`, "giu",
    ), ", ");
    const extractedName = labelValue(fields, `${nameLabel}|name`);
    const extractedVillage = labelValue(fields, `${villageLabel}|village`);
    const extractedTrimester = labelValue(fields, `${trimesterLabel}|trimester`);
    const trimesterIndex = trimesterWords.findIndex((pattern) => extractedTrimester && pattern.test(extractedTrimester));
    if (extractedName && !patientId) setName(extractedName);
    if (extractedVillage && !patientId) setVillage(extractedVillage);
    if (trimesterIndex >= 0) setTrimester((trimesterIndex + 1) as Patient["trimester"]);
    if (extraction.systolic !== undefined) setSystolic(String(extraction.systolic));
    if (extraction.diastolic !== undefined) setDiastolic(String(extraction.diastolic));
    if (extraction.hemoglobin !== undefined) setHb(String(extraction.hemoglobin));
    if (extraction.fetalMovement) setMovement(extraction.fetalMovement);
    if (extraction.dangerSigns) setDangerSigns(extraction.dangerSigns.slice());

    const found = Object.keys(extraction).length || extractedName || extractedVillage || trimesterIndex >= 0;
    setSpeechNotice(found ? "Fields filled. Review and edit them below." : "No fields recognized. Enter the observations below.");
  }

  function manualFallback(reason: string) {
    setSpeechNotice(`${reason} Type a transcript or enter the fields below.`);
    transcriptField.current?.focus();
  }

  function startSpeech() {
    if (recognition.current) return;
    if (!navigator.onLine) return manualFallback("Voice entry requires an internet connection.");
    const browser = window as Window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const SpeechRecognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!SpeechRecognition) return manualFallback("Voice entry is unavailable in this browser.");

    try {
      const active = new SpeechRecognition();
      recognition.current = active;
      active.lang = locale;
      active.interimResults = true;

      let lastFinalTranscript = "";
      const armTimeout = (delay: number, reason: string) => {
        clearTimeout(speechTimeout.current);
        speechTimeout.current = setTimeout(() => {
          if (recognition.current !== active) return;
          stopSpeech();
          manualFallback(reason);
        }, delay);
      };
      const waitForSpeech = () => armTimeout(60_000, "Speech recognition timed out.");
      active.onstart = () => {
        if (recognition.current !== active) return;
        setSpeechPhase("listening");
        waitForSpeech();
      };
      active.onresult = (event) => {
        if (recognition.current !== active) return;
        waitForSpeech();
        const results = Array.from(event.results);
        const value = results.map((result) => result[0].transcript).join(" ").trim();
        const finalValue = results.filter((result) => result.isFinal)
          .map((result) => result[0].transcript).join(" ").trim();
        setTranscript(value);
        if (finalValue && finalValue !== lastFinalTranscript) {
          lastFinalTranscript = finalValue;
          applyTranscript(finalValue);
        }
      };
      active.onerror = (event) => {
        if (recognition.current !== active) return;
        resetSpeech();
        manualFallback(`Speech recognition error: ${event.error}.`);
      };
      active.onend = () => {
        if (recognition.current !== active) return;
        resetSpeech();
        setSpeechNotice((current) => current || "No final speech captured. Try again or enter the observations below.");
      };
      setSpeechPhase("starting");
      setSpeechNotice("");
      armTimeout(10_000, "The microphone did not start.");
      active.start();
    } catch (error) {
      stopSpeech();
      manualFallback(error instanceof Error ? error.message : "Could not start speech recognition.");
    }
  }

  function resetSpeech() {
    clearTimeout(speechTimeout.current);
    recognition.current = null;
    setSpeechPhase("idle");
  }

  function stopSpeech() {
    const active = recognition.current;
    resetSpeech();
    abortRecognition(active);
  }

  function changeTab(next: typeof tab) {
    stopSpeech();
    setSpeechNotice("");
    setNotice("");
    setTab(next);
  }

  function openPatient(patient?: Patient) {
    setPatientId(patient?.id);
    setName(patient?.name ?? "");
    setVillage(patient?.village ?? "");
    setAge(patient ? String(patient.age) : "");
    setWeeks(patient ? String(patient.gestationalWeeks) : "");
    setPhone(patient?.phone ?? "");
    setTrimester(patient?.trimester);
    setSystolic("");
    setDiastolic("");
    setHb("");
    setMovement(undefined);
    setDangerSigns(undefined);
    setTranscript("");
    changeTab("visit");
  }

  function patientRecord(id: string, date: string): Patient {
    return {
      id, createdAt: date, name: name.trim(), village: village.trim(), age: Number(age),
      gestationalWeeks: Number(weeks), trimester: trimester ?? 1, phone: phone.trim(),
    };
  }

  function visitRecord(id: string, owner: string, date: string): Visit {
    return {
      id, patientId: owner, visitDate: date, locale, systolic: readings.systolic,
      diastolic: readings.diastolic, hb: readings.hemoglobin, fetalMovement: movement,
      dangerSigns, transcript, riskLevel: assessment.level, reasons: assessment.reasons, syncedToAnmol: false,
    };
  }

  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The operation could not be completed.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function saveVisit() {
    void run(async () => {
      if (!name.trim() || !village.trim() || !trimester || !positive(age) || !Number.isInteger(Number(age)) ||
        !weeks.trim() || !Number.isFinite(Number(weeks)) || Number(weeks) < 0) {
        throw new Error("Enter the patient’s name, village, age, trimester and gestational weeks to save.");
      }
      if ([systolic, diastolic, hb].some((reading) => reading && positive(reading) === undefined)) {
        throw new Error("Enter positive vital readings or leave them blank.");
      }
      const now = new Date().toISOString();
      const id = patientId ?? crypto.randomUUID();
      await db.transaction("rw", db.patients, db.visits, async () => {
        const previous = patientId ? await db.patients.get(patientId) : undefined;
        if (patientId && !previous) throw new Error("This patient record is no longer available. Start a new visit.");
        await db.patients.put(patientRecord(id, previous?.createdAt ?? now));
        await db.visits.add(visitRecord(crypto.randomUUID(), id, now));
      });
      openPatient(patientRecord(id, now));
      setNotice("Visit saved to this device.");
    });
  }

  function referral(channel: "whatsappUrl" | "smsUrl") {
    try {
      const patient = patientRecord(patientId ?? "current", new Date().toISOString());
      // Referral does not require completing the register fields.
      const links = createReferralLinks({
        ...patient,
        name: patient.name || "Name not recorded",
        village: patient.village || "Village not recorded",
        age: positive(age),
        gestationalWeeks: weeks.trim() && Number.isFinite(Number(weeks)) && Number(weeks) >= 0
          ? Number(weeks)
          : undefined,
      }, visitRecord("current", patient.id, patient.createdAt), phcPhone);
      window.location.assign(links[channel]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Check the PHC phone number.");
      phcField.current?.focus();
    }
  }

  function handleRestore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void run(async () => {
      const counts = await restoreBackup(file);
      setNotice(`Restored ${counts.patients} patient records and ${counts.visits} visits.`);
    });
  }

  return (
    <>
      <header className="masthead">
        <div className="shell masthead-inner">
          <div className="brand"><span className="brand-icon"><HeartPulse size={24} /></span><div><strong>ASHA-Setu</strong><span>Maternal care</span></div></div>
          <div className="toolbar">
            <label className="language"><Languages size={19} /><select aria-label="Speech language" value={locale} disabled={speechActive}
              onChange={(event) => setLocale(event.target.value as TranscriptLocale)}>
              {Object.entries(languages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select><ChevronDown size={16} /></label>
            <span className={`connection ${online === false ? "disconnected" : ""}`} role="status">
              {online === false ? <WifiOff size={16} /> : <Wifi size={16} />}{online === null ? "Checking" : online ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </header>
      <main className="shell workspace">
        <nav className="tabs" aria-label="Visit workspace">
          <button type="button" aria-pressed={tab === "visit"} onClick={() => changeTab("visit")}><ClipboardPlus size={19} /> Visit assessment</button>
          <button type="button" aria-pressed={tab === "register"} onClick={() => changeTab("register")}><BookUser size={19} /> Patient Register</button>
        </nav>
        {tab === "visit" ? (
          <>
            <div className="page-title"><h1>Visit assessment</h1><p>Record observations and check maternal risk.</p></div>
            <div className="visit-layout">
              <div className="form-stack">
                <section className="panel speech-panel">
                  <div className="speech-head">
                    <button className="mic" type="button" aria-label={micLabel}
                      aria-pressed={speechActive}
                      onClick={speechActive ? stopSpeech : startSpeech}>
                      {speechActive ? <Square size={27} /> : <Mic size={30} />}
                    </button>
                    <div><h2>{micLabel}</h2>
                      <p>Dictate using your browser’s online speech service, or type below.</p></div>
                  </div>
                  <label className="field"><span>Visit transcript</span>
                    <textarea ref={transcriptField} value={transcript} onChange={(event) => setTranscript(event.target.value)}
                      placeholder="Name Meera, village Rampur, BP 120 over 80, Hb 11" rows={2} />
                  </label>
                  <div className="speech-footer"><button className="button secondary" type="button" disabled={!transcript.trim() || speechActive} onClick={() => applyTranscript(transcript)}>Fill from text</button>
                    <span role="status">{speechPhase === "starting" ? "Starting microphone…" : speechPhase === "listening" ? "Listening…" : speechNotice}</span></div>
                </section>
                <section className="panel">
                  <div className="panel-heading"><SectionTitle icon={<BookUser size={22} />}>Patient details</SectionTitle>
                    {patientId && <button className="text-button" type="button" onClick={() => openPatient()}>New patient</button>}</div>
                  <div className="fields">
                    <Field label="Name"><input autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} placeholder="Patient name" /></Field>
                    <Field label="Village"><input value={village} onChange={(event) => setVillage(event.target.value)} placeholder="Village name" /></Field>
                    <Field label="Trimester"><div className="select-wrap"><select value={trimester ?? ""} onChange={(event) => setTrimester(event.target.value ? Number(event.target.value) as Patient["trimester"] : undefined)}><option value="">Select trimester</option><option value="1">First</option><option value="2">Second</option><option value="3">Third</option></select><ChevronDown size={18} /></div></Field>
                    <Field label="Gestational weeks"><input type="number" min="0" step="any" inputMode="decimal" value={weeks} onChange={(event) => setWeeks(event.target.value)} placeholder="Weeks" /></Field>
                    <Field label="Age"><input type="number" min="1" step="1" inputMode="numeric" value={age} onChange={(event) => setAge(event.target.value)} placeholder="Years" /></Field>
                    <Field label="Patient phone (optional)"><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Mobile number" /></Field>
                  </div>
                </section>
                <section className="panel">
                  <SectionTitle icon={<Activity size={22} />}>Vitals &amp; danger signs</SectionTitle>
                  <div className="fields">
                    <Field label="Systolic BP · mmHg"><input type="number" min="1" inputMode="numeric" value={systolic} onChange={(event) => setSystolic(event.target.value)} placeholder="Top number" /></Field>
                    <Field label="Diastolic BP · mmHg"><input type="number" min="1" inputMode="numeric" value={diastolic} onChange={(event) => setDiastolic(event.target.value)} placeholder="Bottom number" /></Field>
                    <Field label="Hemoglobin · g/dL"><input type="number" min="0.1" step="any" inputMode="decimal" value={hb} onChange={(event) => setHb(event.target.value)} placeholder="e.g. 11.0" /></Field>
                    <Field label="Fetal movement"><div className="select-wrap"><select value={movement ?? ""} onChange={(event) => setMovement(event.target.value ? event.target.value as FetalMovement : undefined)}><option value="">Unknown</option><option value="normal">Normal</option><option value="reduced">Reduced</option><option value="absent">Absent</option></select><ChevronDown size={18} /></div></Field>
                  </div>
                  <fieldset className="signs"><legend>Danger signs</legend><div>
                    {signs.map(([value, label]) => <button className="chip" type="button" aria-pressed={dangerSigns?.includes(value) ?? false} key={value} onClick={() => setDangerSigns((current) => current?.includes(value) ? (current.length > 1 ? current.filter((sign) => sign !== value) : undefined) : [...(current ?? []), value])}>{label}</button>)}
                    <button className="chip" type="button" aria-pressed={dangerSigns?.length === 0} onClick={() => setDangerSigns((current) => current?.length === 0 ? undefined : [])}>None observed</button>
                  </div></fieldset>
                </section>
              </div>

              <aside className="result-stack">
                <section className="panel result-panel" id="triage-result">
                  <SectionTitle icon={<ShieldCheck size={22} />}>NHM triage</SectionTitle>
                  <div className={`result ${assessment.level.toLowerCase()}`} aria-live="polite">
                    <span className="risk-code"><span />{assessment.level}</span><h3>{riskLabels[assessment.level]}</h3>
                    <ul>{assessment.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                  </div>
                  <a className="button emergency" href="tel:108"><Phone size={19} /> Call 108</a>
                  <Field label="PHC phone"><input ref={phcField} type="tel" value={phcPhone} onChange={(event) => setPhcPhone(event.target.value)} placeholder="Enter PHC mobile number" /></Field>
                  <div className="referral-actions">
                    <button type="button" className="button secondary" onClick={() => referral("whatsappUrl")}><MessageCircle size={19} /> Alert PHC on WhatsApp</button>
                    <button type="button" className="button secondary" onClick={() => referral("smsUrl")}><MessageCircle size={19} /> Send SMS</button>
                  </div>
                  <button type="button" className="button primary" onClick={saveVisit} disabled={busy || speechActive}><Save size={19} /> Save Visit to Device</button>
                  {notice && <p className="notice" role="status">{notice}</p>}
                </section>
              </aside>
            </div>
            <a className={`mobile-result ${assessment.level.toLowerCase()}`} href="#triage-result">
              <span>{assessment.level} · {riskLabels[assessment.level]}</span><span>View triage</span>
            </a>
          </>
        ) : (
          <>
            <div className="page-title"><h1>Patient Register</h1><p>Search patient records and export visits stored on this device.</p></div>
            <section className="panel register-panel">
              <div className="fields">
                <Field label="Search patients"><div className="search-wrap"><Search size={18} /><input type="search" placeholder="Name, village or phone" value={search} onChange={(event) => setSearch(event.target.value)} /></div></Field>
                <Field label="Latest visit risk"><div className="select-wrap"><select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as typeof riskFilter)}><option value="all">All risk levels</option><option value="RED">Red · Urgent referral</option><option value="YELLOW">Yellow · Follow-up needed</option><option value="GREEN">Green · Normal observations</option></select><ChevronDown size={18} /></div></Field>
              </div>
              <div className="file-actions">
                <button type="button" className="button secondary" disabled={busy} onClick={() => void run(() => downloadAnmolCsv())}><Download size={18} /> ANMOL/RCH CSV</button>
                <button type="button" className="button secondary" disabled={busy} onClick={() => void run(() => downloadBackup())}><Download size={18} /> JSON backup</button>
                <label className={`button secondary upload ${busy ? "disabled" : ""}`}><FileUp size={18} /> Restore JSON<input type="file" aria-label="Restore JSON backup" accept=".json,application/json" disabled={busy} onChange={handleRestore} /></label>
              </div>
              {notice && <p className="notice" role="status">{notice}</p>}
              {register === null && <p role="alert">IndexedDB could not be opened on this device.</p>}
              {register === undefined && <p role="status">Loading patient records…</p>}
              {filteredPatients?.length === 0 && <p className="empty">No patients match this view.</p>}
              {!!filteredPatients?.length && <ul className="records">
                {filteredPatients.map((patient) => {
                  const lastVisit = latestVisits.get(patient.id);
                  return <li key={patient.id}><button className="record" type="button" onClick={() => openPatient(patient)}>
                    <span className="record-main"><strong>{patient.name}</strong><span>{patient.village}{lastVisit ? ` · ${lastVisit.visitDate.slice(0, 10)}` : ""}</span></span>
                    {lastVisit && <span className={`record-risk ${lastVisit.riskLevel.toLowerCase()}`}>{lastVisit.riskLevel}</span>}
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </button></li>;
                })}
              </ul>}
            </section>
          </>
        )}
      </main>
    </>
  );
}
