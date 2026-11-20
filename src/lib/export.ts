import { db, type AshaSetuDB, type Patient, type Visit } from "./db";
import { transcriptLanguages } from "./extractor-language";

interface Records {
  patients: Patient[];
  visits: Visit[];
}

interface Backup extends Records {
  format: "asha-setu";
  version: 1;
  exportedAt: string;
}

function readRecords(database: AshaSetuDB): Promise<Records> {
  return database.transaction("r", database.patients, database.visits, async () => {
    const [patients, visits] = await Promise.all([
      database.patients.toArray(),
      database.visits.toArray(),
    ]);
    return { patients, visits };
  });
}

function download(content: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function csvCell(value: string | number | undefined): string {
  let cell = String(value ?? "");
  // Spreadsheet applications can evaluate text cells beginning with these characters.
  if (typeof value === "string" && /^(?:\s*[=+\-@＝＋－＠]|[\t\r\n])/u.test(cell)) {
    cell = "'" + cell;
  }
  return `"${cell.replace(/"/g, '""')}"`;
}

/** ANC handoff using RCH register fields available in the local record. */
export function createAnmolCsv({ patients, visits }: Records): string {
  const patientsById = new Map(patients.map((patient) => [patient.id, patient]));
  const rows: (string | number | undefined)[][] = [[
    "Local Patient ID", "Name of Pregnant Woman", "Age", "Village", "Mobile Number",
    "Date of ANC Check-up", "Systolic BP (mmHg)", "Diastolic BP (mmHg)", "Hemoglobin (g/dL)",
  ]];

  for (const visit of visits) {
    const patient = patientsById.get(visit.patientId);
    if (!patient) throw new Error(`Visit ${visit.id} has no matching patient.`);
    if (!isDate(visit.visitDate)) throw new Error(`Visit ${visit.id} has an invalid date.`);
    const [year, month, day] = visit.visitDate.slice(0, 10).split("-");
    rows.push([
      patient.id, patient.name, patient.age, patient.village, patient.phone,
      `${day}/${month}/${year}`, visit.systolic, visit.diastolic, visit.hb,
    ]);
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export async function downloadAnmolCsv(database = db): Promise<void> {
  const records = await readRecords(database);
  download("\ufeff" + createAnmolCsv(records), "asha-setu-rch-anc.csv", "text/csv;charset=utf-8");
}

export async function createBackup(database = db): Promise<string> {
  const records = await readRecords(database);
  const backup: Backup = {
    format: "asha-setu",
    version: 1,
    exportedAt: new Date().toISOString(),
    ...records,
  };
  return JSON.stringify(backup, null, 2);
}

export async function downloadBackup(database = db): Promise<void> {
  download(await createBackup(database), "asha-setu-backup.json", "application/json;charset=utf-8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNumber(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum;
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    return false;
  }
  const day = value.slice(0, 10);
  const midnight = new Date(day);
  return Number.isFinite(midnight.valueOf()) && midnight.toISOString().startsWith(day) &&
    Number.isFinite(Date.parse(value));
}

function isPatient(value: unknown): value is Patient {
  return isRecord(value) && isId(value.id) && isId(value.name) &&
    isNumber(value.age, 1) && Number.isInteger(value.age) && typeof value.village === "string" &&
    (value.trimester === 1 || value.trimester === 2 || value.trimester === 3) &&
    isNumber(value.gestationalWeeks) && typeof value.phone === "string" && isDate(value.createdAt);
}

function isVisit(value: unknown): value is Visit {
  return isRecord(value) && isId(value.id) && isId(value.patientId) && isDate(value.visitDate) &&
    typeof value.locale === "string" && Object.hasOwn(transcriptLanguages, value.locale) &&
    [value.systolic, value.diastolic, value.hb].every((reading) => reading === undefined || isNumber(reading, Number.MIN_VALUE)) &&
    [undefined, "normal", "reduced", "absent"].includes(value.fetalMovement as string | undefined) &&
    (value.dangerSigns === undefined || (Array.isArray(value.dangerSigns) &&
      value.dangerSigns.every((sign) => ["bleeding", "convulsions", "blurredVision", "severeHeadache", "other"].includes(sign)))) &&
    typeof value.transcript === "string" &&
    (value.riskLevel === "RED" || value.riskLevel === "YELLOW" || value.riskLevel === "GREEN") &&
    Array.isArray(value.reasons) && value.reasons.every((reason) => typeof reason === "string") &&
    typeof value.syncedToAnmol === "boolean";
}

function parseBackup(json: string): Records {
  const data: unknown = JSON.parse(json);
  if (!isRecord(data) || data.format !== "asha-setu" || data.version !== 1 ||
    !isDate(data.exportedAt) || !Array.isArray(data.patients) || !Array.isArray(data.visits) ||
    !data.patients.every(isPatient) || !data.visits.every(isVisit)) {
    throw new Error("Invalid or unsupported ASHA-Setu backup.");
  }

  const { patients, visits } = data;
  const patientIds = new Set(patients.map(({ id }) => id));
  if (patientIds.size !== patients.length || new Set(visits.map(({ id }) => id)).size !== visits.length) {
    throw new Error("Backup contains duplicate record IDs.");
  }
  if (visits.some(({ patientId }) => !patientIds.has(patientId))) {
    throw new Error("Backup contains a visit without its patient.");
  }
  return { patients, visits };
}

/** Merge upserts matching IDs. Replace restores the exact snapshot. Both modes are atomic. */
export async function restoreBackup(
  source: string | Blob,
  { database = db, mode = "merge" }: { database?: AshaSetuDB; mode?: "merge" | "replace" } = {},
): Promise<{ patients: number; visits: number }> {
  const { patients, visits } = parseBackup(typeof source === "string" ? source : await source.text());
  await database.transaction("rw", database.patients, database.visits, async () => {
    if (mode === "replace") {
      await database.visits.clear();
      await database.patients.clear();
    }
    await database.patients.bulkPut(patients);
    await database.visits.bulkPut(visits);
  });
  return { patients: patients.length, visits: visits.length };
}

type ReferralPatient = Pick<Patient, "id" | "name" | "village"> &
  Partial<Pick<Patient, "age" | "gestationalWeeks">>;

export function createReferralLinks(patient: ReferralPatient, visit: Visit, phcPhone: string) {
  if (visit.patientId !== patient.id) throw new Error("Visit does not belong to this patient.");
  const formatted = phcPhone.trim().replace(/[\s().-]+/g, "");
  const phone = /^\d{10}$/.test(formatted) ? `+91${formatted}` : formatted;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error("Enter a PHC phone number with a country code or a 10-digit Indian number.");
  }

  const unknown = "not recorded";
  const message = [
    "Urgent PHC referral",
    `Patient: ${patient.name}${patient.age === undefined ? "" : ` (${patient.age} years)`}, ${patient.village}`,
    `Visit: ${visit.visitDate}`,
    `Gestation: ${patient.gestationalWeeks === undefined ? unknown : `${patient.gestationalWeeks} weeks`}`,
    `BP: ${visit.systolic ?? unknown}/${visit.diastolic ?? unknown} mmHg`,
    `Hb: ${visit.hb === undefined ? unknown : `${visit.hb} g/dL`}`,
    `Fetal movement: ${visit.fetalMovement ?? unknown}`,
    `Risk level: ${visit.riskLevel}`,
    `Trigger reasons: ${visit.reasons.join("; ") || unknown}`,
  ].join("\n");
  const encoded = new URLSearchParams({ text: message }).toString().slice(5).replace(/\+/g, "%20");
  return {
    whatsappUrl: `https://wa.me/${phone.slice(1)}?text=${encoded}`,
    smsUrl: `sms:${phone}?body=${encoded}`,
    message,
  };
}
