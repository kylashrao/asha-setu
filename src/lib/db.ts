import Dexie, { type Table } from "dexie";
import type { TranscriptLocale } from "./extractor";
import type { DangerSign, FetalMovement, TriageLevel } from "./triage";

export interface Patient {
  id: string;
  name: string;
  age: number;
  village: string;
  trimester: 1 | 2 | 3;
  gestationalWeeks: number;
  phone: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

export interface Visit {
  id: string;
  patientId: Patient["id"];
  /** ISO 8601 date or timestamp. */
  visitDate: string;
  locale: TranscriptLocale;
  systolic?: number;
  diastolic?: number;
  /** Hemoglobin in g/dL. */
  hb?: number;
  fetalMovement?: FetalMovement;
  dangerSigns?: DangerSign[];
  transcript: string;
  riskLevel: TriageLevel;
  reasons: string[];
  syncedToAnmol: boolean;
}

export class AshaSetuDB extends Dexie {
  declare patients: Table<Patient, Patient["id"]>;
  declare visits: Table<Visit, Visit["id"]>;

  constructor(name = "asha-setu") {
    super(name);
    this.version(1).stores({
      patients: "id, name, village, createdAt",
      visits: "id, patientId, visitDate, [patientId+visitDate], riskLevel",
    });
  }
}

export const db = new AshaSetuDB();
