// Amharic content shared between the generation script and any tooling
// that needs to know exactly what text was supposed to be spoken (e.g.
// content-verification scripts). Deliberately side-effect-free — no env
// var checks, no console output, no network — so it's safe to import
// just for the data without triggering generate-official-audio.mjs's
// own top-level guards (it exits the process if ADDIS_API_KEY is
// missing, which a verification-only script has no reason to need).

export const RAW = [
  ["ለሉሊላሌልሎ", "l", "lä"],
  ["መሙሚማሜምሞ", "m", "mä"],
  ["ረሩሪራሬርሮ", "r", "rä"],
  ["ሰሱሲሳሴስሶ", "s", "sä"],
  ["በቡቢባቤብቦ", "b", "bä"],
  ["ተቱቲታቴትቶ", "t", "tä"],
  ["ነኑኒናኔንኖ", "n", "nä"],
  ["ከኩኪካኬክኮ", "k", "kä"],
  ["ወዉዊዋዌውዎ", "w", "wä"],
  ["የዩዪያዬይዮ", "y", "yä"],
  ["ደዱዲዳዴድዶ", "d", "dä"],
  ["ገጉጊጋጌግጎ", "g", "gä"],
  ["ሀሁሂሃሄህሆ", "h", "hä"],
  ["አኡኢኣኤእኦ", "'", "ä"],
  ["ቀቁቂቃቄቅቆ", "q", "qä"],
  ["ጠጡጢጣጤጥጦ", "t'", "t'ä"],
  ["ሸሹሺሻሼሽሾ", "sh", "shä"],
  ["ቸቹቺቻቼችቾ", "ch", "chä"],
  ["ጀጁጂጃጄጅጆ", "j", "jä"],
  ["ኘኙኚኛኜኝኞ", "ny", "nyä"],
  ["ዘዙዚዛዜዝዞ", "z", "zä"],
  ["ጨጩጪጫጬጭጮ", "ch'", "ch'ä"],
  ["ፈፉፊፋፌፍፎ", "f", "fä"],
  ["ፐፑፒፓፔፕፖ", "p", "pä"],
  ["ጸጹጺጻጼጽጾ", "ts'", "ts'ä"],
  ["ዠዡዢዣዤዥዦ", "zh", "zhä"],
  ["ኸኹኺኻኼኽኾ", "kh", "khä"],
  ["ቨቩቪቫቬቭቮ", "v", "vä"],
  ["ጰጱጲጳጴጵጶ", "p'", "p'ä"],
  ["ሐሑሒሓሔሕሖ", "h", "hä"],
  ["ኀኁኂኃኄኅኆ", "h", "hä"],
  ["ሠሡሢሣሤሥሦ", "s", "sä"],
  ["ዐዑዒዓዔዕዖ", "'", "ä"],
  ["ፀፁፂፃፄፅፆ", "ts'", "ts'ä"],
];

export const ANCHORS = [
  "ልጅ", "መኪና", "ራስ", "ሰላም", "ቤት", "ተማሪ", "ነጭ", "ከተማ", "ወተት", "የት",
  "ደህና", "ገንዘብ", "ሀገር", "አባት", "ቀን", "ጠዋት", "ሽሮ", "ችግር", "ጀበና", "ነኝ",
  "ዘጠኝ", "ጨረቃ", "ፈረስ", "ፖሊስ", "ጸሎት", "ዥዋዥዌ", "መኸር", "ቪዛ", "ጳጳስ", "መጽሐፍ",
  "ኃይል", "ሥራ", "ዓይን", "ፀሐይ",
];

export const PHRASES = [
  "ሰላም", "ጤና ይስጥልኝ", "እንደምን አደርክ", "እንደምን አደርሽ", "ደህና ነኝ",
  "ስምህ ማን ነው", "ስምሽ ማን ነው", "አመሰግናለሁ", "ይቅርታ", "እባክህ",
  "ደህና ሁን", "አይገባኝም", "ስንት ነው", "ውሃ እፈልጋለሁ",
];

// indices into PHRASES: genuine questions get "?" not "።"
export const QUESTION_PHRASES = new Set([2, 3, 5, 6, 12]);

// The exact text Addis AI was asked to generate for row family `famIdx`
// — one natural recitation of the row (e.g. "ለ፣ ሉ፣ ሊ፣ ላ፣ ሌ፣ ል፣ ሎ።"), the
// same string generate-official-audio.mjs's job-building loop produces.
export function rowText(famIdx) {
  return Array.from(RAW[famIdx][0]).join("፣ ") + "።";
}

export function anchorText(i) {
  return `${ANCHORS[i]}።`;
}

export function phraseText(i) {
  return `${PHRASES[i]}${QUESTION_PHRASES.has(i) ? "?" : "።"}`;
}
