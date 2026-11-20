import { describe, expect, it } from "vitest";
import { extractVitals, type TranscriptLocale } from "../extractor";
import { assessTriage, triage, type TriageInput, type TriageLevel } from "../triage";

const baseline = {
  systolic: 139,
  diastolic: 89,
  hemoglobin: 11,
  fetalMovement: "normal",
  dangerSigns: [],
} satisfies TriageInput;

describe("triage", () => {
  it.each<[string, TriageInput, TriageLevel]>([
    ["139/89", {}, "GREEN"],
    ["140/90", { systolic: 140, diastolic: 90 }, "YELLOW"],
    ["159/109", { systolic: 159, diastolic: 109 }, "YELLOW"],
    ["160/110", { systolic: 160, diastolic: 110 }, "RED"],
    ["140/89", { systolic: 140 }, "YELLOW"],
    ["139/90", { diastolic: 90 }, "YELLOW"],
    ["160/89", { systolic: 160 }, "RED"],
    ["139/110", { diastolic: 110 }, "RED"],
    ["Hb 6.9", { hemoglobin: 6.9 }, "RED"],
    ["Hb 7.0", { hemoglobin: 7 }, "YELLOW"],
    ["Hb 10.9", { hemoglobin: 10.9 }, "YELLOW"],
    ["Hb 11.0", { hemoglobin: 11 }, "GREEN"],
    ["trimester two Hb 10.5", { trimester: 2, hemoglobin: 10.5 }, "GREEN"],
    ["trimester two Hb 10.49", { trimester: 2, hemoglobin: 10.49 }, "YELLOW"],
    ["reduced fetal movement", { fetalMovement: "reduced" }, "RED"],
    ["absent fetal movement", { fetalMovement: "absent" }, "RED"],
    ["bleeding", { dangerSigns: ["bleeding"] }, "RED"],
    ["convulsions", { dangerSigns: ["convulsions"] }, "RED"],
    ["blurred vision", { dangerSigns: ["blurredVision"] }, "RED"],
    ["severe headache", { dangerSigns: ["severeHeadache"] }, "RED"],
    ["raised BP with another danger sign", { diastolic: 90, dangerSigns: ["other"] }, "RED"],
    ["missing observations", { hemoglobin: undefined }, "YELLOW"],
    ["unconfirmed danger signs", { dangerSigns: undefined }, "YELLOW"],
  ])("%s", (_label, input, expected) => {
    expect(triage({ ...baseline, ...input })).toBe(expected);
  });

  it("reports each urgent trigger even when observations are incomplete", () => {
    expect(assessTriage({ systolic: 160, hemoglobin: 6.9, fetalMovement: "absent" })).toEqual({
      level: "RED",
      reasons: ["Severely high blood pressure", "Hemoglobin below 7 g/dL", "Absent fetal movement"],
    });
  });
});

describe("extractVitals", () => {
  it.each<[TranscriptLocale, string]>([
    ["en-IN", "BP one hundred sixty over 110, Hb six point 9, fetal movement reduced, bleeding"],
    ["hi-IN", "रक्तचाप एक सौ साठ बटा ११०, हीमोग्लोबिन छह दशमलव ९, बच्चे की हलचल कम, रक्तस्राव"],
    ["kn-IN", "ರಕ್ತದೊತ್ತಡ ನೂರ ಅರವತ್ತು ಮೇಲೆ ೧೧೦, ಹಿಮೋಗ್ಲೋಬಿನ್ ಆರು ದಶಮಾಂಶ ೯, ಮಗುವಿನ ಚಲನೆ ಕಡಿಮೆ, ರಕ್ತಸ್ರಾವ"],
    ["ta-IN", "இரத்த அழுத்தம் நூற்று அறுபது மேல் ௧௧௦, ஹீமோகுளோபின் ஆறு புள்ளி ௯, குழந்தையின் அசைவு குறைவு, இரத்தப்போக்கு"],
    ["te-IN", "రక్తపోటు వంద అరవై పై ౧౧౦, హిమోగ్లోబిన్ ఆరు పాయింట్ ౯, బిడ్డ కదలికలు తక్కువ, రక్తస్రావం"],
    ["ml-IN", "രക്തസമ്മർദ്ദം നൂറ്റി അറുപത് മേൽ ൧൧൦, ഹീമോഗ്ലോബിൻ ആറ് പോയിന്റ് ൯, കുഞ്ഞിന്റെ ചലനം കുറവ്, രക്തസ്രാവം"],
    ["gu-IN", "રક્તચાપ એક સો સાઠ પર ૧૧૦, હિમોગ્લોબિન છ દશાંશ ૯, બાળકની હલચલ ઓછી, રક્તસ્ત્રાવ"],
    ["mr-IN", "रक्तदाब एकशे साठ वर ११०, हिमोग्लोबिन सहा दशांश ९, बाळाची हालचाल कमी, रक्तस्राव"],
    ["bn-IN", "রক্তচাপ একশো ষাট ওপর ১১০, হিমোগ্লোবিন ছয় দশমিক ৯, শিশুর নড়াচড়া কম, রক্তপাত"],
    ["or-IN", "ରକ୍ତଚାପ ଏକଶହ ଷାଠି ଉପରେ ୧୧୦, ହିମୋଗ୍ଲୋବିନ୍ ଛଅ ଦଶମିକ ୯, ଶିଶୁର ଗତି କମ, ରକ୍ତସ୍ରାବ"],
    ["pa-IN", "ਬਲੱਡ ਪ੍ਰੈਸ਼ਰ ਇੱਕ ਸੌ ਸੱਠ ਉੱਤੇ ੧੧੦, ਹੀਮੋਗਲੋਬਿਨ ਛੇ ਦਸ਼ਮਲਵ ੯, ਬੱਚੇ ਦੀ ਹਿਲਜੁਲ ਘੱਟ, ਖੂਨ ਵਗਣਾ"],
  ])("extracts mixed spoken and Unicode readings in %s", (locale, transcript) => {
    expect(extractVitals(transcript, locale)).toEqual({
      systolic: 160,
      diastolic: 110,
      hemoglobin: 6.9,
      fetalMovement: "reduced",
      dangerSigns: ["bleeding"],
    });
  });

  it("keeps unknown readings distinct from normal observations", () => {
    expect(extractVitals("BP 120/80, BP 140/90, no bleeding")).toEqual({});
    expect(triage(extractVitals("BP 120/80, Hb 11, fetal movement normal"))).toBe("YELLOW");
    expect(triage(extractVitals("BP 120/80, Hb 11.0, fetal movement normal, no danger signs"))).toBe("GREEN");
  });

  it("reads fully spoken BP and hemoglobin with fractional digits", () => {
    expect(extractVitals("बीपी एक सौ उनतालीस बटा नवासी, एचबी दस दशमलव नौ", "hi-IN"))
      .toEqual({ systolic: 139, diastolic: 89, hemoglobin: 10.9 });
    expect(extractVitals("BP one hundred forty over ninety, Hb seven point zero"))
      .toEqual({ systolic: 140, diastolic: 90, hemoglobin: 7 });
  });

  it("converts explicit g/L readings and ignores slash-separated dates", () => {
    expect(extractVitals("Visit 12 / 11 / 2026, Hb 69 g/L")).toEqual({ hemoglobin: 6.9 });
  });

  it("distinguishes absent movement from a negated danger sign", () => {
    expect(extractVitals("No fetal movement, no bleeding, blurred vision")).toEqual({
      fetalMovement: "absent",
      dangerSigns: ["blurredVision"],
    });
  });
});
