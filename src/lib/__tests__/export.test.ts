import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { AshaSetuDB, type Patient, type Visit } from "../db";
import { createAnmolCsv, createBackup, createReferralLinks, restoreBackup } from "../export";

const patient: Patient = {
  id: "p1",
  name: 'सीमा, "देवी"',
  age: 26,
  village: "रामपुर",
  trimester: 3,
  gestationalWeeks: 32,
  phone: "9876543210",
  createdAt: "2026-11-19T06:00:00.000Z",
};

const visit: Visit = {
  id: "v1",
  patientId: patient.id,
  visitDate: "2026-11-20T00:30:00+05:30",
  locale: "hi-IN",
  systolic: 160,
  diastolic: 110,
  hb: 6.9,
  fetalMovement: "reduced",
  dangerSigns: ["severeHeadache"],
  transcript: "बच्चे की हलचल कम",
  riskLevel: "RED",
  reasons: ["BP at least 160/110", "Hb below 7 g/dL"],
  syncedToAnmol: false,
};

const databases: AshaSetuDB[] = [];
let nextId = 0;
function testDatabase() {
  const database = new AshaSetuDB(`test-asha-setu-${nextId++}`);
  databases.push(database);
  return database;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

describe("ANC CSV", () => {
  it("joins visits to patients, preserves Unicode and quotes, and formats the visit date", () => {
    const csv = createAnmolCsv({ patients: [patient], visits: [visit] });
    expect(csv.split("\r\n")).toEqual([
      '"Local Patient ID","Name of Pregnant Woman","Age","Village","Mobile Number","Date of ANC Check-up","Systolic BP (mmHg)","Diastolic BP (mmHg)","Hemoglobin (g/dL)"',
      '"p1","सीमा, ""देवी""","26","रामपुर","9876543210","20/11/2026","160","110","6.9"',
      "",
    ]);
    expect(csv).not.toContain(visit.transcript);
  });

  it("neutralizes spreadsheet formulas and leaves unavailable values blank", () => {
    const csv = createAnmolCsv({
      patients: [{ ...patient, village: " =1+2" }],
      visits: [{ ...visit, hb: undefined }],
    });
    expect(csv).toContain(`"' =1+2"`);
    expect(csv).toContain('"160","110",""\r\n');
  });
});

describe("JSON backup and restore", () => {
  it("round-trips every field and supports exact replacement from a file", async () => {
    const source = testDatabase();
    const target = testDatabase();
    await source.patients.add(patient);
    await source.visits.add(visit);
    await target.patients.add({ ...patient, id: "old" });
    await target.visits.add({ ...visit, id: "old-visit", patientId: "old" });

    const json = await createBackup(source);
    expect(JSON.parse(json)).toMatchObject({ format: "asha-setu", version: 1 });
    await expect(restoreBackup(new Blob([json]), { database: target, mode: "replace" }))
      .resolves.toEqual({ patients: 1, visits: 1 });
    expect(await target.patients.toArray()).toEqual([patient]);
    expect(await target.visits.toArray()).toEqual([visit]);
  });

  it("merges by ID and preserves records outside the backup", async () => {
    const database = testDatabase();
    await database.patients.add(patient);
    const json = await createBackup(database);
    await database.patients.update(patient.id, { name: "Changed" });
    await database.patients.add({ ...patient, id: "other" });
    await restoreBackup(json, { database });
    await restoreBackup(json, { database });
    expect(await database.patients.get(patient.id)).toEqual(patient);
    expect(await database.patients.count()).toBe(2);
  });

  it("rejects unsupported versions and orphan visits before clearing existing records", async () => {
    const database = testDatabase();
    await database.patients.add(patient);
    const backup = JSON.parse(await createBackup(database));
    const options = { database, mode: "replace" } as const;
    await expect(restoreBackup(JSON.stringify({ ...backup, version: 2 }), options)).rejects.toThrow("unsupported");
    await expect(restoreBackup(JSON.stringify({ ...backup, patients: [], visits: [visit] }), options))
      .rejects.toThrow("without its patient");
    expect(await database.patients.toArray()).toEqual([patient]);
  });

  it("rolls back a replace when writing a visit fails", async () => {
    const source = testDatabase();
    const target = testDatabase();
    await source.patients.add(patient);
    await source.visits.add(visit);
    const existing = { ...patient, id: "existing" };
    await target.patients.add(existing);
    target.visits.hook("creating", () => { throw new Error("Simulated write failure"); });

    await expect(restoreBackup(await createBackup(source), { database: target, mode: "replace" }))
      .rejects.toThrow("Simulated write failure");
    expect(await target.patients.toArray()).toEqual([existing]);
    expect(await target.visits.count()).toBe(0);
  });
});

describe("referral links", () => {
  it("addresses the PHC and encodes the same Unicode referral in both links", () => {
    const { whatsappUrl, smsUrl, message } = createReferralLinks(patient, visit, "91234 56789");
    expect(whatsappUrl).toMatch(/^https:\/\/wa\.me\/919123456789\?text=/);
    expect(smsUrl).toMatch(/^sms:\+919123456789\?body=/);
    expect(new URL(whatsappUrl).searchParams.get("text")).toBe(message);
    expect(new URL(smsUrl).searchParams.get("body")).toBe(message);
    expect(message).toContain(patient.name);
    expect(message).toContain("160/110 mmHg");
    expect(message).toContain("6.9 g/dL");
    expect(message).toContain("Risk level: RED");
    expect(message).toContain(visit.reasons[0]);
    expect(message).not.toContain(visit.transcript);
    expect(message).not.toContain(patient.phone);
  });

  it("rejects invalid destinations or mismatched records", () => {
    expect(() => createReferralLinks(patient, visit, "+91?body=other")).toThrow("PHC phone");
    expect(() => createReferralLinks(patient, { ...visit, patientId: "other" }, "+919123456789"))
      .toThrow("does not belong");
  });
});
