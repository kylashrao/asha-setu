export type DangerSign =
  | "bleeding"
  | "convulsions"
  | "blurredVision"
  | "severeHeadache"
  | "other";

export type FetalMovement = "normal" | "reduced" | "absent";
export type TriageLevel = "RED" | "YELLOW" | "GREEN";

export interface TriageInput {
  systolic?: number;
  diastolic?: number;
  hemoglobin?: number;
  fetalMovement?: FetalMovement;
  dangerSigns?: readonly DangerSign[];
  trimester?: 1 | 2 | 3;
}

function validReading(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

export function assessTriage({
  systolic,
  diastolic,
  hemoglobin,
  fetalMovement,
  dangerSigns,
  trimester,
}: TriageInput): { level: TriageLevel; reasons: string[] } {
  const hasSystolic = validReading(systolic);
  const hasDiastolic = validReading(diastolic);
  const hasHemoglobin = validReading(hemoglobin);
  const elevatedBp =
    (hasSystolic && systolic >= 140) || (hasDiastolic && diastolic >= 90);

  const urgent: string[] = [];
  if ((hasSystolic && systolic >= 160) || (hasDiastolic && diastolic >= 110)) {
    urgent.push("Severely high blood pressure");
  }
  if (elevatedBp && dangerSigns?.length) urgent.push("High blood pressure with danger signs");
  if (hasHemoglobin && hemoglobin < 7) urgent.push("Hemoglobin below 7 g/dL");
  if (fetalMovement === "reduced") urgent.push("Reduced fetal movement");
  if (fetalMovement === "absent") urgent.push("Absent fetal movement");

  const signLabels = {
    bleeding: "Bleeding", convulsions: "Convulsions",
    blurredVision: "Blurred vision", severeHeadache: "Severe headache",
  };
  for (const sign of new Set(dangerSigns)) {
    if (sign !== "other") urgent.push(signLabels[sign]);
  }
  if (urgent.length) return { level: "RED", reasons: urgent };

  const normalHemoglobin = trimester === 2 ? 10.5 : 11;
  const followUp: string[] = [];
  if (elevatedBp) followUp.push("Elevated blood pressure");
  if (hasHemoglobin && hemoglobin < normalHemoglobin) followUp.push("Low hemoglobin");
  if (!hasSystolic || !hasDiastolic || !hasHemoglobin || !fetalMovement || !dangerSigns) {
    followUp.push("Complete the missing observations");
  }
  if (dangerSigns?.includes("other")) followUp.push("Other danger sign reported");
  return followUp.length
    ? { level: "YELLOW", reasons: followUp }
    : { level: "GREEN", reasons: ["Recorded observations are within the normal range"] };
}

export function triage(input: TriageInput): TriageLevel {
  return assessTriage(input).level;
}
