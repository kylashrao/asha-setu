import { irregularCardinals, transcriptLanguages } from "./extractor-language";
import type { DangerSign, FetalMovement, TriageInput } from "./triage";

export type TranscriptLocale = keyof typeof transcriptLanguages;
export type ExtractedVitals = Omit<TriageInput, "trimester">;

const word = String.raw`[\p{L}\p{M}\p{N}]`;
const start = `(?<!${word})`;
const end = `(?!${word})`;
const signTypes = ["bleeding", "convulsions", "blurredVision", "severeHeadache"] as const;
const digitZeros = "०০੦૦୦௦౦೦൦٠۰";

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase()
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/\p{Nd}/gu, (digit) => {
      for (const zero of digitZeros) {
        const value = digit.charCodeAt(0) - zero.charCodeAt(0);
        if (value >= 0 && value <= 9) return String(value);
      }
      return digit;
    })
    .replace(/(?<=\p{L})[-‐‑](?=\p{L})/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function alternatives(values: Iterable<string>): string {
  return [...new Set(values)]
    .sort((a, b) => b.length - a.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

function terms(...lists: string[]): string {
  return `(?:${alternatives(lists.flatMap((list) => normalize(list).split("|")))})`;
}

function whole(pattern: string, flags = "u"): RegExp {
  return new RegExp(`${start}(?:${pattern})${end}`, flags);
}

const compoundTens: Partial<Record<TranscriptLocale, string>> = {
  "kn-IN": "ಇಪ್ಪತ್ತ ಮೂವತ್ತ ನಲವತ್ತ ಐವತ್ತ ಅರವತ್ತ ಎಪ್ಪತ್ತ ಎಂಬತ್ತ ತೊಂಬತ್ತ",
  "ta-IN": "இருபத்து முப்பத்து நாற்பத்து ஐம்பத்து அறுபத்து எழுபத்து எண்பத்து தொண்ணூற்று",
  "ml-IN": "ഇരുപത്തി മുപ്പത്തി നാൽപ്പത്തി അമ്പത്തി അറുപത്തി എഴുപത്തി എൺപത്തി തൊണ്ണൂറ്റി",
};

const extraNumberWords: Partial<Record<TranscriptLocale, Record<number, string>>> = {
  "hi-IN": { 5: "पांच", 6: "छः|छ:", 9: "नऊ", 15: "पन्द्रह", 39: "उनतालीस|उनतालिस", 89: "नवासी", 99: "निन्यानवे" },
  "kn-IN": { 39: "ಮೂವತ್ತೊಂಬತ್ತು|ಮೂವತ್ತು ಒಂಬತ್ತು", 89: "ಎಂಬತ್ತೊಂಬತ್ತು|ಎಂಬತ್ತು ಒಂಬತ್ತು", 99: "ತೊಂಬತ್ತೊಂಬತ್ತು" },
  "ta-IN": { 39: "முப்பத்தொன்பது|முப்பத்து ஒன்பது", 89: "எண்பத்தொன்பது|எண்பத்து ஒன்பது", 110: "நூற்றுப்பத்து", 139: "நூற்று முப்பத்தொன்பது", 140: "நூற்று நாற்பது", 160: "நூற்று அறுபது" },
  "te-IN": { 39: "ముప్పై తొమ్మిది|ముప్పైతొమ్మిది", 89: "ఎనభై తొమ్మిది|ఎనభైతొమ్మిది", 99: "తొంభై తొమ్మిది" },
  "ml-IN": { 40: "നാൽപ്പത്", 39: "മുപ്പത്തൊമ്പത്|മുപ്പത്തി ഒമ്പത്", 89: "എൺപത്തൊമ്പത്|എൺപത്തി ഒമ്പത്" },
  "gu-IN": { 39: "ઓગણચાલીસ", 89: "નેવ્યાસી", 99: "નવ્વાણું" },
  "mr-IN": { 39: "एकोणचाळीस", 89: "एकोणनव्वद", 99: "नव्याण्णव" },
  "bn-IN": { 39: "ঊনচল্লিশ|উনচল্লিশ", 89: "ঊননব্বই|উননব্বই", 99: "নিরানব্বই" },
  "or-IN": { 39: "ଅଣଚାଳିଶ|ଊଣଚାଳିଶ", 89: "ଅଣାନବେ|ଊଣନବେ", 99: "ଅନେଶତ" },
  "pa-IN": { 1: "ਇਕ", 39: "ਉਣਤਾਲੀ", 89: "ਉਣਾਨਵੇਂ", 99: "ਨੜਿੰਨਵੇਂ" },
};

function numberWords(locale: TranscriptLocale): Map<string, string> {
  const { numbers, tens, hundred } = transcriptLanguages[locale];
  const units = normalize(numbers).split(" ");
  const values = new Map<string, number>(units.map((word, value) => [word, value]));

  normalize(tens).split(" ").forEach((ten, index) => {
    const value = 20 + index * 10;
    values.set(ten, value);
    units.slice(1, 10).forEach((unit, offset) => {
      values.set(`${ten} ${unit}`, value + offset + 1);
      if (locale === "te-IN") values.set(`${ten}${unit}`, value + offset + 1);
    });
  });

  const compounds = compoundTens[locale];
  if (compounds) {
    compounds.split(" ").forEach((stem, index) => {
      for (const [offset, unit] of units.slice(1, 10).entries()) {
        const value = 21 + index * 10 + offset;
        values.set(`${stem} ${unit}`, value);
        values.set(`${stem}${unit}`, value);
      }
    });
  }

  const irregular = irregularCardinals[locale];
  if (irregular) {
    normalize(irregular).split(" ").forEach((phrase, index) => values.set(phrase, index + 20));
  }

  for (const [value, aliases] of Object.entries(extraNumberWords[locale] ?? {})) {
    for (const alias of normalize(aliases).split("|")) values.set(alias, Number(value));
  }

  const underHundred = [...values].filter(([, value]) => value > 0 && value < 100);
  for (const stem of normalize(hundred).split("|")) {
    for (const prefix of [stem, `${units[1]} ${stem}`, `${units[2]} ${stem}`]) {
      const base = prefix.startsWith(`${units[2]} `) ? 200 : 100;
      values.set(prefix, base);
      for (const [suffix, value] of underHundred) {
        values.set(`${prefix} ${suffix}`, base + value);
        if (locale === "en-IN") values.set(`${prefix} and ${suffix}`, base + value);
        if (["kn-IN", "ta-IN", "te-IN", "ml-IN"].includes(locale)) {
          values.set(`${prefix}${suffix}`, base + value);
        }
      }
    }
  }
  return new Map([...values].map(([phrase, value]) => [phrase, String(value)]));
}

const numeralParsers = new Map<TranscriptLocale, {
  words: Map<string, string>;
  pattern: RegExp;
}>();

function normalizeNumbers(text: string, locale: TranscriptLocale): string {
  let parser = numeralParsers.get(locale);
  if (!parser) {
    const words = new Map([...numberWords("en-IN"), ...numberWords(locale)]);
    parser = { words, pattern: whole(alternatives(words.keys()), "gu") };
    numeralParsers.set(locale, parser);
  }
  const { words, pattern } = parser;
  return text.replace(pattern, (match) => words.get(match) ?? match);
}

function uniqueReading<T>(readings: T[]): T | undefined {
  return readings.length > 0 && readings.every((value) => value === readings[0])
    ? readings[0]
    : undefined;
}

/** Extract recognized observations. Missing or conflicting readings are omitted. */
export function extractVitals(transcript: string, locale: TranscriptLocale = "en-IN"): ExtractedVitals {
  const language = transcriptLanguages[locale];
  const english = transcriptLanguages["en-IN"];
  const text = normalize(transcript);
  const numeric = normalizeNumbers(text, locale);
  const bp = terms(language.bp, english.bp);
  const separator = terms(language.separator, english.separator);
  const hemoglobin = terms(language.hb, english.hb);
  const decimal = terms(language.decimal, english.decimal);
  const labelGap = String.raw`\s*(?:[:=]\s*)?(?:(?:is|was|level|reading|है)\s+)?(?![-−])`;
  const pair = String.raw`(?<![-−\d./⁄∕])(\d{2,3})\s*(?:/|⁄|∕)\s*(\d{2,3})(?!\s*[/⁄∕]|\.\d)`;
  const spokenPair = String.raw`(?<![-−\d.])(\d{2,3})\s*${separator}\s*(\d{2,3})`;
  const explicitBp = [...numeric.matchAll(whole(`${bp}${labelGap}(?:${pair}|${spokenPair})`, "gu"))];
  const bpPairs = explicitBp.length
    ? explicitBp.map((match) => [match[1] ?? match[3], match[2] ?? match[4]])
    : [...numeric.matchAll(whole(`(?<![/⁄∕] )${pair}`, "gu"))].map((match) => [match[1], match[2]]);
  const confirmedPair = uniqueReading(bpPairs.map((reading) => reading.join("/")));
  const hbPattern = String.raw`${hemoglobin}${labelGap}(\d{1,3})(?:\s*(?:[.,٫]|${decimal})\s*(\d+(?: \d)?))?(?!\s*(?:[.,٫]\s*\d|${decimal}${end}))(?:\s*(g\s*\/\s*(?:dl|l)))?`;
  const hbReadings = [...numeric.matchAll(whole(hbPattern, "gu"))]
    .map((match) => {
      const fraction = match[2]?.replace(/ /g, "");
      const value = Number(fraction ? `${match[1]}.${fraction}` : match[1]);
      return match[3]?.replace(/ /g, "") === "g/l" ? value / 10 : value;
    });

  const result: ExtractedVitals = {};
  if (confirmedPair) {
    const [systolic, diastolic] = confirmedPair.split("/").map(Number);
    if (systolic > 0 && diastolic > 0) Object.assign(result, { systolic, diastolic });
  }
  const hb = uniqueReading(hbReadings);
  if (hb !== undefined && hb > 0) result.hemoglobin = hb;

  const clauses = transcript.split(/[.!?;,:।॥\n]+/u).map(normalize);
  const movement = terms(language.movement, english.movement);
  const statuses = ["absent", "reduced", "normal"] as const;
  const findings = new Set<FetalMovement>();
  const detected = new Set<DangerSign>();
  const cleared = new Set<DangerSign>();
  const negative = terms(language.negative, english.negative);
  const symptomTerms = signTypes.map((_, index) => terms(language.signs[index], english.signs[index]));
  const symptom = symptomTerms.join("|");
  const suffixTerms = terms(
    locale === "en-IN" ? "absent|negative" : language.negative,
    "absent|negative",
  );
  const prefixNegation = new RegExp(`${start}${negative}\\s*$`, "u");
  const suffixNegation = new RegExp(
    `^\\s*(?:(?:is|are|was|were|है|আছে)\\s+)?${suffixTerms}${end}`,
    "u",
  );
  for (const clause of clauses) {
    for (const match of clause.matchAll(whole(movement, "gu"))) {
      const before = clause.slice(0, match.index);
      const after = clause.slice(match.index + match[0].length)
        .split(whole(`${movement}|${symptom}|${bp}|${hemoglobin}|and|but`))[0];
      const status = statuses.find((value) => {
        const pattern = terms(language[value], english[value]);
        return whole(pattern).test(match[0]) ||
          new RegExp(`${start}${pattern}\\s*$`, "u").test(before) ||
          new RegExp(`^\\s*(?:(?:is|are|was|were)\\s+)?${pattern}${end}`, "u").test(after);
      });
      if (status) findings.add(status);
    }

    for (const match of clause.matchAll(whole(`(?:${symptom})`, "gu"))) {
      const index = symptomTerms.findIndex((pattern) => whole(pattern).test(match[0]));
      const before = clause.slice(0, match.index);
      const after = clause.slice(match.index + match[0].length);
      const signs = prefixNegation.test(before) || suffixNegation.test(after) ? cleared : detected;
      signs.add(signTypes[index]);
    }
  }

  const fetalMovement = statuses.find((status) => findings.has(status));
  if (fetalMovement) result.fetalMovement = fetalMovement;
  const noDangerSigns: Record<TranscriptLocale, string> = {
    "en-IN": "no danger signs|danger signs absent",
    "hi-IN": "कोई खतरे के लक्षण नहीं|खतरे के कोई संकेत नहीं",
    "kn-IN": "ಅಪಾಯದ ಲಕ್ಷಣಗಳಿಲ್ಲ|ಅಪಾಯದ ಲಕ್ಷಣಗಳು ಇಲ್ಲ",
    "ta-IN": "ஆபத்து அறிகுறிகள் இல்லை|அபாய அறிகுறிகள் இல்லை",
    "te-IN": "ప్రమాద సంకేతాలు లేవు|ప్రమాద లక్షణాలు లేవు",
    "ml-IN": "അപകട ലക്ഷണങ്ങളില്ല|അപകട ലക്ഷണങ്ങൾ ഇല്ല",
    "gu-IN": "જોખમનાં કોઈ ચિહ્નો નથી|જોખમના સંકેતો નથી",
    "mr-IN": "धोक्याची लक्षणे नाहीत|धोक्याची कोणतीही लक्षणे नाहीत",
    "bn-IN": "বিপদের লক্ষণ নেই|কোনো বিপদচিহ্ন নেই",
    "or-IN": "ବିପଦର ଲକ୍ଷଣ ନାହିଁ",
    "pa-IN": "ਖ਼ਤਰੇ ਦੇ ਕੋਈ ਲੱਛਣ ਨਹੀਂ|ਖਤਰੇ ਦੇ ਲੱਛਣ ਨਹੀਂ",
  };
  const allSignsDenied = whole(terms(noDangerSigns[locale], noDangerSigns["en-IN"])).test(text);
  if (detected.size || cleared.size === signTypes.length || allSignsDenied) {
    result.dangerSigns = signTypes.filter((sign) => detected.has(sign));
  }
  return result;
}
