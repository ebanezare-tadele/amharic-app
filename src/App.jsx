import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  generateSyncCode, getSavedSyncCode, saveSyncCode, pullBundle, pushBundle, gatherBundle, applyBundle,
  getCompareCodes, saveCompareCodes, pullCompareStats,
} from "./lib/progressSync.js";
import { WORD_FAM, officialAudioUrl, officialKeyFromFilename } from "./audio.js";
import { onInstallPromptAvailable, isStandalone, isIOSDevice } from "./lib/installPrompt.js";
import { applyTodayPatch, emptyToday, questsForDay, rollStreak, MAX_FREEZES } from "./lib/gamification.js";

/* ============================================================
   THE FIDEL (ፊደል)
   34 consonant families x 7 vowel orders.
   Romanization: a = "sofa", u = "boot", i = "see", aa = "father",
   e = "cafe", (bare) = silent/very short, o = "go"
   ============================================================ */

const ORDERS = [
  { n: 1, am: "ግዕዝ", v: "ä", hint: "the base shape — everything else is this plus a mark", say: "like the a in sofa" },
  { n: 2, am: "ካዕብ", v: "u", hint: "short stroke off the right side, at mid-height", say: "like oo in boot" },
  { n: 3, am: "ሣልስ", v: "i", hint: "stroke off the right side, down near the foot", say: "like ee in see" },
  { n: 4, am: "ራብዕ", v: "a", hint: "right leg stretches down and out", say: "like a in father" },
  { n: 5, am: "ኃምስ", v: "e", hint: "a small ring hangs off the bottom right", say: "like e in cafe" },
  { n: 6, am: "ሳድስ", v: "ə", hint: "the irregular one — the shape usually squats or bends in", say: "silent, or a tiny grunt" },
  { n: 7, am: "ሳብዕ", v: "o", hint: "stroke high on the right, or the right side lifts", say: "like o in go" },
];

// [chars, consonant, display name, optional note]. Exported (along
// with ANCHORS/PHRASES below) only so content-sync.test.js can catch
// this and scripts/content.mjs ever drifting apart -- see that test
// for why both exist rather than one importing the other.
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
  ["አኡኢኣኤእኦ", "'", "ä", "A plain vowel — no consonant in front of it."],
  ["ቀቁቂቃቄቅቆ", "q", "qä", "Deep in the throat, further back than k."],
  ["ጠጡጢጣጤጥጦ", "t'", "t'ä", "Ejective: pop the t with a burst of air held in the throat."],
  ["ሸሹሺሻሼሽሾ", "sh", "shä"],
  ["ቸቹቺቻቼችቾ", "ch", "chä"],
  ["ጀጁጂጃጄጅጆ", "j", "jä"],
  ["ኘኙኚኛኜኝኞ", "ny", "nyä", "Like the ñ in señor."],
  ["ዘዙዚዛዜዝዞ", "z", "zä"],
  ["ጨጩጪጫጬጭጮ", "ch'", "ch'ä", "Ejective ch."],
  ["ፈፉፊፋፌፍፎ", "f", "fä"],
  ["ፐፑፒፓፔፕፖ", "p", "pä", "Mostly in borrowed words."],
  ["ጸጹጺጻጼጽጾ", "ts'", "ts'ä", "Ejective ts."],
  ["ዠዡዢዣዤዥዦ", "zh", "zhä", "Like the s in measure."],
  ["ኸኹኺኻኼኽኾ", "kh", "khä", "Softer k, breathed out."],
  ["ቨቩቪቫቬቭቮ", "v", "vä", "Only in borrowed words."],
  ["ጰጱጲጳጴጵጶ", "p'", "p'ä", "Ejective p. Rare."],
  ["ሐሑሒሓሔሕሖ", "h", "hä", "Sounds identical to ሀ today. Kept apart in spelling only — in Ge'ez this was a tighter, pharyngeal sound, closer to the h in Arabic ح."],
  ["ኀኁኂኃኄኅኆ", "h", "hä", "A third h. Same sound as ሀ and ሐ today — in Ge'ez this one was pronounced further back, closer to the ch in German Bach."],
  ["ሠሡሢሣሤሥሦ", "s", "sä", "Sounds identical to ሰ. Spelling-only distinction — in Ge'ez it likely carried a distinct hissing sound, somewhere between s and sh, since merged away."],
  ["ዐዑዒዓዔዕዖ", "'", "ä", "Sounds identical to አ. In Ge'ez this was a voiced pharyngeal sound with no real English equivalent, close to Arabic ع — leveled down to the same glottal stop as አ."],
  ["ፀፁፂፃፄፅፆ", "ts'", "ts'ä", "Sounds identical to ጸ. Ge'ez may have told these two ejectives apart too, though exactly how is less settled than the other silent twins."],
];

const FAMS = RAW.map(([chars, cons, name, note], i) => ({
  id: i,
  cons,
  name,
  note: note || null,
  chars: Array.from(chars),
  rom: ORDERS.map((o) => {
    if (cons === "'") return o.v;
    return cons + (o.n === 6 ? "" : o.v);
  }),
}));

const CHAR_MAP = {};
FAMS.forEach((f) => f.chars.forEach((c, o) => (CHAR_MAP[c] = { fam: f.id, order: o })));

const UNITS = [
  { n: 1, title: "First four", fams: [0, 1, 2, 3], blurb: "The workhorses. ለ መ ረ ሰ show up in almost every sentence." },
  { n: 2, title: "Hard stops", fams: [4, 5, 6, 7], blurb: "በ ተ ነ ከ. Now you can read real words." },
  { n: 3, title: "Open sounds", fams: [8, 9, 10, 11], blurb: "ወ የ ደ ገ round out the common set." },
  { n: 4, title: "Throat & breath", fams: [12, 13, 14, 15], blurb: "ሀ አ ቀ ጠ. Two of these live further back in the throat than anything in English." },
  { n: 5, title: "Hushed", fams: [16, 17, 18, 19], blurb: "ሸ ቸ ጀ ኘ. The sh / ch / j / ny group." },
  { n: 6, title: "Buzz & pop", fams: [20, 21, 22, 23], blurb: "ዘ ጨ ፈ ፐ." },
  { n: 7, title: "The rare ones", fams: [24, 25, 26, 27, 28], blurb: "ጸ ዠ ኸ ቨ ጰ. Uncommon, but you'll hit them." },
  { n: 8, title: "The silent twins", fams: [29, 30, 31, 32, 33], blurb: "Five letters that sound exactly like ones you know. Amharic kept the old Ge'ez spellings. You learn these by word, not by ear." },
];

/* ============================================================
   VOCABULARY — every word is checked against unlocked letters
   ============================================================ */

const WORDS = [
  ["ሰላም", "selam", "peace / hello"],
  ["ስም", "sim", "name"],
  ["ሰው", "sew", "person"],
  ["ልብ", "lib", "heart"],
  ["በር", "ber", "door"],
  ["ቤት", "bet", "house"],
  ["ውሻ", "wusha", "dog"],
  ["ውሃ", "wuha", "water"],
  ["ወተት", "wetet", "milk"],
  ["ቡና", "buna", "coffee"],
  ["ዳቦ", "dabo", "bread"],
  ["ስጋ", "siga", "meat"],
  ["ወንበር", "wenber", "chair"],
  ["መኪና", "mekina", "car"],
  ["ከተማ", "ketema", "city"],
  ["ሀገር", "hager", "country"],
  ["እናት", "enat", "mother"],
  ["አባት", "abat", "father"],
  ["ልጅ", "lij", "child"],
  ["ወንድም", "wendim", "brother"],
  ["እህት", "ehit", "sister"],
  ["ቤተሰብ", "beteseb", "family"],
  ["ወዳጅ", "wedaj", "friend"],
  ["ራስ", "ras", "head"],
  ["እጅ", "ej", "hand"],
  ["ዓይን", "ayn", "eye"],
  ["ቀን", "qen", "day"],
  ["ሌሊት", "lelit", "night"],
  ["ጠዋት", "tewat", "morning"],
  ["ማታ", "mata", "evening"],
  ["ጊዜ", "gize", "time"],
  ["ገንዘብ", "genzeb", "money"],
  ["ሥራ", "sira", "work"],
  ["መጽሐፍ", "metsihaf", "book"],
  ["ተማሪ", "temari", "student"],
  ["መምህር", "memhir", "teacher"],
  ["ትምህርት", "timhirt", "school / education"],
  ["ፀሐይ", "tsehay", "sun"],
  ["ጨረቃ", "chereqa", "moon"],
  ["ኮከብ", "kokeb", "star"],
  ["ወርቅ", "werq", "gold"],
  ["አዲስ", "addis", "new"],
  ["ትልቅ", "tiliq", "big"],
  ["ትንሽ", "tinish", "small"],
  ["ጥሩ", "tiru", "good"],
  ["መልካም", "melkam", "pleasant"],
  ["ደህና", "dehna", "well / fine"],
  ["አዎ", "awo", "yes"],
  ["እሺ", "eshi", "okay"],
  ["ምን", "min", "what"],
  ["ማን", "man", "who"],
  ["የት", "yet", "where"],
  ["መቼ", "meche", "when"],
  ["ስንት", "sint", "how many"],
  ["እንጀራ", "injera", "injera"],
  ["ድመት", "dimet", "cat"],
  ["አንድ", "and", "one"],
  ["ሁለት", "hulet", "two"],
  ["ሦስት", "sost", "three"],
  ["አራት", "arat", "four"],
  ["አምስት", "amist", "five"],
  ["ስድስት", "sidist", "six"],
  ["ሰባት", "sebat", "seven"],
  ["ስምንት", "simint", "eight"],
  ["ዘጠኝ", "zeteñ", "nine"],
  ["አሥር", "asir", "ten"],
];

// The recording system (Voice, below) is keyed by (fam, order) — a real
// consonant family id (0-33) plus a vowel order (0-6). Words aren't
// either of those, but the storage layer never actually validates that
// fam is a real family — it's just a string key. So words reuse the
// exact same storage unchanged, filed under pseudo-family ids safely
// outside the real 0-33 range: "order" is then just the word's index in
// its own list (ANCHORS or PHRASES).
// officialAudioUrl/officialKeyFromFilename/WORD_FAM live in src/audio.js
// (imported above) so they're unit-testable without pulling in React —
// see src/audio.test.js. Verified with ffprobe duration + ffmpeg
// silence-gap checks (no speech-recognition model involved — see the
// comment atop generate-official-audio.mjs for why); not every
// letter/word/phrase necessarily has one — only what actually passed
// verification ships — so the app checks manifest.json rather than
// assuming a file exists (see the manifest fetch in AmharicFidel).

export const PHRASES = [
  ["ሰላም", "selam", "Hello. Literally: peace."],
  ["ጤና ይስጥልኝ", "tena yistiliñ", "Hello, formal. Literally: may he give you health."],
  ["እንደምን አደርክ", "endemin aderk", "Good morning — to a man."],
  ["እንደምን አደርሽ", "endemin adersh", "Good morning — to a woman."],
  ["ደህና ነኝ", "dehna neñ", "I'm fine."],
  ["ስምህ ማን ነው", "simih man new", "What's your name? — to a man."],
  ["ስምሽ ማን ነው", "simish man new", "What's your name? — to a woman."],
  ["አመሰግናለሁ", "ameseginalehu", "Thank you."],
  ["ይቅርታ", "yiqirta", "Sorry / excuse me."],
  ["እባክህ", "ebakih", "Please — to a man."],
  ["ደህና ሁን", "dehna hun", "Goodbye — to a man."],
  ["አይገባኝም", "aygebañim", "I don't understand."],
  ["ስንት ነው", "sint new", "How much is it?"],
  ["ውሃ እፈልጋለሁ", "wuha efelgalehu", "I want water."],
];

/* ============================================================
   TRACK B — BASES FIRST
   Learn all 34 order-1 shapes, then sweep one vowel column at a
   time across every letter. That's when the mark itself becomes
   visible: you watch the same change happen 34 times in a row.
   ============================================================ */

// one real word per family — how it gets anchored when taught aloud
export const ANCHORS = [
  ["ልጅ", "lij", "child"],
  ["መኪና", "mekina", "car"],
  ["ራስ", "ras", "head"],
  ["ሰላም", "selam", "peace"],
  ["ቤት", "bet", "house"],
  ["ተማሪ", "temari", "student"],
  ["ነጭ", "nech", "white"],
  ["ከተማ", "ketema", "city"],
  ["ወተት", "wetet", "milk"],
  ["የት", "yet", "where"],
  ["ደህና", "dehna", "well"],
  ["ገንዘብ", "genzeb", "money"],
  ["ሀገር", "hager", "country"],
  ["አባት", "abat", "father"],
  ["ቀን", "qen", "day"],
  ["ጠዋት", "tewat", "morning"],
  ["ሽሮ", "shiro", "shiro"],
  ["ችግር", "chigir", "problem"],
  ["ጀበና", "jebena", "coffee pot"],
  ["ነኝ", "neñ", "I am"],
  ["ዘጠኝ", "zeteñ", "nine"],
  ["ጨረቃ", "chereqa", "moon"],
  ["ፈረስ", "feres", "horse"],
  ["ፖሊስ", "polis", "police"],
  ["ጸሎት", "tselot", "prayer"],
  ["ዥዋዥዌ", "zhwazhwé", "swing"],
  ["መኸር", "mekher", "harvest"],
  ["ቪዛ", "viza", "visa"],
  ["ጳጳስ", "papas", "bishop"],
  ["መጽሐፍ", "metsihaf", "book"],
  ["ኃይል", "hayl", "strength"],
  ["ሥራ", "sira", "work"],
  ["ዓይን", "ayn", "eye"],
  ["ፀሐይ", "tsehay", "sun"],
];

const BASE_BATCHES = [
  { id: "b1", fams: [0, 1, 2, 3, 4, 5], title: "ለ መ ረ ሰ በ ተ", blurb: "The six you'll see most. Get these cold." },
  { id: "b2", fams: [6, 7, 8, 9, 10, 11], title: "ነ ከ ወ የ ደ ገ", blurb: "Twelve down. Most short words are already within reach." },
  { id: "b3", fams: [12, 13, 14, 15, 16, 17], title: "ሀ አ ቀ ጠ ሸ ቸ", blurb: "ቀ and ጠ sit further back in the throat than anything in English." },
  { id: "b4", fams: [18, 19, 20, 21, 22, 23], title: "ጀ ኘ ዘ ጨ ፈ ፐ", blurb: "Half of these are shapes you've half-seen already." },
  { id: "b5", fams: [24, 25, 26, 27, 28], title: "ጸ ዠ ኸ ቨ ጰ", blurb: "The uncommon five. Recognize them, don't sweat them." },
  { id: "b6", fams: [29, 30, 31, 32, 33], title: "ሐ ኀ ሠ ዐ ፀ", blurb: "The silent twins. Each sounds exactly like a letter you already know — Amharic kept the old Ge'ez spellings. These are learned by word, not by ear." },
];

const ARTIC = {
  13: "A glottal stop in front of the vowel — the catch in the middle of \"uh-oh.\"",
  14: "Back of the tongue against the soft palate, further back than an English k, with a small catch behind it. A k you swallow.",
  15: "Ejective. Lock your throat, build pressure behind the t, release it with a pop. The air comes from your mouth, not your lungs.",
  19: "The ñ in señor.",
  21: "Ejective ch — same throat lock as ጠ.",
  24: "Ejective ts — throat locked, released sharp.",
  26: "A k with the closure loosened so breath keeps escaping. Close to the ch in Scottish loch, softer.",
  28: "Ejective p. Rare enough that recognizing it is most of the job.",
  32: "Same glottal catch as አ.",
  33: "Ejective ts, identical to ጸ.",
};

const MARKS = {
  1: "A short horizontal stroke juts off the right side, about halfway up.",
  2: "A stroke off the right side too, but low — down near the foot.",
  3: "The right leg stretches down and out. On many letters the whole shape widens.",
  4: "A small ring or hook hangs off the bottom right.",
  5: "No single rule. Usually the right leg bends inward or the letter squats. This is the column you memorize case by case.",
  6: "A stroke high on the right, or the right side lifts up.",
};

// taught in order of regularity — the irregular ə column comes last
const SWEEP_SEQ = [1, 2, 3, 4, 6, 5];

const SWEEPS = SWEEP_SEQ.flatMap((o) => [
  { id: `s${o}a`, order: o, part: "A", fams: Array.from({ length: 17 }, (_, i) => i) },
  { id: `s${o}b`, order: o, part: "B", fams: Array.from({ length: 17 }, (_, i) => i + 17) },
]).map((s) => ({ ...s, title: `The ${ORDERS[s.order].v} column`, blurb: MARKS[s.order] }));

/* ---- more vocabulary, weighted toward home and table ---- */
const EXTRA_WORDS = [
  ["እናቴ", "enaté", "my mother"],
  ["አባቴ", "abaté", "my father"],
  ["ልጄ", "lijé", "my child"],
  ["አያት", "ayat", "grandparent"],
  ["አክስት", "akist", "aunt"],
  ["አጎት", "agot", "uncle"],
  ["ጀበና", "jebena", "coffee pot"],
  ["ሲኒ", "sini", "small cup"],
  ["እጣን", "etan", "incense"],
  ["ቆሎ", "qolo", "roasted grain"],
  ["ሽሮ", "shiro", "shiro"],
  ["ወጥ", "wet", "stew"],
  ["ዶሮ", "doro", "chicken"],
  ["በርበሬ", "berberé", "berbere"],
  ["ቅቤ", "qibé", "butter"],
  ["እንቁላል", "enqulal", "egg"],
  ["ሽንኩርት", "shinkurt", "onion"],
  ["ጨው", "chew", "salt"],
  ["ሻይ", "shay", "tea"],
  ["ቀይ", "qey", "red"],
  ["ጥቁር", "tiqur", "black"],
  ["ነጭ", "nech", "white"],
  ["ቢጫ", "bicha", "yellow"],
  ["ሰማያዊ", "semayawi", "blue"],
  ["ላም", "lam", "cow"],
  ["ፈረስ", "feres", "horse"],
  ["ወፍ", "wef", "bird"],
  ["አንበሳ", "anbesa", "lion"],
  ["ዓሳ", "asa", "fish"],
  ["እግር", "egir", "leg"],
  ["አፍ", "af", "mouth"],
  ["ጆሮ", "joro", "ear"],
  ["ጥርስ", "tirs", "tooth"],
  ["አልጋ", "alga", "bed"],
  ["መስኮት", "meskot", "window"],
  ["ጠረጴዛ", "terepéza", "table"],
  ["መስቀል", "mesqel", "cross"],
  ["ጸሎት", "tselot", "prayer"],
  ["መዝሙር", "mezmur", "hymn"],
  ["አማርኛ", "amariña", "Amharic"],
  ["ኢትዮጵያ", "Ityop'iya", "Ethiopia"],
  ["ፖሊስ", "polis", "police"],
  ["ችግር", "chigir", "problem"],
];

/* ---- reading material, by where you'd actually meet it ---- */
const CATS = [
  ["family", "Family"],
  ["street", "Street & menu"],
  ["church", "Church"],
  ["news", "News"],
];

const SENTENCES = [
  // ---- family / messages ----
  { c: "family", w: [["ስሜ", "simé", "my name"], ["ዳዊት", "Dawit", "David"], ["ነው።", "new", "is"]] },
  { c: "family", w: [["እኔ", "ené", "I"], ["ተማሪ", "temari", "a student"], ["ነኝ።", "neñ", "am"]] },
  { c: "family", w: [["እንዴት", "endet", "how"], ["ነህ?", "neh", "are you — to a man"]] },
  { c: "family", w: [["ደህና", "dehna", "well"], ["ነኝ።", "neñ", "I am"]] },
  { c: "family", w: [["ልጄ", "lijé", "my child"], ["ትንሽ", "tinish", "small"], ["ነው።", "new", "is"]] },
  { c: "family", w: [["ልጆቹ", "lijochu", "the children"], ["ደህና", "dehna", "well"], ["ናቸው።", "nachew", "are"]] },
  { c: "family", w: [["ደውልልኝ።", "dewililiñ", "call me"]] },
  { c: "family", w: [["ነገ", "nege", "tomorrow"], ["እደውላለሁ።", "edewilalehu", "I'll call"]] },
  { c: "family", w: [["ናፍቀኸኛል።", "nafqehéñal", "I miss you — to a man"]] },
  { c: "family", w: [["ቤት", "bet", "home"], ["ደረስኩ።", "dereskhu", "I arrived"]] },
  { c: "family", w: [["መልካም", "melkam", "happy"], ["ልደት።", "lidet", "birthday"]] },
  { c: "family", w: [["እናቴ", "enaté", "my mother"], ["ቡና", "buna", "coffee"], ["ታፈላለች።", "tafelalech", "she brews"]] },
  { c: "family", w: [["አባቴ", "abaté", "my father"], ["ቤት", "bet", "house"], ["ውስጥ", "wist", "inside"], ["ነው።", "new", "is"]] },
  { c: "family", w: [["ሁለት", "hulet", "two"], ["ወንድሞች", "wendimoch", "brothers"], ["አሉኝ።", "aluñ", "I have"]] },
  { c: "family", w: [["ልጄ", "lijé", "my child"], ["አማርኛ", "amariña", "Amharic"], ["ይማራል።", "yimaral", "is learning"]] },

  // ---- signs, shops, menus ----
  { c: "street", w: [["መግቢያ", "megbiya", "entrance"]] },
  { c: "street", w: [["መውጫ", "mewcha", "exit"]] },
  { c: "street", w: [["ክፍት", "kift", "open"], ["ነው።", "new", "it is"]] },
  { c: "street", w: [["ዝግ", "zig", "closed"], ["ነው።", "new", "it is"]] },
  { c: "street", w: [["ሽንት", "shint", "toilet"], ["ቤት", "bet", "room"]] },
  { c: "street", w: [["ባንክ", "bank", "bank"]] },
  { c: "street", w: [["ሆስፒታል", "hospital", "hospital"]] },
  { c: "street", w: [["ፖሊስ", "polis", "police"], ["ጣቢያ", "tabiya", "station"]] },
  { c: "street", w: [["ዋጋ", "waga", "price"]] },
  { c: "street", w: [["ስንት", "sint", "how much"], ["ነው?", "new", "is it"]] },
  { c: "street", w: [["ቁርስ", "qurs", "breakfast"], ["ምሳ", "misa", "lunch"], ["እራት", "erat", "dinner"]] },
  { c: "street", w: [["ጾም", "tsom", "fasting — the menu section without meat"]] },
  { c: "street", w: [["ዶሮ", "doro", "chicken"], ["ወጥ", "wet", "stew"]] },
  { c: "street", w: [["ጥብስ", "tibs", "tibs"]] },
  { c: "street", w: [["ክትፎ", "kitfo", "kitfo"]] },
  { c: "street", w: [["በየአይነቱ", "beyeaynetu", "combination platter"]] },
  { c: "street", w: [["አዲስ", "Addis", "Addis"], ["አበባ", "Abeba", "Abeba"]] },
  { c: "street", w: [["መስቀል", "Mesqel", "Mesqel"], ["አደባባይ", "Adebabay", "Square"]] },
  { c: "street", w: [["ቦሌ", "Bolé", "Bole"]] },
  { c: "street", w: [["መገናኛ", "Megenaña", "Megenagna"]] },
  { c: "street", w: [["ፒያሳ", "Piyasa", "Piassa"]] },

  // ---- church ----
  { c: "church", w: [["አሜን።", "amén", "amen"]] },
  { c: "church", w: [["ቅዱስ", "qidus", "holy"], ["ቅዱስ", "qidus", "holy"], ["ቅዱስ።", "qidus", "holy"]] },
  { c: "church", w: [["ጌታ", "géta", "Lord"], ["ሆይ", "hoy", "O"], ["ማረን።", "maren", "have mercy on us"]] },
  { c: "church", w: [["እግዚአብሔር", "Egziabhér", "God"], ["ይመስገን።", "yimesgen", "be praised"]] },
  { c: "church", w: [["አባታችን", "abatachin", "our Father"], ["ሆይ።", "hoy", "O"]] },
  { c: "church", w: [["ድንግል", "dingil", "Virgin"], ["ማርያም።", "Maryam", "Mary"]] },
  { c: "church", w: [["በስመ", "besme", "in the name of"], ["አብ", "Ab", "the Father"], ["ወወልድ", "we-Weld", "and the Son"], ["ወመንፈስ", "we-Menfes", "and the Spirit"], ["ቅዱስ።", "Qidus", "Holy"]] },
  { c: "church", w: [["ገና", "Gena", "Christmas"]] },
  { c: "church", w: [["ጥምቀት", "Timqet", "Epiphany"]] },
  { c: "church", w: [["ትንሣኤ", "Tinsaé", "Resurrection"]] },
  { c: "church", w: [["መዝሙር", "mezmur", "hymn"]] },

  // ---- news ----
  { c: "news", w: [["ዜና", "zéna", "news"]] },
  { c: "news", w: [["አዲስ", "addis", "breaking"], ["ዜና።", "zéna", "news"]] },
  { c: "news", w: [["ትናንት", "tinant", "yesterday"]] },
  { c: "news", w: [["ኢትዮጵያ", "Ityop'iya", "Ethiopia"]] },
  { c: "news", w: [["መንግሥት", "mengist", "government"]] },
  { c: "news", w: [["ሕዝብ", "hizb", "the people"]] },
  { c: "news", w: [["ጤና", "téna", "health"]] },
  { c: "news", w: [["ትምህርት", "timhirt", "education"]] },
  { c: "news", w: [["ስፖርት", "siport", "sport"]] },
  { c: "news", w: [["ኢኮኖሚ", "ikonomi", "economy"]] },
  { c: "news", w: [["ወሬ", "weré", "word going around"]] },
];

// [glyph, value, romanized reading] — the reading is the plain Amharic
// number word, the same way FAMS' "rom" gives each letter a reading.
const GEEZ_NUM = [
  ["፩", 1, "and"], ["፪", 2, "hulet"], ["፫", 3, "sost"], ["፬", 4, "arat"], ["፭", 5, "amist"],
  ["፮", 6, "sidist"], ["፯", 7, "sebat"], ["፰", 8, "simint"], ["፱", 9, "zeteñ"], ["፲", 10, "asir"],
  ["፳", 20, "haya"], ["፴", 30, "selasa"], ["፵", 40, "arba"], ["፶", 50, "hamsa"],
  ["፷", 60, "silsa"], ["፸", 70, "seba"], ["፹", 80, "semanya"], ["፺", 90, "zetena"],
  ["፻", 100, "meto"],
];

/* ============================================================
   HELPERS
   ============================================================ */

const key = (f, o) => `${f}.${o}`;
const INTERVALS = [0, 1, 2, 4, 9, 20, 45]; // days
const DAY = 86400000;

function shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

function pick(arr, n) {
  return shuffle(arr).slice(0, n);
}

function allWords() {
  return WORDS.concat(typeof EXTRA_WORDS !== "undefined" ? EXTRA_WORDS : []);
}

function wordsFor(unlockedChars) {
  return allWords().filter((w) => Array.from(w[0]).every((c) => unlockedChars.has(c)));
}

const emptyState = () => ({
  xp: 0,
  startDate: null,
  cards: {},
  unitsDone: [],
  basesDone: [],
  sweepsDone: [],
  streakDays: 0,
  streakFreezes: 0,
  lastDay: null,
  bestSpeed: 0,
  seenIntro: [],
  today: null,
});

function loadState() {
  return new Promise(async (resolve) => {
    try {
      const r = await window.storage.get("fidel:v1");
      resolve(r && r.value ? { ...emptyState(), ...JSON.parse(r.value) } : emptyState());
    } catch (e) {
      resolve(emptyState());
    }
  });
}

let saveTimer = null;
let pendingSave = null;

// Set by AmharicFidel on mount so a save failure (quota exceeded, storage
// unavailable) actually reaches the user instead of vanishing — this
// function lives outside any component (called from a plain timer and
// from the pagehide/visibilitychange handlers below), so it has no
// state setter of its own to call.
let notifySaveFailure = () => {};

function flushSave() {
  if (!pendingSave) return;
  const p = pendingSave;
  pendingSave = null;
  clearTimeout(saveTimer);
  saveTimer = null;
  window.storage.set("fidel:v1", JSON.stringify(p)).catch(() => notifySaveFailure());
}

// `now` is passed for anything you'd be upset to lose: a finished lesson,
// a setting, a new best. Everything else can wait a beat.
function saveState(s, now) {
  pendingSave = s;
  if (now) return flushSave();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 250);
}

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/* ============================================================
   LOOK
   Palette + type come from Ethiopian manuscript practice:
   lamp-black ink, bone parchment, and rubric red — the second
   ink reserved for the thing being pointed at.
   ============================================================ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=IBM+Plex+Sans:wght@400;500;600;700&family=Noto+Serif+Ethiopic:wght@400;500;700&display=swap');

.fd {
  --ink: #10162A;
  --ink2: #19203A;
  --ink3: #262F4F;
  --line: #2E3859;
  --bone: #EDE3CE;
  --dim: #8C93AE;
  --rubric: #CE452C;
  --verd: #4F9A76;
  --gold: #D9A93C;
  --fidel: 'Noto Serif Ethiopic','Kefa','Noto Sans Ethiopic','Abyssinica SIL','Nyala',serif;
  --disp: 'Instrument Serif','Iowan Old Style',Georgia,serif;
  --ui: 'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;
  background: var(--ink);
  color: var(--bone);
  font-family: var(--ui);
  min-height: 100vh; /* fallback for browsers without dvh support */
  min-height: 100dvh; /* actual visible viewport -- 100vh assumes the tallest
  possible viewport (as if the browser's own URL bar were hidden), so on
  iOS Safari with the URL bar showing, 100vh is taller than what's really
  on screen. That's exactly what pushed content below the fold requiring
  a scroll to reach action buttons that should already be visible. */
  padding-top: env(safe-area-inset-top); /* the bottom inset was already
  handled (.verdict, .tabs) but the top one never was -- a real gap: in
  any fullscreen/standalone-ish display mode, content can render straight
  under the notch/Dynamic Island with nothing reserving that space. Costs
  nothing in a normal browser tab (the browser's own chrome already
  reserves this, so the env() value is just 0 there). */
  display: flex;
  flex-direction: column;
  -webkit-font-smoothing: antialiased;
}
.fd * { box-sizing: border-box; }
.fd button { font-family: inherit; cursor: pointer; border: none; background: none; color: inherit; }
.fd button:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }

.wrap { width: 100%; max-width: 540px; margin: 0 auto; padding: 0 16px; }
.grow { flex: 1; }
/* Screens with a sticky .verdict action bar (Trace, Reader, Lesson, ...) use
   a two-level structure: an outer <div className="grow"> so the screen fills
   the scrollable region, holding a content <div className="wrap"> followed by
   the sticky bar. The content div should NOT also carry "grow" -- that was a
   real bug (App.jsx history): flex:1 on the inner div force-stretched it to
   fill the outer container even when actual content was short (a single
   canvas, a single sentence), pushing the sticky bar's natural position below
   the fold and forcing a scroll to reach action buttons that should already
   be on screen. Content should size to itself; only the outer wrapper grows. */

/* On an actual desktop monitor, a bare 540px column centered in a flat
   dark field reads as an unstyled mobile app dropped into a browser tab
   -- not broken, just accidental-looking. Two modest, low-risk changes
   fix that without a real desktop redesign (a split-panel layout isn't
   the right call for a single-focus, one-thing-at-a-time app like this
   one): a little more breathing room in the column itself, and a soft
   glow behind it so the side margins look like a choice, not an oversight. */
@media (min-width: 900px) {
  .wrap { max-width: 620px; }
  .fd {
    background:
      radial-gradient(ellipse 1000px 620px at 50% 0%, rgba(206,69,44,0.06), transparent 65%),
      var(--ink);
  }
}

/* ---- eyebrow labels: colophon voice ---- */
.eyebrow {
  font-size: 10px; letter-spacing: .18em; text-transform: uppercase;
  color: var(--dim); font-weight: 600;
}
.disp { font-family: var(--disp); font-weight: 400; letter-spacing: -.01em; }
.gz { font-family: var(--fidel); }

/* ---- top bar ---- */
.top {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px 10px; border-bottom: 1px solid var(--line);
  position: sticky; top: 0; background: var(--ink); z-index: 20;
}
.mark { font-family: var(--fidel); font-size: 22px; color: var(--rubric); line-height: 1; }
.xpbar { flex: 1; height: 5px; background: var(--ink3); border-radius: 3px; overflow: hidden; }
.xpfill { height: 100%; background: var(--gold); transition: width .5s cubic-bezier(.2,.8,.2,1); }
.chip { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--dim); }
.chip b { color: var(--bone); }
.combo { font-size: 12px; font-weight: 700; color: var(--gold); animation: ink .3s cubic-bezier(.2,.9,.3,1); }

/* ---- THE SIGNATURE: rubric row ---- */
.rubric {
  display: flex; justify-content: center; gap: 2px;
  padding: 14px 0 12px;
}
.rcell {
  font-family: var(--fidel); font-size: 21px; line-height: 1;
  width: 34px; height: 40px; display: flex; align-items: center; justify-content: center;
  color: #4C5473; transition: color .25s, transform .25s;
  border-bottom: 2px solid transparent; padding-bottom: 4px;
}
.rcell.on { color: var(--rubric); border-bottom-color: var(--rubric); transform: scale(1.18); }
.rcell.known { color: var(--dim); }
.rord { text-align: center; font-size: 10px; letter-spacing: .14em; color: var(--dim); text-transform: uppercase; }

/* ---- the big glyph ---- */
.stage { text-align: center; padding: 8px 0 4px; }
.glyph {
  font-family: var(--fidel); font-size: 108px; line-height: 1.15;
  color: var(--bone); display: inline-block;
}
.glyph.set { animation: ink .45s cubic-bezier(.2,.9,.3,1); color: var(--verd); }
.glyph.miss { animation: shake .4s; }
@keyframes ink { 0%{transform:scale(1)} 35%{transform:scale(1.13)} 100%{transform:scale(1)} }
@keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 45%{transform:translateX(7px)} 70%{transform:translateX(-4px)} }
.prompt-rom { font-family: var(--disp); font-size: 60px; line-height: 1.1; }

.ask { text-align: center; font-size: 13px; color: var(--dim); margin: 2px 0 18px; }

/* ---- answers ---- */
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.opt {
  background: var(--ink2); border: 1px solid var(--line); border-radius: 14px;
  padding: 18px 8px; font-size: 20px; font-weight: 500; text-align: center;
  transition: transform .12s, background .18s, border-color .18s;
  min-height: 62px; display: flex; align-items: center; justify-content: center;
}
.opt:active { transform: scale(.97); }
.opt.gz { font-size: 34px; padding: 12px 8px; }
.opt.amh { font-family: var(--fidel); font-size: 20px; padding: 16px 6px; }
.opt.gzw { font-family: var(--fidel); font-size: 23px; padding: 15px 6px; }
.opt.right { background: rgba(79,154,118,.18); border-color: var(--verd); color: #8FD9B4; }
.opt.wrong { background: rgba(206,69,44,.14); border-color: var(--rubric); color: #F09A86; }
.opt.fade { opacity: .35; }
.opt[disabled] { cursor: default; }

/* ---- verdict bar ---- */
.verdict {
  /* margin-top: auto is the actual fix for the dead-space complaint --
     its parent is a flex column (className="grow") that still stretches
     to fill the scrollable region even when content is short (removing
     that stretch entirely broke long-content screens). auto margin uses
     any leftover space to push .verdict itself down to the container's
     bottom edge, flush above the tab bar, with no gap either above or
     below it and no scroll needed. position:sticky still does its normal
     job once real content is tall enough to need scrolling -- auto
     margins and sticky don't conflict, since sticky only affects the
     element once its static (in-flow) position would scroll out of view. */
  margin-top: auto;
  position: sticky; bottom: 0; padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--line); background: var(--ink2);
}
.verdict.ok { background: rgba(79,154,118,.13); border-top-color: var(--verd); }
.verdict.no { background: rgba(206,69,44,.11); border-top-color: var(--rubric); }
.vtitle { font-weight: 700; font-size: 15px; margin-bottom: 3px; }
.vsub { font-size: 13px; color: var(--dim); line-height: 1.45; }

.btn {
  width: 100%; padding: 15px; border-radius: 13px; font-weight: 700; font-size: 15px;
  background: var(--bone); color: var(--ink); transition: transform .12s, opacity .2s;
}
.btn:active { transform: scale(.98); }
.btn.ghost { background: transparent; border: 1px solid var(--line); color: var(--bone); }
.btn.rub { background: var(--rubric); color: #fff; }
.btn:disabled { opacity: .35; }

/* ---- cards / units ---- */
.card {
  background: var(--ink2); border: 1px solid var(--line); border-radius: 16px;
  padding: 16px; margin-bottom: 10px; width: 100%; text-align: left; display: block;
  transition: border-color .2s, transform .12s;
}
.card:active { transform: scale(.99); }
.card.locked { opacity: .42; }
.card.done { border-color: rgba(79,154,118,.5); }
.card-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.card-fidel { font-family: var(--fidel); font-size: 26px; color: var(--rubric); letter-spacing: 4px; }
.card-title { font-family: var(--disp); font-size: 21px; }
.card-blurb { font-size: 13px; color: var(--dim); line-height: 1.5; }
.meter { height: 3px; background: var(--ink3); border-radius: 2px; margin-top: 12px; overflow: hidden; }
.meter i { display: block; height: 100%; background: var(--verd); }

/* ---- chart ---- */
.chart { overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 8px; }
.cc {
  font-family: var(--fidel); font-size: 19px; width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center; border-radius: 8px;
  color: #4C5473;
}
.cc.l1 { color: var(--dim); }
.cc.l2 { color: var(--bone); }
.cc.l3 { color: var(--bone); background: rgba(217,169,60,.14); }
.cc.l4 { color: var(--gold); background: rgba(217,169,60,.2); }

/* ---- tabs ---- */
.tabs {
  display: flex; border-top: 1px solid var(--line); background: var(--ink);
  padding-bottom: env(safe-area-inset-bottom); position: sticky; bottom: 0; z-index: 20;
}
.tab { flex: 1; padding: 11px 4px 12px; text-align: center; color: #5B6485; }
.tab .tg { font-family: var(--fidel); font-size: 19px; line-height: 1.2; display: block; }
.tab .tl { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; font-weight: 600; }
.tab.on { color: var(--rubric); }

/* ---- misc ---- */
.rule { height: 1px; background: var(--line); margin: 18px 0; }
.tile {
  background: var(--ink2); border: 1px solid var(--line); border-radius: 11px;
  padding: 12px 14px; font-family: var(--fidel); font-size: 28px; line-height: 1;
  transition: transform .12s, opacity .2s;
}
.tile:active { transform: scale(.95); }
.tile.used { opacity: .2; }
.slot {
  min-width: 46px; height: 54px; border-bottom: 2px solid var(--line);
  display: inline-flex; align-items: center; justify-content: center;
  font-family: var(--fidel); font-size: 30px; margin: 0 3px;
}
.slot.filled { border-bottom-color: var(--rubric); }
.row-sp { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.stat { text-align: center; flex: 1; }
.stat b { display: block; font-family: var(--disp); font-size: 30px; line-height: 1.1; }
.stat span { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); }
.pill { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 600; background: var(--ink3); color: var(--dim); }
.note { font-size: 12.5px; color: var(--dim); line-height: 1.55; }
.speaker { border: 1px solid var(--line); border-radius: 20px; padding: 6px 14px; font-size: 12px; color: var(--dim); }

.padwrap {
  position: relative; width: 100%; max-width: 320px; margin: 0 auto;
  aspect-ratio: 1; border: 1px solid var(--line); border-radius: 16px;
  background: var(--ink2); overflow: hidden;
}
.padwrap canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
.padwrap .guide { position: absolute; inset: 0; pointer-events: none; }
.padwrap .guide i {
  position: absolute; background: var(--line); opacity: .5;
}
.chantcell {
  font-family: var(--fidel); font-size: 22px; width: 38px; height: 44px;
  display: flex; align-items: center; justify-content: center; color: #4C5473;
  border-radius: 8px; transition: all .12s linear;
}
.chantcell.on { color: var(--rubric); background: rgba(206,69,44,.12); transform: scale(1.2); }

@media (prefers-reduced-motion: reduce) {
  .fd *, .fd *::before { animation: none !important; transition: none !important; }
}
`;

/* ============================================================
   PIECES
   ============================================================ */

function RubricRow({ fam, active, cards }) {
  return (
    <div>
      <div className="rubric">
        {fam.chars.map((c, i) => {
          const lv = (cards[key(fam.id, i)] || {}).lvl || 0;
          return (
            <div key={i} className={"rcell" + (i === active ? " on" : lv > 0 ? " known" : "")}>
              {c}
            </div>
          );
        })}
      </div>
      <div className="rord">{active != null ? `${ORDERS[active].am} · order ${active + 1}` : "\u00A0"}</div>
    </div>
  );
}

/* ============================================================
   QUESTION ENGINE
   ============================================================ */

const ALL = FAMS.flatMap((f) => f.chars.map((_, o) => ({ fam: f.id, order: o })));

const famOf = (ch) => (CHAR_MAP[ch] ? CHAR_MAP[ch].fam : -1);
const usesFam = (word, f) => Array.from(word).some((c) => famOf(c) === f);

function makeQ(target, pool, kinds) {
  const { fam, order } = target;
  const F = FAMS[fam];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const src = pool.length > 6 ? pool : ALL;

  if (kind === "orderName") {
    const wrong = pick(ORDERS.filter((o, i) => i !== order), 3);
    return {
      kind: "orderName", fam, order,
      ask: "የትኛው ደረጃ ነው?",
      askSub: "Which order is it standing in?",
      correct: ORDERS[order].am,
      options: shuffle([ORDERS[order].am, ...wrong.map((o) => o.am)]),
      gz: false,
      why: `${F.chars[order]} — ${ORDERS[order].am}, order ${order + 1}. ${MARKS[order] || ""}`,
    };
  }

  if (kind === "match") {
    const others = FAMS.filter((f) => f.id !== fam);
    const same = pick(others, 1)[0];
    const wrongs = pick(others.filter((f) => f.id !== same.id), 3).map((f) => {
      const o = pick([0, 1, 2, 3, 4, 5, 6].filter((x) => x !== order), 1)[0];
      return f.chars[o];
    });
    const correct = same.chars[order];
    return {
      kind: "match", fam, order,
      ask: "ተመሳሳይ ድምፅ",
      askSub: "Same vowel, different letter — which one?",
      correct,
      options: shuffle([correct, ...wrongs.filter((w) => w !== correct).slice(0, 3)]),
      gz: true,
      why: `Both ${F.chars[order]} and ${correct} sit in ${ORDERS[order].am}, order ${order + 1}.`,
    };
  }

  if (kind === "anchor" || kind === "anchor2") {
    const mine = ANCHORS[fam];
    if (mine && mine[0]) {
      const pool2 = FAMS.map((f) => ANCHORS[f.id])
        .filter((a, idx) => a && a[0] && idx !== fam && !usesFam(a[0], fam));
      const wrongs = pick(pool2, 3).map((a) => a[0]);
      if (wrongs.length === 3) {
        if (kind === "anchor") {
          return {
            kind: "anchor", fam, order: 0,
            ask: "የትኛው ቃል ይህን ፊደል ይይዛል?",
            askSub: "Which word uses this letter?",
            correct: mine[0],
            options: shuffle([mine[0], ...wrongs]),
            gz: true,
            why: `${mine[0]} — ${mine[2]}. It carries ${F.chars[0]}.`,
          };
        }
        const wf = pick(FAMS.filter((f) => f.id !== fam && !usesFam(mine[0], f.id)), 3);
        return {
          kind: "anchor2", fam, order: 0,
          word: mine[0],
          ask: "የትኛው ፊደል በዚህ ቃል ውስጥ አለ?",
          askSub: "Which letter is inside this word?",
          correct: F.chars[0],
          options: shuffle([F.chars[0], ...wf.map((f) => f.chars[0])]),
          gz: true,
          why: `${mine[0]} — ${mine[2]}. The letter is ${F.chars[0]}.`,
        };
      }
    }
    // no usable anchor: fall through to plain recognition
  }

  if (kind === "row") {
    const wrongOrders = pick([0, 1, 2, 3, 4, 5, 6].filter((o) => o !== order), 3);
    return {
      kind: "row", fam, order,
      ask: "Which letter fills the gap?",
      correct: F.chars[order],
      options: shuffle([F.chars[order], ...wrongOrders.map((o) => F.chars[o])]),
      gz: true,
      why: `${F.chars[order]} is order ${order + 1} (${ORDERS[order].am}) — ${ORDERS[order].hint}.`,
    };
  }

  if (kind === "transform") {
    const wrongOrders = pick([0, 1, 2, 3, 4, 5, 6].filter((o) => o !== order), 3);
    return {
      kind: "transform", fam, order,
      ask: `Put ${F.chars[0]} into ${ORDERS[order].am}`,
      correct: F.chars[order],
      options: shuffle([F.chars[order], ...wrongOrders.map((o) => F.chars[o])]),
      gz: true,
      why: `${F.chars[0]} → ${F.chars[order]}. ${MARKS[order] || ORDERS[order].hint}`,
    };
  }

  if (kind === "vowel") {
    const wrong = pick(ORDERS.filter((o, i) => i !== order), 3);
    return {
      kind: "vowel", fam, order,
      ask: "Which vowel is this carrying?",
      correct: ORDERS[order].v,
      options: shuffle([ORDERS[order].v, ...wrong.map((o) => o.v)]),
      gz: false,
      why: `${F.chars[order]} is ${F.chars[0]} plus the ${ORDERS[order].v} mark. ${MARKS[order] || ""}`,
    };
  }

  const sameFam = pool.filter((p) => p.fam === fam && p.order !== order);
  const sameOrd = pool.filter((p) => p.order === order && p.fam !== fam);
  const rest = pool.filter((p) => p.fam !== fam && p.order !== order);
  const cands = [...pick(sameFam, 1), ...pick(sameOrd, 2), ...pick(rest, 3)];

  if (kind === "f2r") {
    const correct = F.rom[order];
    const opts = [correct];
    for (const c of cands) {
      const r = FAMS[c.fam].rom[c.order];
      if (!opts.includes(r) && opts.length < 4) opts.push(r);
    }
    let g = 0;
    while (opts.length < 4 && g++ < 300) {
      const p = src[Math.floor(Math.random() * src.length)];
      const r = FAMS[p.fam].rom[p.order];
      if (!opts.includes(r)) opts.push(r);
    }
    return {
      kind: "f2r", fam, order,
      ask: "Which sound is this?",
      correct,
      options: shuffle(opts),
      gz: false,
      why:
        order === 0
          ? `${F.chars[0]} = ${correct}.${F.note ? " " + F.note : ""}`
          : `${F.chars[order]} = ${correct}. Base is ${F.chars[0]} (${F.rom[0]}) plus the ${ORDERS[order].v} mark.`,
    };
  }

  // r2f — never offer a homophone as a wrong answer
  const correctRom = F.rom[order];
  const correct = F.chars[order];
  const opts = [correct];
  for (const c of cands) {
    const ch = FAMS[c.fam].chars[c.order];
    if (FAMS[c.fam].rom[c.order] === correctRom) continue;
    if (!opts.includes(ch) && opts.length < 4) opts.push(ch);
  }
  let g2 = 0;
  while (opts.length < 4 && g2++ < 300) {
    const p = src[Math.floor(Math.random() * src.length)];
    const ch = FAMS[p.fam].chars[p.order];
    if (FAMS[p.fam].rom[p.order] !== correctRom && !opts.includes(ch)) opts.push(ch);
  }
  return {
    kind: "r2f", fam, order,
    ask: `Which letter says "${correctRom}"?`,
    correct,
    options: shuffle(opts),
    gz: true,
    why:
      order === 0
        ? `${correct} = ${correctRom}.`
        : `${correct} = ${correctRom}. ${MARKS[order] || ORDERS[order].hint}`,
  };
}

const KINDS = {
  base: ["f2r", "r2f", "f2r"],
  sweep: ["transform", "vowel", "f2r", "r2f"],
  unit: ["f2r", "r2f", "row"],
};

const kindsFor = (lessonKind) => KINDS[lessonKind] || KINDS.unit;

function buildSession(targets, pool, reviews, kinds) {
  const q = [];
  targets.forEach((t) => {
    q.push(makeQ(t, pool, kinds));
    q.push(makeQ(t, pool, kinds));
  });
  pick(reviews, targets.length ? 4 : 18).forEach((r) =>
    q.push(makeQ(r, pool, kindsFor("unit")))
  );
  return shuffle(q).slice(0, 18);
}

/* ============================================================
   LESSON — one engine, three shapes of curriculum
   ============================================================ */

function BaseIntro({ fams, i, audio, onNext, onBack }) {
  const F = FAMS[fams[i]];
  const A = ANCHORS[F.id];
  return (
    <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
      <div className="wrap" style={{ paddingTop: 18 }}>
        <div className="row-sp">
          <span className="eyebrow">Base letter {i + 1} of {fams.length}</span>
          <button onClick={onBack} style={{ color: "var(--dim)", fontSize: 18 }}>✕</button>
        </div>

        <div style={{ textAlign: "center", margin: "34px 0 10px" }}>
          <span className="gz" style={{ fontSize: 128, color: "var(--rubric)", lineHeight: 1 }}>
            {F.chars[0]}
          </span>
        </div>
        <div className="disp" style={{ fontSize: 40, textAlign: "center" }}>{F.rom[0]}</div>
        <div className="note" style={{ textAlign: "center", marginTop: 2 }}>{ORDERS[0].say}</div>
        <div style={{ textAlign: "center", marginTop: 12 }}><HearButton fam={F.id} order={0} audio={audio} /></div>

        {ARTIC[F.id] && (
          <div className="card" style={{ marginTop: 16, borderColor: "var(--gold)" }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>How to make the sound</div>
            <div className="note" style={{ color: "var(--bone)", fontSize: 13 }}>{ARTIC[F.id]}</div>
          </div>
        )}

        {audio && (
          <div style={{ marginTop: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Your voice</div>
            <Voice fam={F.id} order={0} have={audio.have.has(`${F.id}.0`)} onSaved={audio.onSaved} />
          </div>
        )}

        <div className="rule" />

        {A && A[0] ? (
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Where you'll meet it</div>
            <div className="gz" style={{ fontSize: 34 }}>{A[0]}</div>
            <div className="note"><b style={{ color: "var(--bone)" }}>{A[1]}</b> — {A[2]}</div>
            <div style={{ marginTop: 8 }}><HearButton fam={WORD_FAM.anchor} order={F.id} audio={audio} text={A[0]} /></div>
            {audio && (
              <div style={{ marginTop: 10 }}>
                <Voice
                  fam={WORD_FAM.anchor}
                  order={F.id}
                  have={audio.have.has(`${WORD_FAM.anchor}.${F.id}`)}
                  onSaved={audio.onSaved}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="note">{A ? A[2] : ""}</div>
        )}

        {F.note && (
          <div className="note" style={{ marginTop: 14, color: "var(--gold)" }}>{F.note}</div>
        )}

        <div className="rule" />
        <div className="eyebrow" style={{ marginBottom: 2 }}>The row it belongs to</div>
        <p className="note" style={{ fontSize: 11.5, marginBottom: 4 }}>
          You already have this rhythm. Chant it once so the shape gets filed under a sound you know.
          The six marks come later.
        </p>
        <Chant fam={F.id} audio={audio} compact />
      </div>
      <div className="verdict">
        <button className="btn" onClick={onNext}>
          {i === fams.length - 1 ? "Start drilling" : "Next letter"}
        </button>
      </div>
    </div>
  );
}

function SweepIntro({ order, onNext, onBack }) {
  const demo = [0, 1, 5, 7].map((f) => FAMS[f]);
  return (
    <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
      <div className="wrap" style={{ paddingTop: 18 }}>
        <div className="row-sp">
          <span className="eyebrow">{ORDERS[order].am} · order {order + 1}</span>
          <button onClick={onBack} style={{ color: "var(--dim)", fontSize: 18 }}>✕</button>
        </div>

        <div className="disp" style={{ fontSize: 34, margin: "8px 0 2px" }}>
          The <span style={{ color: "var(--rubric)" }}>{ORDERS[order].v}</span> mark
        </div>
        <div className="note" style={{ marginBottom: 18 }}>
          Sounds {ORDERS[order].say}. Same change, every letter.
        </div>

        <div className="card" style={{ borderColor: "var(--rubric)" }}>
          <div className="note" style={{ color: "var(--bone)", fontSize: 13.5 }}>{MARKS[order]}</div>
        </div>

        <div className="eyebrow" style={{ margin: "18px 0 4px" }}>Watch it happen</div>
        {demo.map((F) => (
          <div
            key={F.id}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line)" }}
          >
            <span className="gz" style={{ fontSize: 32, color: "var(--dim)", width: 44, textAlign: "center" }}>{F.chars[0]}</span>
            <span style={{ color: "var(--dim)", fontSize: 15 }}>→</span>
            <span className="gz" style={{ fontSize: 32, color: "var(--rubric)", width: 44, textAlign: "center" }}>{F.chars[order]}</span>
            <span className="note" style={{ flex: 1 }}>
              {F.rom[0]} → <b style={{ color: "var(--bone)" }}>{F.rom[order]}</b>
            </span>
          </div>
        ))}

        {order === 5 && (
          <div className="note" style={{ marginTop: 16, color: "var(--gold)" }}>
            Fair warning: this column breaks its own rule more than any other. Treat these as 34 small
            shapes to memorize rather than one mark to apply.
          </div>
        )}
      </div>
      <div className="verdict">
        <button className="btn" onClick={onNext}>Start drilling</button>
      </div>
    </div>
  );
}

function FamilyIntro({ fams, i, audio, onNext, onBack }) {
  const F = FAMS[fams[i]];
  return (
    <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
      <div className="wrap" style={{ paddingTop: 18 }}>
        <div className="row-sp">
          <span className="eyebrow">New row {i + 1} of {fams.length}</span>
          <button onClick={onBack} style={{ color: "var(--dim)", fontSize: 18 }}>✕</button>
        </div>
        <div className="disp" style={{ fontSize: 26, margin: "6px 0 2px" }}>
          The <span style={{ color: "var(--rubric)" }}>{F.cons === "'" ? "vowel" : F.cons}</span> row
        </div>
        <p className="note" style={{ marginTop: 4 }}>
          {F.note || "One shape, seven vowels. Learn the shape once, then learn the seven marks."}
        </p>
        <div style={{ textAlign: "center", margin: "20px 0 6px" }}>
          <span className="gz" style={{ fontSize: 76, color: "var(--rubric)" }}>{F.chars[0]}</span>
        </div>
        <div style={{ textAlign: "center", marginBottom: 18 }}><HearButton fam={F.id} order={0} audio={audio} /></div>
        {ORDERS.map((o, k) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 0", borderTop: "1px solid var(--line)" }}>
            <span className="gz" style={{ fontSize: 30, width: 42, textAlign: "center" }}>{F.chars[k]}</span>
            <span style={{ width: 52, fontWeight: 600, fontSize: 15 }}>{F.rom[k]}</span>
            <span className="note" style={{ flex: 1, fontSize: 11.5 }}>{o.hint}</span>
          </div>
        ))}
      </div>
      <div className="verdict">
        <button className="btn" onClick={onNext}>
          {i === fams.length - 1 ? "Start drilling" : "Next row"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   HEAR BUTTON
   The single "hear it" affordance used everywhere in the app —
   letters, anchor words, phrases, and post-answer drill review.
   Priority: your own recording, then a real official clip if the
   generation pipeline actually produced and verified one for
   this exact letter/word (see officialAudioUrl and the manifest
   fetch in AmharicFidel — nothing plays unless it's actually
   listed there), then the device's own Amharic voice, else this
   hides rather than play something that was never verified.
   Earlier baked-in clips asked the TTS model to read one isolated
   glyph with no sentence context, which turned out to hallucinate
   into unrelated full-sentence audio often enough (~1 in 5) that
   it couldn't be trusted; the current pipeline never asks for
   that — see the comment atop scripts/generate-official-audio.mjs
   for how it avoids it (whole rows recited naturally, then sliced
   using real speech-recognition timestamps) and verifies every
   clip against what was actually said before it ships. Drill
   questions themselves never get this button — only the review
   screen after you've already answered, since most question kinds
   ask "what does this sound like," and playing the sound first
   would hand over the answer.
   ============================================================ */

function HearButton({ fam, order, audio, text }) {
  const [voice, setVoice] = useState(null);
  useEffect(() => {
    const find = () => {
      try {
        const v = window.speechSynthesis.getVoices().find((x) => /^am/i.test(x.lang));
        if (v) setVoice(v);
      } catch (e) {}
    };
    find();
    try {
      window.speechSynthesis.onvoiceschanged = find;
    } catch (e) {}
  }, []);

  const key = `${fam}.${order}`;
  const have = audio && audio.have.has(key);
  const haveOfficial = audio && audio.official && audio.official.has(key);
  if (!have && !haveOfficial && !voice) return null;

  const speak = () => {
    const t = text || (FAMS[fam] ? FAMS[fam].chars[order] : "");
    if (!voice || !t) return;
    const u = new SpeechSynthesisUtterance(t);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
  };

  const play = async () => {
    if (have) {
      const recorded = await getClip(fam, order);
      if (recorded) {
        try {
          await new Audio(recorded).play();
          return;
        } catch (e) {}
      }
    }
    if (haveOfficial) {
      try {
        await new Audio(officialAudioUrl(fam, order)).play();
        return;
      } catch (e) {}
    }
    speak();
  };

  return (
    <button className="speaker" onClick={play}>
      ► hear it
    </button>
  );
}

function Lesson({ spec, state, pool, audio, onDone, onExit }) {
  const { kind, fams, orders } = spec;
  const isReview = kind === "review";
  const needsIntro = !isReview && !spec.skipIntro;
  const bank = useRef(pool);
  const [phase, setPhase] = useState(needsIntro ? "intro" : "drill");
  const [introI, setIntroI] = useState(0);
  const [qi, setQi] = useState(0);
  const [queue, setQueue] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [got, setGot] = useState(0);
  const [missed, setMissed] = useState(0);
  const [combo, setCombo] = useState(0);
  const results = useRef([]);

  const qkinds = kindsFor(kind === "review" ? "unit" : kind);

  const startDrills = useCallback(() => {
    const targets = [];
    fams.forEach((f) => orders.forEach((o) => targets.push({ fam: f, order: o })));
    const reviews = pool.filter(
      (p) => !targets.some((t) => t.fam === p.fam && t.order === p.order)
    );
    const b = targets.length ? [...pool, ...targets] : pool;
    bank.current = b;
    setQueue(buildSession(pick(targets, 9), b, reviews, qkinds));
    setPhase("drill");
  }, []);

  useEffect(() => {
    if (!needsIntro) startDrills();
  }, []);

  if (phase === "intro") {
    const next = () => {
      const pages = kind === "sweep" ? 1 : fams.length;
      if (introI >= pages - 1) startDrills();
      else setIntroI(introI + 1);
    };
    if (kind === "sweep") return <SweepIntro order={orders[0]} onNext={next} onBack={onExit} />;
    if (kind === "base") return <BaseIntro fams={fams} i={introI} audio={audio} onNext={next} onBack={onExit} />;
    return <FamilyIntro fams={fams} i={introI} audio={audio} onNext={next} onBack={onExit} />;
  }

  if (phase === "done") {
    const acc = Math.round((got / Math.max(1, got + missed)) * 100);
    const badge =
      kind === "sweep" ? FAMS[3].chars[orders[0]] : kind === "review" ? "ደግ" : FAMS[fams[0]].chars[0];
    return (
      <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
        <div className="wrap" style={{ paddingTop: 40, textAlign: "center" }}>
          <div className="gz" style={{ fontSize: 62, color: "var(--gold)" }}>{badge}</div>
          <div className="disp" style={{ fontSize: 30, marginTop: 10 }}>{spec.doneLabel}</div>
          <div className="row-sp" style={{ marginTop: 26 }}>
            <div className="stat"><b>{got * 10}</b><span>xp</span></div>
            <div className="stat"><b>{acc}%</b><span>accuracy</span></div>
            <div className="stat"><b>{fams.length * orders.length || results.current.length}</b><span>letters</span></div>
          </div>
        </div>
        <div className="verdict">
          <button className="btn" onClick={() => onDone(results.current, got * 10)}>Done</button>
        </div>
      </div>
    );
  }

  const q = queue[qi];
  if (!q)
    return (
      <div className="wrap" style={{ paddingTop: 60, textAlign: "center" }}>
        <span className="gz" style={{ fontSize: 34, color: "var(--rubric)" }}>ፊ</span>
      </div>
    );

  const F = FAMS[q.fam];
  const answered = chosen !== null;
  const right = answered && chosen === q.correct;

  const answer = (opt) => {
    if (answered) return;
    setChosen(opt);
    const ok = opt === q.correct;
    results.current.push({ fam: q.fam, order: q.order, ok });
    if (ok) {
      setGot(got + 1);
      setCombo(combo + 1);
    } else {
      setMissed(missed + 1);
      setCombo(0);
      const again = makeQ({ fam: q.fam, order: q.order }, bank.current, qkinds);
      const nq = queue.slice();
      nq.splice(Math.min(qi + 3, nq.length), 0, again);
      setQueue(nq);
    }
  };

  const next = () => {
    setChosen(null);
    if (qi + 1 >= queue.length) setPhase("done");
    else setQi(qi + 1);
  };

  const showRubric = answered;

  return (
    <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
      <div className="wrap">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
          <button onClick={onExit} style={{ color: "var(--dim)", fontSize: 20, lineHeight: 1 }}>✕</button>
          <div className="xpbar">
            <div className="xpfill" style={{ width: `${(qi / queue.length) * 100}%` }} />
          </div>
          <span className="chip"><b>{qi + 1}</b>/{queue.length}</span>
          {combo >= 2 && (
            <span className="combo" key={combo}>🔥 {combo}</span>
          )}
        </div>

        {showRubric ? (
          <RubricRow fam={F} active={q.order} cards={state.cards} />
        ) : (
          <div style={{ height: 78 }} />
        )}

        <div className="stage">
          {(q.kind === "f2r" || q.kind === "vowel" || q.kind === "orderName" || q.kind === "match" || q.kind === "anchor") && (
            <span className={"glyph" + (answered ? (right ? " set" : " miss") : "")}>
              {q.kind === "anchor" ? F.chars[0] : F.chars[q.order]}
            </span>
          )}
          {q.kind === "anchor2" && (
            <span className={"glyph" + (answered ? (right ? " set" : " miss") : "")} style={{ fontSize: 62 }}>
              {q.word}
            </span>
          )}
          {q.kind === "r2f" && <div className="prompt-rom">{F.rom[q.order]}</div>}
          {q.kind === "transform" && (
            <div style={{ padding: "16px 0 4px" }}>
              <span className="gz" style={{ fontSize: 76, color: "var(--dim)" }}>{F.chars[0]}</span>
              <span className="disp" style={{ fontSize: 34, margin: "0 14px", color: "var(--dim)" }}>+</span>
              <span className="disp" style={{ fontSize: 52, color: "var(--rubric)" }}>
                {ORDERS[q.order].v}
              </span>
            </div>
          )}
          {q.kind === "row" && (
            <div style={{ fontSize: 0, padding: "18px 0 6px" }}>
              {F.chars.map((c, i) => (
                <span key={i} className="gz" style={{
                  fontSize: 30, padding: "0 5px",
                  color: i === q.order ? "var(--rubric)" : "var(--dim)",
                  borderBottom: i === q.order ? "2px solid var(--rubric)" : "none",
                }}>
                  {i === q.order ? (answered && right ? c : "?") : c}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="ask">
          <span className={q.askSub ? "gz" : ""} style={q.askSub ? { fontSize: 19, color: "var(--bone)" } : undefined}>
            {q.ask}
          </span>
          {q.askSub && <div style={{ marginTop: 3 }}>{q.askSub}</div>}
        </div>

        <div className="grid2">
          {q.options.map((o) => {
            let cls = "opt";
            if (q.kind === "orderName") cls += " amh";
            else if (q.kind === "anchor") cls += " gzw";
            else if (q.gz) cls += " gz";
            if (answered) {
              if (o === q.correct) cls += " right";
              else if (o === chosen) cls += " wrong";
              else cls += " fade";
            }
            return (
              <button key={o} className={cls} disabled={answered} onClick={() => answer(o)}>{o}</button>
            );
          })}
        </div>
      </div>

      {answered ? (
        <div className={"verdict " + (right ? "ok" : "no")}>
          <div className="vtitle" style={{ color: right ? "var(--verd)" : "var(--rubric)" }}>
            {right ? "Correct" : "Not this one"}
          </div>
          <div className="vsub" style={{ marginBottom: 12 }}>{q.why}</div>
          <div style={{ marginBottom: 12 }}>
            <HearButton fam={q.fam} order={q.order} audio={audio} />
          </div>
          <button className="btn" onClick={next}>Continue</button>
        </div>
      ) : (
        <div className="verdict">
          <div className="vsub">
            {["vowel", "orderName", "match"].includes(q.kind)
              ? "Look at the right side of the letter. That's where the mark lives."
              : kind === "base"
              ? "Bare consonant — no vowel mark yet."
              : `Order ${q.order + 1} · ${ORDERS[q.order].say}`}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   WORD BUILDER
   ============================================================ */

function WordBuild({ pool, unlockedChars, onXp }) {
  const bank = useMemo(() => wordsFor(unlockedChars), [unlockedChars]);
  const [i, setI] = useState(0);
  const [slots, setSlots] = useState([]);
  const [used, setUsed] = useState([]);
  const [state, setState] = useState("go");

  const w = bank[i % Math.max(1, bank.length)];

  const tiles = useMemo(() => {
    if (!w) return [];
    const need = Array.from(w[0]);
    const decoys = pick(pool, 3)
      .map((p) => FAMS[p.fam].chars[p.order])
      .filter((c) => !need.includes(c))
      .slice(0, 2);
    return shuffle([...need, ...decoys]);
  }, [w, i]);

  useEffect(() => {
    setSlots([]);
    setUsed([]);
    setState("go");
  }, [i]);

  if (!w) {
    return (
      <div className="wrap" style={{ paddingTop: 40, textAlign: "center" }}>
        <div className="gz" style={{ fontSize: 46, color: "var(--dim)" }}>፨</div>
        <p className="note" style={{ marginTop: 12 }}>
          No readable words yet. Finish unit 1 and a few will unlock — you can only be given words made
          entirely of letters you've met.
        </p>
      </div>
    );
  }

  const target = Array.from(w[0]);

  const tapTile = (idx) => {
    if (state !== "go" || slots.length >= target.length) return;
    const ns = [...slots, tiles[idx]];
    const nu = [...used, idx];
    setSlots(ns);
    setUsed(nu);
    if (ns.length === target.length) {
      const ok = ns.join("") === w[0];
      setState(ok ? "won" : "lost");
      if (ok) onXp(15);
    }
  };

  const undo = () => {
    if (state !== "go") return;
    setSlots(slots.slice(0, -1));
    setUsed(used.slice(0, -1));
  };

  return (
    <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
      <div className="wrap" style={{ paddingTop: 20 }}>
        <div className="eyebrow">Spell it out</div>
        <div className="disp" style={{ fontSize: 34, margin: "4px 0 2px" }}>
          {w[2]}
        </div>
        <div className="note" style={{ marginBottom: 24 }}>
          sounds like <b style={{ color: "var(--bone)" }}>{w[1]}</b> · {target.length} letters
        </div>

        <div style={{ textAlign: "center", minHeight: 60, marginBottom: 26 }}>
          {target.map((_, n) => (
            <span key={n} className={"slot" + (slots[n] ? " filled" : "")}>
              {slots[n] || ""}
            </span>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 9, justifyContent: "center" }}>
          {tiles.map((t, idx) => (
            <button
              key={idx}
              className={"tile" + (used.includes(idx) ? " used" : "")}
              disabled={used.includes(idx) || state !== "go"}
              onClick={() => tapTile(idx)}
            >
              {t}
            </button>
          ))}
        </div>

        {state === "go" && slots.length > 0 && (
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button className="speaker" onClick={undo}>
              ← undo
            </button>
          </div>
        )}
      </div>

      {state !== "go" && (
        <div className={"verdict " + (state === "won" ? "ok" : "no")}>
          <div className="vtitle" style={{ color: state === "won" ? "var(--verd)" : "var(--rubric)" }}>
            {state === "won" ? "That's it" : "Not quite"}
          </div>
          <div className="vsub" style={{ marginBottom: 12 }}>
            <span className="gz" style={{ fontSize: 22 }}>{w[0]}</span>
            {` · ${w[1]} · ` +
              target.map((c) => (CHAR_MAP[c] ? FAMS[CHAR_MAP[c].fam].rom[CHAR_MAP[c].order] : c)).join(" · ")}
          </div>
          <button className="btn" onClick={() => setI(i + 1)}>
            Next word
          </button>
        </div>
      )}
      {state === "go" && (
        <div className="verdict">
          <div className="vsub">Tap the letters in order, left to right.</div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SPEED ROUND
   ============================================================ */

function Speed({ pool, best, onEnd }) {
  const [t, setT] = useState(60);
  const [score, setScore] = useState(0);
  const [q, setQ] = useState(null);
  const [flash, setFlash] = useState(null);
  const [running, setRunning] = useState(false);

  const roll = useCallback(() => {
    const tgt = pool[Math.floor(Math.random() * pool.length)];
    const rom = FAMS[tgt.fam].rom[tgt.order];
    const opts = [FAMS[tgt.fam].chars[tgt.order]];
    let guard = 0;
    while (opts.length < 6 && guard++ < 200) {
      const p = pool[Math.floor(Math.random() * pool.length)];
      const ch = FAMS[p.fam].chars[p.order];
      if (FAMS[p.fam].rom[p.order] !== rom && !opts.includes(ch)) opts.push(ch);
    }
    // a thin pool (or one full of homophones) can't fill six — top up from the full fidel
    let guard2 = 0;
    while (opts.length < 6 && guard2++ < 400) {
      const p = ALL[Math.floor(Math.random() * ALL.length)];
      const ch = FAMS[p.fam].chars[p.order];
      if (FAMS[p.fam].rom[p.order] !== rom && !opts.includes(ch)) opts.push(ch);
    }
    setQ({ rom, correct: opts[0], options: shuffle(opts) });
  }, [pool]);

  useEffect(() => {
    if (!running) return;
    if (t <= 0) {
      setRunning(false);
      onEnd(score);
      return;
    }
    const id = setTimeout(() => setT(t - 1), 1000);
    return () => clearTimeout(id);
  }, [t, running]);

  if (!running && t === 60) {
    return (
      <div className="wrap" style={{ paddingTop: 50, textAlign: "center" }}>
        <div className="eyebrow">Sixty seconds</div>
        <div className="disp" style={{ fontSize: 38, margin: "8px 0 10px" }}>
          Speed round
        </div>
        <p className="note" style={{ maxWidth: 300, margin: "0 auto 6px" }}>
          A sound appears. Tap its letter. No hints, no second chances — this is the drill that turns
          recognition into reflex.
        </p>
        <p className="note" style={{ marginBottom: 28 }}>
          Best so far: <b style={{ color: "var(--gold)" }}>{best}</b>
        </p>
        <button
          className="btn rub"
          style={{ maxWidth: 260, margin: "0 auto" }}
          onClick={() => {
            roll();
            setRunning(true);
          }}
        >
          Begin
        </button>
      </div>
    );
  }

  if (!running) {
    return (
      <div className="wrap" style={{ paddingTop: 60, textAlign: "center" }}>
        <div className="disp" style={{ fontSize: 72, color: "var(--gold)" }}>{score}</div>
        <div className="eyebrow">letters in sixty seconds</div>
        <p className="note" style={{ marginTop: 16 }}>
          {score > best ? "New best." : `Best is ${best}.`}
        </p>
        <button
          className="btn ghost"
          style={{ maxWidth: 240, margin: "26px auto 0" }}
          onClick={() => {
            setT(60);
            setScore(0);
            roll();
            setRunning(true);
          }}
        >
          Run it again
        </button>
      </div>
    );
  }

  const hit = (c) => {
    if (c === q.correct) {
      setScore(score + 1);
      setFlash("ok");
    } else {
      setScore(Math.max(0, score - 1));
      setFlash("no");
    }
    setTimeout(() => setFlash(null), 160);
    roll();
  };

  return (
    <div className="wrap" style={{ paddingTop: 16 }}>
      <div className="row-sp">
        <span className="chip">
          score <b>{score}</b>
        </span>
        <span
          className="chip"
          style={{ color: t <= 10 ? "var(--rubric)" : undefined, fontSize: 15 }}
        >
          <b>{t}s</b>
        </span>
      </div>
      <div className="xpbar" style={{ marginTop: 10 }}>
        <div className="xpfill" style={{ width: `${(t / 60) * 100}%`, background: "var(--rubric)" }} />
      </div>

      <div
        className="prompt-rom"
        style={{
          textAlign: "center",
          margin: "34px 0",
          color: flash === "ok" ? "var(--verd)" : flash === "no" ? "var(--rubric)" : "var(--bone)",
        }}
      >
        {q.rom}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 }}>
        {q.options.map((c) => (
          <button key={c} className="opt gz" onClick={() => hit(c)}>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   WORD ENTRY
   One anchor word or phrase, with the same way to hear it that
   letters get (HearButton) and the same way to record one
   (Voice) — both filed under a pseudo-family id (WORD_FAM) in
   the same addressing letters use.
   ============================================================ */

function WordEntry({ text, rom, gloss, fam, order, audio }) {
  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
      <div className="gz" style={{ fontSize: 24 }}>{text}</div>
      <div className="note">
        <b style={{ color: "var(--bone)" }}>{rom}</b> — {gloss}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <HearButton fam={fam} order={order} audio={audio} text={text} />
        {audio && (
          <Voice
            fam={fam}
            order={order}
            have={audio.have.has(`${fam}.${order}`)}
            onSaved={audio.onSaved}
          />
        )}
      </div>
    </div>
  );
}

/* ============================================================
   CHART
   ============================================================ */

function Chart({ cards, unlockedFams, audio, onReset, seenIntro, onSeen, level, xp, streakDays }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [sel, setSel] = useState(null);
  // audio.have covers letters and, now, words (WORD_FAM) in the same
  // set — filtered here so the "record the sounds yourself" card still
  // counts letters specifically, not words recorded further down.
  const letterAudioCount = audio
    ? [...audio.have].filter((k) => Number(k.split(".")[0]) < WORD_FAM.anchor).length
    : 0;
  return (
    <div className="wrap" style={{ paddingTop: 18, paddingBottom: 30 }}>
      <div className="eyebrow">The whole system</div>
      <div className="disp" style={{ fontSize: 30, margin: "4px 0 6px" }}>
        ፊደል
      </div>
      <p className="note" style={{ marginBottom: 14 }}>
        Read across, not down. Every row is one consonant wearing seven vowels. Brightness shows how well
        you know each letter.
      </p>

      {audio && (
        <div className="note" style={{ marginBottom: 14, fontSize: 11.5 }}>
          Tap any letter (or an anchor word/phrase further down) to record your own or a relative's
          pronunciation — it stays on this device and is what makes its "hear it" button appear.
          {letterAudioCount > 0 && (
            <span style={{ color: "var(--verd)" }}> {letterAudioCount} letter{letterAudioCount === 1 ? "" : "s"} recorded.</span>
          )}
        </div>
      )}

      {/* Plain flex rows, not a <table> — that's what lets the detail
          panel below drop in directly under the row you tapped, as just
          another block in normal flow, instead of being pinned to the
          bottom of one giant table no matter which row you picked. */}
      <div className="chart" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex" }}>
          <div style={{ width: 44, flexShrink: 0 }} />
          {ORDERS.map((o) => (
            <div
              key={o.n}
              style={{
                width: 40, flexShrink: 0, textAlign: "center", fontSize: 9, letterSpacing: ".1em",
                color: "var(--dim)", fontWeight: 600, padding: "4px 0 8px", textTransform: "uppercase",
              }}
            >
              <span className="gz" style={{ fontSize: 10, display: "block", color: "var(--dim)" }}>{o.am}</span>
              {o.v}
            </div>
          ))}
        </div>

        {FAMS.map((f) => (
          <div key={f.id}>
            <div style={{ display: "flex", alignItems: "center", opacity: unlockedFams.has(f.id) ? 1 : 0.3 }}>
              <div style={{ fontSize: 11, color: "var(--dim)", width: 44, flexShrink: 0, fontWeight: 600 }}>
                {f.cons === "'" ? "—" : f.cons}
              </div>
              {f.chars.map((c, o) => {
                const lvl = (cards[key(f.id, o)] || {}).lvl || 0;
                const cl = lvl >= 5 ? "l4" : lvl >= 3 ? "l3" : lvl >= 1 ? "l2" : unlockedFams.has(f.id) ? "l1" : "";
                const isSel = sel && sel.f === f.id && sel.o === o;
                return (
                  <button
                    key={o}
                    className={"cc " + cl}
                    style={{ flexShrink: 0 }}
                    onClick={() => setSel(isSel ? null : { f: f.id, o })}
                  >
                    {c}
                  </button>
                );
              })}
            </div>

            {sel && sel.f === f.id && (
              <div className="card" style={{ margin: "8px 0 12px", borderColor: "var(--rubric)" }}>
                <div className="row-sp" style={{ alignItems: "flex-start" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span className="gz" style={{ fontSize: 52, color: "var(--rubric)" }}>
                      {FAMS[sel.f].chars[sel.o]}
                    </span>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 600 }}>{FAMS[sel.f].rom[sel.o]}</div>
                      <div className="note">
                        {ORDERS[sel.o].am} · order {sel.o + 1} · {ORDERS[sel.o].say}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setSel(null)} style={{ color: "var(--dim)", fontSize: 18, padding: 4 }}>
                    ✕
                  </button>
                </div>
                <div className="rule" style={{ margin: "12px 0" }} />
                <div className="note">{ORDERS[sel.o].hint}.</div>
                {FAMS[sel.f].note && (
                  <div className="note" style={{ marginTop: 6, color: "var(--gold)" }}>{FAMS[sel.f].note}</div>
                )}
                {ARTIC[sel.f] && (
                  <div className="note" style={{ marginTop: 6, color: "var(--gold)" }}>{ARTIC[sel.f]}</div>
                )}
                <div className="rule" style={{ margin: "12px 0" }} />
                <Chant fam={sel.f} audio={audio} />
                <div className="rule" style={{ margin: "12px 0" }} />
                <div className="eyebrow" style={{ marginBottom: 6 }}>Your voice</div>
                <Callout id="cb-voice" seenIntro={seenIntro} onSeen={onSeen}>
                  Record here — your voice, or a relative's — and it plays back everywhere this letter shows
                  up, ahead of the built-in clip.
                </Callout>
                {audio && (
                  <Voice
                    fam={sel.f}
                    order={sel.o}
                    have={audio.have.has(`${sel.f}.${sel.o}`)}
                    onSaved={audio.onSaved}
                  />
                )}
                <div style={{ marginTop: 8 }}>
                  <HearButton fam={sel.f} order={sel.o} audio={audio} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 8 }}>Ge'ez numerals</div>
      <p className="note" style={{ marginBottom: 10, fontSize: 11.5 }}>
        Still used on clock faces, church calendars, and chapter headings. Everyday writing uses 1 2 3.
        Likely adapted from Greek and Coptic letter-numerals — the same trick Roman numerals play with
        Latin letters. Bigger numbers just line these up left to right: 23 is ፳፫ (haya sost, "twenty
        three"), 155 is ፻፶፭ (meto hamsa amist, "one hundred fifty five").
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {GEEZ_NUM.map(([g, n, r]) => (
          <div key={n} style={{ background: "var(--ink2)", border: "1px solid var(--line)", borderRadius: 9, padding: "7px 10px", textAlign: "center", minWidth: 52 }}>
            <div className="gz" style={{ fontSize: 20 }}>{g}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--bone)" }}>{r}</div>
            <div className="note" style={{ fontSize: 10 }}>{n}</div>
          </div>
        ))}
      </div>

      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 8 }}>Punctuation</div>
      <div className="note" style={{ marginBottom: 4 }}>
        <span className="gz" style={{ fontSize: 20, color: "var(--bone)" }}>።</span>{"  "}full stop ·{" "}
        <span className="gz" style={{ fontSize: 20, color: "var(--bone)" }}>፣</span>{"  "}comma ·{" "}
        <span className="gz" style={{ fontSize: 20, color: "var(--bone)" }}>፡</span>{"  "}the old word divider, now replaced by a plain space
      </div>

      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 8 }}>Where this comes from</div>
      <div className="note" style={{ marginBottom: 6 }}>
        Ge'ez — the script every letter on this chart is built from — descended from the Ancient South
        Arabian alphabet, carried across the Red Sea into the Kingdom of Aksum, in what's now northern
        Ethiopia and Eritrea. Like its ancestor, it started as an abjad: consonants only, vowels left to
        guesswork.
      </div>
      <div className="note" style={{ marginBottom: 6 }}>
        Sometime around the 4th century, Ge'ez did something no other Semitic script had: it started
        bending each consonant into seven shapes, one per vowel, instead of leaving the vowel unwritten —
        centuries before Hebrew did the same with its own vowel points. One of the most famous early
        examples still stands: King Ezana's stone stele at Aksum, the same inscription carved three times
        over in Ge'ez, Sabaean, and Greek, announcing his conversion to Christianity. The system on this
        chart descends directly from that one.
      </div>
      <div className="note" style={{ marginBottom: 6 }}>
        There's a name for a script that works this way — abugida — and it's borrowed straight from
        Ge'ez: the first four letters in its own traditional order, አ ቡ ጊ ዳ (ə-bu-gi-da), the same way
        "alphabet" comes from the Greek alpha-beta.
      </div>
      <div className="note" style={{ marginBottom: 6 }}>
        Amharic split off from Ge'ez's spoken form by around the 13th century, keeping the script but
        bending it to different sounds — which is exactly why five letters on this chart (ሐ ኀ ሠ ዐ ፀ) spell
        distinctions Ge'ez once made and Amharic no longer does; tap any of them above for what they used
        to sound like. Ge'ez itself stopped being anyone's native language centuries ago, but never really
        left — it's still the language of the Ethiopian Orthodox Church's liturgy today.
      </div>
      <div className="note">
        Amharic didn't just inherit Ge'ez's alphabet as-is, either — it needed sounds Ge'ez's Semitic
        phonology never had, partly from contact with the Cushitic languages already spoken in the
        region. Rather than invent new shapes from nothing, scribes extended existing Ge'ez letters:
        add a stroke to ሰ (se) and it becomes ሸ (she); the same move turns ተ (te) into ቸ (che), ነ (ne)
        into ኘ (nye). That family-resemblance you can still see between rows on this chart — ስ/ሽ, ት/ች,
        ን/ኝ — is that history, not coincidence. It's how the system grew from Ge'ez's own roughly 26
        consonant shapes to the 33-34 Amharic uses today. The newest layer is more recent still: ቨ (v)
        and ፐ (p) were added specifically to spell foreign names and loanwords — sounds that don't occur
        natively in Amharic at all.
      </div>

      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 8 }}>What the script doesn't tell you</div>
      <div className="note" style={{ marginBottom: 6 }}>
        Amharic doubles consonants to change meaning, and it never writes the doubling.{" "}
        <span className="gz" style={{ fontSize: 19, color: "var(--bone)" }}>አለ</span> is
        <b style={{ color: "var(--bone)" }}> ale</b>, "he said." The same three letters with a held l are{" "}
        <b style={{ color: "var(--bone)" }}>alle</b>, "there is." Nothing on the page separates them.
      </div>
      <div className="note" style={{ marginBottom: 6 }}>
        Sixth order is the other ambiguity: it can be a bare consonant or carry a faint vowel, and the
        letter looks the same either way.
      </div>
      <div className="note">
        Both gaps close with hearing, not with reading — which is the real argument for getting a relative
        onto the record button.
      </div>

      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 4 }}>Anchor words</div>
      <p className="note" style={{ marginBottom: 4, fontSize: 11.5 }}>
        One real word per letter family — what each base shape gets anchored to the first time you meet
        it in a lesson.
      </p>
      {FAMS.map((f) => {
        const a = ANCHORS[f.id];
        if (!a || !a[0]) return null;
        return (
          <WordEntry key={f.id} text={a[0]} rom={a[1]} gloss={a[2]} fam={WORD_FAM.anchor} order={f.id} audio={audio} />
        );
      })}

      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        Phrases worth knowing
      </div>
      {PHRASES.map((p, i) => (
        <WordEntry key={p[0]} text={p[0]} rom={p[1]} gloss={p[2]} fam={WORD_FAM.phrase} order={i} audio={audio} />
      ))}

      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 8 }}>Sync across devices</div>
      <SyncPanel />

      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 8 }}>Compare progress</div>
      <ComparePanel mine={{ level, xp, streakDays, masteredCount: Object.values(cards).filter((c) => (c.lvl || 0) >= 5).length }} />

      <div className="rule" />
      <button
        className="speaker"
        style={confirmReset ? { borderColor: "var(--rubric)", color: "var(--rubric)" } : undefined}
        onClick={() => (confirmReset ? (onReset(), setConfirmReset(false)) : setConfirmReset(true))}
      >
        {confirmReset ? "tap again to erase everything" : "start over"}
      </button>
      {confirmReset && (
        <div className="note" style={{ marginTop: 6, fontSize: 11.5 }}>
          Wipes lessons, streak, and letter mastery. Recordings are kept.
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SYNC
   Optional, and off by default: personal progress and recordings
   stay purely local (see README "Persistence") unless you set up
   a code here. No account, no email — the code itself is the only
   credential, generated on-device.
   ============================================================ */

function SyncPanel() {
  const [code, setCode] = useState(() => getSavedSyncCode());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [msgIsError, setMsgIsError] = useState(false);
  const [confirmLink, setConfirmLink] = useState(false);

  const createCode = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const bundle = await gatherBundle();
      const newCode = generateSyncCode();
      await pushBundle(newCode, bundle);
      saveSyncCode(newCode);
      setCode(newCode);
      setMsgIsError(false);
      setMsg("Synced. Enter this code on your other device to bring this over.");
    } catch (e) {
      setMsgIsError(true);
      setMsg(e.message || "Couldn't sync right now.");
    }
    setBusy(false);
  };

  const linkCode = async () => {
    const typed = input.trim().toUpperCase();
    if (!typed) return;
    if (!confirmLink) {
      setConfirmLink(true);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const bundle = await pullBundle(typed);
      if (!bundle) {
        setMsgIsError(true);
        setMsg("No synced progress found for that code.");
      } else {
        await applyBundle(bundle);
        saveSyncCode(typed);
        setCode(typed);
        setInput("");
        setMsgIsError(false);
        setMsg("Linked — reloading…");
        setTimeout(() => window.location.reload(), 900);
      }
    } catch (e) {
      setMsgIsError(true);
      setMsg(e.message || "Couldn't sync right now.");
    }
    setConfirmLink(false);
    setBusy(false);
  };

  const forget = () => {
    saveSyncCode(null);
    setCode(null);
    setMsg(null);
  };

  return (
    <div>
      <p className="note" style={{ marginBottom: 10, fontSize: 11.5 }}>
        Optional, and off unless you set it up. No account, no email — a random code is the only key,
        and it's the only thing that can reach this data (see the README for how). Follow-up changes on
        a linked device sync automatically from then on.
      </p>

      {code ? (
        <div style={{ marginBottom: 12 }}>
          <div className="note" style={{ fontSize: 11 }}>This device's sync code</div>
          <div className="disp" style={{ fontSize: 22, letterSpacing: "0.06em", margin: "3px 0 8px" }}>{code}</div>
          <button className="speaker" onClick={forget}>stop syncing on this device</button>
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <button className="speaker" disabled={busy} onClick={createCode}>
            {busy ? "working…" : "create a sync code"}
          </button>
        </div>
      )}

      <div className="rule" style={{ margin: "12px 0" }} />
      <div className="note" style={{ fontSize: 11, marginBottom: 6 }}>Have a code from another device?</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setConfirmLink(false); }}
          onKeyDown={(e) => e.key === "Enter" && linkCode()}
          placeholder="enter code"
          style={{
            flex: 1, minWidth: 140, background: "var(--ink)", border: "1px solid var(--line)",
            borderRadius: 20, padding: "6px 14px", color: "var(--bone)", fontSize: 12,
          }}
        />
        <button
          className="speaker"
          style={confirmLink ? { borderColor: "var(--rubric)", color: "var(--rubric)" } : undefined}
          disabled={busy || !input.trim()}
          onClick={linkCode}
        >
          {confirmLink ? "tap again to replace this device's progress" : "load this code"}
        </button>
      </div>

      {msg && (
        <div className="note" style={{ marginTop: 8, color: msgIsError ? "var(--rubric)" : "var(--verd)", fontSize: 11.5 }}>
          {msg}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   COMPARE
   Entirely separate from this device's own sync code (SyncPanel
   above) — this only ever reads someone else's aggregate stats via
   pullCompareStats (get_compare_stats, a dedicated read-only RPC),
   never their full bundle and never applyBundle, so watching a code
   can't pull their recordings or raw progress map, let alone touch
   anyone's actual progress, yours or theirs. Off by default; nothing
   here is visible until a code is added. See
   getCompareCodes/saveCompareCodes in lib/progressSync.js.
   ============================================================ */

function statsFromCompareResult(result) {
  if (!result) return null;
  return {
    level: Math.floor((result.xp || 0) / 250) + 1,
    xp: result.xp || 0,
    streakDays: result.streakDays || 0,
    masteredCount: result.masteredCount || 0,
  };
}

function CompareRow({ label, stats }) {
  return (
    <div className="row-sp" style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
      <span className="note" style={{ fontSize: 12.5, color: "var(--bone)" }}>{label}</span>
      {stats.error ? (
        <span className="note" style={{ fontSize: 11, color: "var(--rubric)" }}>{stats.error}</span>
      ) : (
        <span className="note" style={{ fontSize: 11.5 }}>
          lv <b style={{ color: "var(--bone)" }}>{stats.level}</b> · {stats.masteredCount} mastered ·{" "}
          {stats.streakDays}d streak
        </span>
      )}
    </div>
  );
}

function ComparePanel({ mine }) {
  const [codes, setCodes] = useState(() => getCompareCodes());
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState({});
  const [busy, setBusy] = useState(false);

  const refresh = async (list) => {
    setBusy(true);
    const next = {};
    for (const code of list) {
      try {
        const result = await pullCompareStats(code);
        const stats = statsFromCompareResult(result);
        next[code] = stats || { error: "No synced progress found for that code." };
      } catch (e) {
        next[code] = { error: e.message || "Couldn't reach the server." };
      }
    }
    setEntries(next);
    setBusy(false);
  };

  useEffect(() => {
    if (codes.length) refresh(codes);
  }, []);

  const addCode = async () => {
    const typed = input.trim().toUpperCase();
    if (!typed || codes.includes(typed)) return;
    const next = [...codes, typed];
    setCodes(next);
    saveCompareCodes(next);
    setInput("");
    await refresh(next);
  };

  const removeCode = (code) => {
    const next = codes.filter((c) => c !== code);
    setCodes(next);
    saveCompareCodes(next);
    setEntries((e) => {
      const n = { ...e };
      delete n[code];
      return n;
    });
  };

  return (
    <div>
      <p className="note" style={{ marginBottom: 10, fontSize: 11.5 }}>
        Optional — studying with someone else? Add their sync code (from their Sync panel above) to see
        how you're both doing. Read-only: this can never change their progress, or yours.
      </p>

      <CompareRow label="You" stats={mine} />
      {codes.map((code) => (
        <div key={code} className="row-sp" style={{ alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <CompareRow label={code} stats={entries[code] || { error: "Loading…" }} />
          </div>
          <button onClick={() => removeCode(code)} style={{ color: "var(--dim)", fontSize: 15, padding: "0 0 0 8px" }}>
            ✕
          </button>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCode()}
          placeholder="their sync code"
          style={{
            flex: 1, minWidth: 140, background: "var(--ink)", border: "1px solid var(--line)",
            borderRadius: 20, padding: "6px 14px", color: "var(--bone)", fontSize: 12,
          }}
        />
        <button className="speaker" disabled={busy || !input.trim()} onClick={addCode}>
          {busy ? "working…" : "add"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   VOICE
   Record a letter (or word) once — yours, or a relative's — and
   it plays back everywhere that letter appears (see HearButton).
   ============================================================ */

const audCache = new Map();
const AUD_IDX_KEY = "aud:index";

// have = Set of "fam.order" strings with a personal recording saved.
async function loadAudIndex() {
  try {
    const r = await window.storage.get(AUD_IDX_KEY);
    return new Set(JSON.parse(r.value));
  } catch (e) {
    return new Set();
  }
}

async function readMap(f) {
  try {
    const r = await window.storage.get("aud:f" + f);
    return JSON.parse(r.value) || {};
  } catch (e) {
    return {};
  }
}

async function getClip(f, o) {
  const ck = `${f}.${o}`;
  if (audCache.has(ck)) return audCache.get(ck);
  const m = await readMap(f);
  Object.entries(m).forEach(([oo, v]) => audCache.set(`${f}.${oo}`, v));
  return m[o] || null;
}

async function putClip(f, o, url) {
  const m = await readMap(f);
  m[o] = url;
  await window.storage.set("aud:f" + f, JSON.stringify(m));
  audCache.set(`${f}.${o}`, url);
  const idx = await loadAudIndex();
  idx.add(`${f}.${o}`);
  await window.storage.set(AUD_IDX_KEY, JSON.stringify([...idx]));
  return idx;
}

// Anyone should be able to pull back something they recorded — including by
// mistake, or a clip they've decided they don't want anymore.
async function deleteClip(f, o) {
  const m = await readMap(f);
  delete m[o];
  await window.storage.set("aud:f" + f, JSON.stringify(m));
  audCache.delete(`${f}.${o}`);
  const idx = await loadAudIndex();
  idx.delete(`${f}.${o}`);
  await window.storage.set(AUD_IDX_KEY, JSON.stringify([...idx]));
  return idx;
}

function Voice({ fam, order, have, onSaved }) {
  const [st, setSt] = useState("idle"); // idle | rec | busy
  const [err, setErr] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const mr = useRef(null);
  const fileRef = useRef(null);

  const play = async () => {
    const url = await getClip(fam, order);
    if (!url) return setErr("Nothing recorded for this letter yet.");
    try {
      await new Audio(url).play();
    } catch (e) {
      setErr("Playback blocked. Tap once anywhere first, then try again.");
    }
  };

  const commit = async (url) => {
    setSt("busy");
    try {
      const idx = await putClip(fam, order, url);
      onSaved(idx);
      setErr(null);
    } catch (e) {
      setErr("Couldn't save that clip.");
    }
    setSt("idle");
  };

  const save = (url) => {
    if (url.length > 700000) {
      setSt("idle");
      return setErr("That clip is too long. Aim for about a second.");
    }
    commit(url);
  };

  const start = async () => {
    setErr(null);
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      return setErr("Mic isn't reachable here. Use the upload button instead.");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const fr = new FileReader();
        fr.onload = () => save(fr.result);
        fr.readAsDataURL(new Blob(chunks, { type: r.mimeType || "audio/webm" }));
      };
      mr.current = r;
      r.start();
      setSt("rec");
    } catch (e) {
      setErr("Mic blocked. Allow microphone access, or upload a clip instead.");
    }
  };

  const stop = () => {
    if (mr.current && mr.current.state !== "inactive") mr.current.stop();
    setSt("busy");
  };

  const upload = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => save(fr.result);
    fr.readAsDataURL(f);
  };

  const del = async () => {
    if (!confirmDel) return setConfirmDel(true);
    setSt("busy");
    try {
      const idx = await deleteClip(fam, order);
      onSaved(idx);
      setErr(null);
    } catch (e) {
      setErr("Couldn't remove that clip.");
    }
    setSt("idle");
    setConfirmDel(false);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {have && (
          <button className="speaker" style={{ borderColor: "var(--verd)", color: "#8FD9B4" }} onClick={play}>
            ► play
          </button>
        )}
        {st === "rec" ? (
          <button className="speaker" style={{ borderColor: "var(--rubric)", color: "var(--rubric)" }} onClick={stop}>
            ■ stop
          </button>
        ) : (
          <button className="speaker" disabled={st === "busy"} onClick={start}>
            {st === "busy" ? "saving…" : have ? "● re-record" : "● record it"}
          </button>
        )}
        <button className="speaker" onClick={() => fileRef.current && fileRef.current.click()}>
          ⤒ upload
        </button>
        <input ref={fileRef} type="file" accept="audio/*" onChange={upload} style={{ display: "none" }} />
        {have && (
          <button
            className="speaker"
            style={confirmDel ? { borderColor: "var(--rubric)", color: "var(--rubric)" } : { color: "var(--dim)" }}
            onClick={del}
          >
            {confirmDel ? "tap again to remove" : "✕ remove"}
          </button>
        )}
      </div>
      {err && <div className="note" style={{ color: "var(--rubric)", marginTop: 6, fontSize: 11.5 }}>{err}</div>}
    </div>
  );
}

/* ============================================================
   CHANT
   The row recited in rhythm — the oldest way this gets taught,
   and the one thing you already have.
   ============================================================ */

function Chant({ fam, audio, compact }) {
  const F = FAMS[fam];
  const [i, setI] = useState(-1);
  const [tempo, setTempo] = useState(620);
  const [voice, setVoice] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    const find = () => {
      try {
        const v = window.speechSynthesis.getVoices().find((x) => /^am/i.test(x.lang));
        if (v) setVoice(v);
      } catch (e) {}
    };
    find();
    try {
      window.speechSynthesis.onvoiceschanged = find;
    } catch (e) {}
  }, []);
  // Bumped on every play() / playSound() / fam change / unmount, so an
  // in-flight playSound() loop (each step awaits real audio, unlike the
  // fixed-interval visual version) can tell its own run is stale and
  // stop touching state instead of racing a newer one.
  const playToken = useRef(0);

  useEffect(() => () => { clearInterval(timer.current); playToken.current++; }, []);
  useEffect(() => {
    setI(-1);
    clearInterval(timer.current);
    playToken.current++;
  }, [fam]);

  const play = () => {
    clearInterval(timer.current);
    playToken.current++;
    let n = 0;
    setI(0);
    timer.current = setInterval(() => {
      n += 1;
      if (n > 6) {
        clearInterval(timer.current);
        setTimeout(() => setI(-1), tempo);
        return;
      }
      setI(n);
    }, tempo);
  };

  // The visual chant above is timing-only — no sound. This actually
  // plays the row, one order at a time: your own recording, else a
  // verified official clip if one exists for that letter, else the
  // device's own Amharic voice — same priority and same "nothing plays
  // unless it's verified" rule HearButton uses (see its comment).
  // Sequenced off each clip's own "ended" event rather than a fixed
  // interval, since clip lengths vary.
  const playSound = async () => {
    clearInterval(timer.current);
    const token = ++playToken.current;
    for (let o = 0; o < 7; o++) {
      if (playToken.current !== token) return;
      setI(o);
      const have = audio && audio.have.has(`${fam}.${o}`);
      const recorded = have ? await getClip(fam, o) : null;
      if (playToken.current !== token) return;
      const haveOfficial = !recorded && audio && audio.official && audio.official.has(`${fam}.${o}`);
      const url = recorded || (haveOfficial ? officialAudioUrl(fam, o) : null);
      if (url) {
        await new Promise((resolve) => {
          const el = new Audio(url);
          el.addEventListener("ended", resolve);
          el.addEventListener("error", resolve);
          el.play().catch(resolve);
        });
      } else if (voice) {
        await new Promise((resolve) => {
          const u = new SpeechSynthesisUtterance(F.chars[o]);
          u.voice = voice;
          u.lang = voice.lang;
          u.rate = 0.85;
          u.onend = resolve;
          u.onerror = resolve;
          window.speechSynthesis.speak(u);
        });
      }
    }
    if (playToken.current === token) setI(-1);
  };

  const canHear = voice || F.chars.some((_, o) => audio && (audio.have.has(`${fam}.${o}`) || (audio.official && audio.official.has(`${fam}.${o}`))));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center", gap: 2, margin: "6px 0 4px" }}>
        {F.chars.map((c, k) => (
          <div key={k} className={"chantcell" + (k === i ? " on" : "")}>{c}</div>
        ))}
      </div>
      <div style={{ textAlign: "center", minHeight: 30 }}>
        <span className="disp" style={{ fontSize: 26, color: i >= 0 ? "var(--bone)" : "var(--dim)" }}>
          {i >= 0 ? F.rom[i] : F.rom.join(" · ")}
        </span>
      </div>
      {!compact && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
          <button className="speaker" onClick={play}>► chant the row</button>
          {canHear && <button className="speaker" onClick={playSound}>► hear it</button>}
          <button className="speaker" onClick={() => setTempo(tempo === 620 ? 900 : tempo === 900 ? 400 : 620)}>
            {tempo === 620 ? "steady" : tempo === 900 ? "slow" : "fast"}
          </button>
        </div>
      )}
      {compact && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
          <button className="speaker" onClick={play}>► chant the row</button>
          {canHear && <button className="speaker" onClick={playSound}>► hear it</button>}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TRACE
   Tracing is scored by comparing what you drew against the
   glyph's own pixels on a coarse grid — coverage minus spill.
   It judges the shape you made, not the order you made it in.
   ============================================================ */

const PAD = 320;
const CELLS = 40;
const FIDEL_STACK = "'Noto Serif Ethiopic','Kefa','Noto Sans Ethiopic','Abyssinica SIL','Nyala',serif";

function maskFromChar(ch) {
  const c = document.createElement("canvas");
  c.width = PAD;
  c.height = PAD;
  const x = c.getContext("2d");
  x.fillStyle = "#fff";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = `210px ${FIDEL_STACK}`;
  x.fillText(ch, PAD / 2, PAD / 2 + 8);
  const d = x.getImageData(0, 0, PAD, PAD).data;
  const g = new Uint8Array(CELLS * CELLS);
  const step = PAD / CELLS;
  for (let py = 0; py < PAD; py++) {
    for (let px = 0; px < PAD; px++) {
      if (d[(py * PAD + px) * 4 + 3] > 60) {
        g[Math.floor(py / step) * CELLS + Math.floor(px / step)] = 1;
      }
    }
  }
  return g;
}

const INK_NEUTRAL = "#EDE3CE";

// Shared by Trace's live-drawing feedback and its final check() -- same
// coarse-grid coverage/spill math either way, just called at different
// times.
function coverageOf(ctx, mask) {
  const d = ctx.getImageData(0, 0, PAD, PAD).data;
  const step = PAD / CELLS;
  const u = new Uint8Array(CELLS * CELLS);
  for (let py = 0; py < PAD; py++) {
    for (let px = 0; px < PAD; px++) {
      if (d[(py * PAD + px) * 4 + 3] > 60) {
        u[Math.floor(py / step) * CELLS + Math.floor(px / step)] = 1;
      }
    }
  }
  let gTot = 0, uTot = 0, hit = 0;
  for (let k = 0; k < mask.length; k++) {
    if (mask[k]) gTot++;
    if (u[k]) uTot++;
    if (mask[k] && u[k]) hit++;
  }
  return { coverage: gTot ? hit / gTot : 0, spill: uTot ? (uTot - hit) / uTot : 1 };
}

function lerpColor(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function Trace({ letters, onXp }) {
  const ghostRef = useRef(null);
  const inkRef = useRef(null);
  const maskRef = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  const [i, setI] = useState(0);
  const [mode, setMode] = useState("trace"); // trace | memory
  const [score, setScore] = useState(null);
  const [ready, setReady] = useState(false);

  const ch = letters[i % Math.max(1, letters.length)];
  const info = CHAR_MAP[ch];

  const paintGhost = useCallback(
    (visible) => {
      const c = ghostRef.current;
      if (!c) return;
      const x = c.getContext("2d");
      x.clearRect(0, 0, PAD, PAD);
      if (!visible) return;
      x.fillStyle = "rgba(237,227,206,0.16)";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.font = `210px ${FIDEL_STACK}`;
      x.fillText(ch, PAD / 2, PAD / 2 + 8);
    },
    [ch]
  );

  const clearInk = useCallback(() => {
    const c = inkRef.current;
    if (c) c.getContext("2d").clearRect(0, 0, PAD, PAD);
    dirty.current = false;
    setScore(null);
  }, []);

  useEffect(() => {
    let alive = true;
    const go = () => {
      if (!alive) return;
      maskRef.current = maskFromChar(ch);
      paintGhost(mode === "trace");
      clearInk();
      setReady(true);
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go);
    else go();
    return () => {
      alive = false;
    };
  }, [ch]);

  useEffect(() => {
    if (ready) paintGhost(mode === "trace" || score !== null);
  }, [mode, score, ready, paintGhost]);

  const pos = (e) => {
    const r = inkRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * PAD, ((e.clientY - r.top) / r.height) * PAD];
  };

  const moveCount = useRef(0);

  const down = (e) => {
    if (score !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    dirty.current = true;
    moveCount.current = 0;
    const x = inkRef.current.getContext("2d");
    const [a, b] = pos(e);
    x.strokeStyle = INK_NEUTRAL;
    x.lineWidth = 13;
    x.lineCap = "round";
    x.lineJoin = "round";
    x.beginPath();
    x.moveTo(a, b);
  };

  const move = (e) => {
    if (!drawing.current) return;
    const x = inkRef.current.getContext("2d");
    const [a, b] = pos(e);
    x.lineTo(a, b);
    x.stroke();

    // Live "getting warmer" feedback: every few points (getImageData isn't
    // free -- no need to run it on every single pointermove), recolor the
    // whole stroke toward --verd as coverage of the target shape improves.
    // stroke() re-renders the WHOLE accumulated path each call (no
    // beginPath() between segments), so changing strokeStyle here recolors
    // ink already drawn, not just what comes next.
    moveCount.current++;
    if (maskRef.current && moveCount.current % 4 === 0) {
      const { coverage } = coverageOf(x, maskRef.current);
      x.strokeStyle = lerpColor(INK_NEUTRAL, "#4F9A76", Math.min(1, coverage));
    }
  };

  const up = () => {
    drawing.current = false;
  };

  const check = () => {
    if (!dirty.current || !maskRef.current) return;
    const x = inkRef.current.getContext("2d");
    const { coverage, spill } = coverageOf(x, maskRef.current);
    const sc = Math.max(0, Math.round(100 * coverage * (1 - 0.5 * spill)));
    setScore({ sc, coverage: Math.round(coverage * 100), spill: Math.round(spill * 100) });
    if (sc >= 70) onXp(10);
  };

  const verdict = (sc) =>
    sc >= 85
      ? "Clean. That's the shape."
      : sc >= 70
      ? "Recognizable. Tighten the curves."
      : sc >= 45
      ? "The skeleton's there, but it's drifting off the form."
      : "Way off. Switch back to tracing and follow the ghost.";

  if (!letters.length) {
    return (
      <div className="wrap" style={{ paddingTop: 40, textAlign: "center" }}>
        <p className="note">Learn a letter first, then come back and write it.</p>
      </div>
    );
  }

  return (
    <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
      <div className="wrap" style={{ paddingTop: 14 }}>
        <div style={{ display: "flex", gap: 6, background: "var(--ink2)", padding: 4, borderRadius: 12, border: "1px solid var(--line)", marginBottom: 14 }}>
          {[["trace", "Trace over it"], ["memory", "From memory"]].map(([id, label]) => (
            <button key={id} onClick={() => { setMode(id); clearInk(); }} style={{
              flex: 1, padding: "8px 6px", borderRadius: 9, fontSize: 12.5, fontWeight: 600,
              background: mode === id ? "var(--rubric)" : "transparent",
              color: mode === id ? "#fff" : "var(--dim)",
            }}>{label}</button>
          ))}
        </div>

        <div className="row-sp" style={{ marginBottom: 8 }}>
          <span className="eyebrow">
            {info ? `${FAMS[info.fam].rom[info.order]} · ${ORDERS[info.order].am}` : "write it"}
          </span>
          <span className="pill">{i + 1} of {letters.length}</span>
        </div>

        {mode === "memory" && score === null && (
          <div className="disp" style={{ fontSize: 40, textAlign: "center", marginBottom: 6 }}>
            {info ? FAMS[info.fam].rom[info.order] : ""}
          </div>
        )}

        <div className="padwrap">
          <div className="guide">
            <i style={{ left: "50%", top: 0, bottom: 0, width: 1 }} />
            <i style={{ top: "50%", left: 0, right: 0, height: 1 }} />
          </div>
          <canvas ref={ghostRef} width={PAD} height={PAD} />
          <canvas
            ref={inkRef}
            width={PAD}
            height={PAD}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
        </div>

        <p className="note" style={{ textAlign: "center", marginTop: 12, fontSize: 11.5 }}>
          Fidel is written left to right, and within a letter the uprights come before the strokes that
          join them. Nothing here checks your stroke order — it scores the shape you end up with.
        </p>
      </div>

      {score ? (
        <div className={"verdict " + (score.sc >= 70 ? "ok" : "no")}>
          <div className="row-sp" style={{ marginBottom: 8 }}>
            <div>
              <div className="vtitle" style={{ color: score.sc >= 70 ? "var(--verd)" : "var(--rubric)" }}>
                {score.sc}
              </div>
              <div className="vsub">{verdict(score.sc)}</div>
            </div>
            <span className="gz" style={{ fontSize: 44, color: "var(--dim)" }}>{ch}</span>
          </div>
          <div className="vsub" style={{ marginBottom: 10, fontSize: 11.5 }}>
            {score.coverage}% of the letter covered · {score.spill}% of your ink landed outside it
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost" style={{ flex: 1 }} onClick={clearInk}>Again</button>
            <button className="btn" style={{ flex: 2 }} onClick={() => { setI(i + 1); }}>Next letter</button>
          </div>
        </div>
      ) : (
        <div className="verdict">
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost" style={{ flex: 1 }} onClick={clearInk}>Clear</button>
            <button className="btn" style={{ flex: 2 }} onClick={check}>Check it</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   READER
   ============================================================ */

function Reader({ known, audio }) {
  const [i, setI] = useState(0);
  const [tap, setTap] = useState(null);
  const [showRom, setShowRom] = useState(false);
  const [showEn, setShowEn] = useState(false);

  const [cat, setCat] = useState("family");

  const ranked = useMemo(() => {
    return SENTENCES.filter((s) => s.c === cat)
      .map((s) => {
        const chars = s.w.flatMap((w) => Array.from(w[0])).filter((c) => CHAR_MAP[c]);
        const hit = chars.filter((c) => known.has(c)).length;
        return { sent: s.w, pct: Math.round((hit / Math.max(1, chars.length)) * 100) };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [known, cat]);

  useEffect(() => {
    setI(0);
    setTap(null);
    setShowRom(false);
    setShowEn(false);
  }, [cat]);

  const { sent, pct } = ranked.length ? ranked[i % ranked.length] : { sent: null, pct: 0 };

  if (!sent) {
    return (
      <div className="wrap" style={{ paddingTop: 40, textAlign: "center" }}>
        <p className="note">Nothing in this category yet.</p>
      </div>
    );
  }

  return (
    <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
      <div className="wrap" style={{ paddingTop: 16 }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12, paddingBottom: 2 }}>
          {CATS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setCat(id)}
              style={{
                whiteSpace: "nowrap", padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: "1px solid " + (cat === id ? "var(--rubric)" : "var(--line)"),
                background: cat === id ? "rgba(206,69,44,.14)" : "transparent",
                color: cat === id ? "var(--rubric)" : "var(--dim)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="row-sp" style={{ marginBottom: 4 }}>
          <span className="eyebrow">{i + 1} of {ranked.length}</span>
          <span className="pill">{pct}% known letters</span>
        </div>
        <p className="note" style={{ marginBottom: 20, fontSize: 11.5 }}>
          Tap any letter to hear what it is. Letters you've learned are bright.
        </p>

        <div style={{ lineHeight: 1.7, marginBottom: 8 }}>
          {sent.map((w, wi) => (
            <span key={wi} style={{ display: "inline-block", marginRight: 14, marginBottom: 10 }}>
              {Array.from(w[0]).map((c, ci) => {
                const info = CHAR_MAP[c];
                const on = tap && tap.c === c && tap.wi === wi && tap.ci === ci;
                return (
                  <button
                    key={ci}
                    className="gz"
                    onClick={() => setTap(info ? { c, wi, ci } : null)}
                    style={{
                      fontSize: 34,
                      color: on ? "var(--rubric)" : !info ? "var(--dim)" : known.has(c) ? "var(--bone)" : "#5A6488",
                      padding: "0 1px",
                      borderBottom: on ? "2px solid var(--rubric)" : "2px solid transparent",
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </span>
          ))}
        </div>

        {showRom && (
          <div className="note" style={{ fontSize: 14, color: "var(--bone)", marginBottom: 6 }}>
            {sent.map((w) => w[1]).join(" ")}
          </div>
        )}
        {showEn && (
          <div style={{ marginTop: 10 }}>
            {sent.map((w, k) => (
              <div key={k} style={{ display: "flex", gap: 10, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <span className="gz" style={{ fontSize: 19, minWidth: 78 }}>{w[0]}</span>
                <span className="note" style={{ flex: 1 }}>
                  <b style={{ color: "var(--bone)" }}>{w[1]} — </b>
                  {w[2]}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          <button className="speaker" onClick={() => setShowRom(!showRom)}>
            {showRom ? "hide" : "show"} sounds
          </button>
          <button className="speaker" onClick={() => setShowEn(!showEn)}>
            {showEn ? "hide" : "show"} meaning
          </button>
        </div>
      </div>

      <div className="verdict">
        {tap ? (
          <div style={{ marginBottom: 12 }}>
            <div className="row-sp">
              <span className="gz" style={{ fontSize: 42, color: "var(--rubric)" }}>{tap.c}</span>
              <div style={{ flex: 1, textAlign: "right" }}>
                <div style={{ fontSize: 20, fontWeight: 600 }}>
                  {FAMS[CHAR_MAP[tap.c].fam].rom[CHAR_MAP[tap.c].order]}
                </div>
                <div className="note" style={{ fontSize: 11 }}>
                  {FAMS[CHAR_MAP[tap.c].fam].chars[0]} + {ORDERS[CHAR_MAP[tap.c].order].v} mark ·{" "}
                  {ORDERS[CHAR_MAP[tap.c].order].am}
                </div>
                {audio && audio.have.has(`${CHAR_MAP[tap.c].fam}.${CHAR_MAP[tap.c].order}`) && (
                  <button
                    className="speaker"
                    style={{ marginTop: 6, borderColor: "var(--verd)", color: "#8FD9B4" }}
                    onClick={async () => {
                      const f = CHAR_MAP[tap.c].fam, o = CHAR_MAP[tap.c].order;
                      const u = await getClip(f, o);
                      if (u) new Audio(u).play().catch(() => {});
                    }}
                  >
                    ► play
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="vsub" style={{ marginBottom: 12 }}>
            Read it left to right, one syllable per letter.
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost" style={{ flex: 1 }} onClick={() => { setTap(null); setShowRom(false); setShowEn(false); setI((i - 1 + ranked.length) % ranked.length); }}>
            Back
          </button>
          <button className="btn" style={{ flex: 2 }} onClick={() => { setTap(null); setShowRom(false); setShowEn(false); setI((i + 1) % ranked.length); }}>
            Next sentence
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   THE SIX MONTHS
   18 lessons: 34 base shapes in three weeks, then one vowel
   column roughly every ten days, then six weeks of nothing but
   reading and writing.
   ============================================================ */

const PLAN_DAYS = 182;
const TOTAL_LESSONS = BASE_BATCHES.length + SWEEPS.length;

function expectedBy(day) {
  if (day <= 21) return (BASE_BATCHES.length * day) / 21;
  if (day <= 140) return BASE_BATCHES.length + (SWEEPS.length * (day - 21)) / 119;
  return TOTAL_LESSONS;
}

function phaseOf(day) {
  if (day <= 21) return "Weeks 1–3 · the 34 shapes";
  if (day <= 140) return "Weeks 4–20 · one vowel column at a time";
  return "Weeks 21–26 · reading and writing only";
}

function Plan({ state, dueCount, nextLabel }) {
  const day = Math.max(1, Math.floor((Date.now() - (state.startDate || Date.now())) / DAY) + 1);
  const done = (state.basesDone || []).length + (state.sweepsDone || []).length;
  const target = expectedBy(Math.min(day, PLAN_DAYS));
  const drift = done - target;
  const status =
    drift >= 1 ? `${Math.floor(drift)} ahead` : drift <= -1 ? `${Math.ceil(-drift)} behind` : "on pace";

  const today = dueCount > 0 ? `Clear ${dueCount} review${dueCount > 1 ? "s" : ""}, then ${nextLabel}` : nextLabel;

  return (
    <div className="card" style={{ borderColor: drift <= -2 ? "var(--rubric)" : "var(--line)" }}>
      <div className="row-sp">
        <span className="eyebrow">Day {Math.min(day, PLAN_DAYS)} of {PLAN_DAYS}</span>
        <span className="pill" style={{ color: drift <= -2 ? "var(--rubric)" : drift >= 1 ? "var(--gold)" : "var(--dim)" }}>
          {status}
        </span>
      </div>
      <div className="card-title" style={{ fontSize: 19, marginTop: 4 }}>{phaseOf(day)}</div>
      <div className="meter" style={{ marginTop: 10 }}>
        <i style={{ width: `${(done / TOTAL_LESSONS) * 100}%` }} />
      </div>
      <div className="card-blurb" style={{ marginTop: 8 }}>
        {done} of {TOTAL_LESSONS} lessons done · <b style={{ color: "var(--bone)" }}>today: {today}</b>
      </div>
      <div className="note" style={{ marginTop: 10, fontSize: 11, borderTop: "1px solid var(--line)", paddingTop: 9 }}>
        Fifteen minutes a day clears this with room to spare. Worth being straight with you though: six
        months gets you <b style={{ color: "var(--bone)" }}>decoding</b> — you'll sound out any word you
        see. Understanding what you've sounded out is vocabulary and grammar, a separate and much longer
        project this doesn't cover.
      </div>
    </div>
  );
}

/* ============================================================
   HOME
   ============================================================ */

function Thesis({ track }) {
  const [o, setO] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setO((x) => (x + 1) % 7), 1500);
    return () => clearInterval(id);
  }, []);
  const F = FAMS[3];
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 18, padding: "18px 14px 16px", background: "var(--ink2)", marginBottom: 16 }}>
      <div className="eyebrow" style={{ textAlign: "center" }}>One shape · seven vowels</div>
      <div className="rubric" style={{ paddingBottom: 6 }}>
        {F.chars.map((c, i) => (
          <div key={i} className={"rcell" + (i === o ? " on" : " known")}>{c}</div>
        ))}
      </div>
      <div style={{ textAlign: "center" }}>
        <span className="disp" style={{ fontSize: 26 }}>{F.rom[o]}</span>
        <span className="note" style={{ marginLeft: 8 }}>{ORDERS[o].say}</span>
      </div>
      <p className="note" style={{ textAlign: "center", marginTop: 10, fontSize: 12 }}>
        Amharic doesn't spell vowels separately. It bends the consonant. 34 shapes and 7 bends gets you
        all 238 letters.
      </p>
    </div>
  );
}

function LessonCard({ open, done, fidel, title, blurb, count, onClick }) {
  // count tracks ongoing mastery (spaced-repetition review, separate from
  // this lesson itself) — it can genuinely still read low right after
  // finishing a lesson for the first time, since that only takes a
  // letter from unseen to barely-seen, not to "mastered." Showing that
  // raw count next to done's green border read as a contradiction ("why
  // does it say done but 0/6?"); "done" here instead matches what the
  // border already says, and the mastery count still drives the review
  // queue and Chart brightness in the background exactly as before.
  const pill = !open ? "locked" : done ? "done" : count;
  return (
    <button className={"card" + (done ? " done" : "") + (open ? "" : " locked")} disabled={!open} onClick={onClick}>
      <div className="card-head"><span className="card-fidel">{fidel}</span></div>
      <div className="row-sp">
        <span className="card-title">{title}</span>
        <span className="pill" style={done ? { background: "rgba(79,154,118,.2)", color: "#8FD9B4" } : undefined}>
          {pill}
        </span>
      </div>
      <div className="card-blurb" style={{ marginTop: 4 }}>{blurb}</div>
    </button>
  );
}

// A stage's own progress stays visible even collapsed -- collapsing is
// purely to save scroll room, not to hide where you stand. Purely local,
// user-driven toggle: no auto-collapse on completion, since the whole
// point (per product decision) is that it's the person's own choice.
function StageHeader({ open, onToggle, title, done, total, style, dataTour }) {
  // A plain text label read as just another line, not a section boundary
  // with cards grouped under it -- given real visual weight (its own
  // bordered band, a pill for the count) instead, matching how the rest
  // of the app already marks something as its own distinct block (.card,
  // the track-toggle bar) rather than inventing a new visual language.
  return (
    <button
      onClick={onToggle}
      data-tour={dataTour}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
        textAlign: "left", background: "var(--ink3)", border: "1px solid var(--line)",
        borderRadius: 12, padding: "13px 14px", ...style,
      }}
    >
      <span className="eyebrow" style={{ margin: 0, fontSize: 11.5 }}>{title}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 10 }}>
        <span className="pill">{done}/{total}</span>
        <span style={{ color: "var(--dim)", fontSize: 15, lineHeight: 1 }}>{open ? "▾" : "▸"}</span>
      </span>
    </button>
  );
}

/* ============================================================
   SPOTLIGHT
   First-launch walkthrough, redesigned around a real complaint:
   the old Tour replaced the whole Home screen with generic slides
   before letting anyone see the actual app. This instead renders
   Home immediately underneath and dims everything BUT a highlight
   ring around a real element (found via the data-tour attributes
   sprinkled through the JSX below), so people click through actual
   pieces of the actual interface. Re-openable anytime via the "?"
   button in the top bar, not just a one-time first-launch thing.
   ============================================================ */

const SPOTLIGHT_STEPS = [
  { target: null, title: "Welcome to ፊደል", body: "A 60-second look at where everything lives. Skip anytime — this doesn't come back uninvited." },
  { target: "topbar", title: "Level & XP", body: "Every lesson, review, and drill earns XP. 250 XP clears a level." },
  { target: "tabs", title: "Four ways to practice", body: "Learn teaches new letters. Chart is the whole fidel at a glance, tap any letter to hear or record it. Read puts real sentences in front of you. Write is free-hand tracing, scored against the actual shape." },
  { target: "quests", title: "Daily quests", body: "Three quick goals every day for bonus XP — they reset each morning, so a couple minutes keeps a streak alive even on a busy day." },
  { target: "stage", title: "Your path", body: "Tap any card here to start that lesson. Each one unlocks once the one before it's done." },
  { target: null, title: "That's it", body: "Tap the ? up top anytime to see this again. Let's go." },
];

function Spotlight({ onDone }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const step = SPOTLIGHT_STEPS[i];
  const last = i === SPOTLIGHT_STEPS.length - 1;

  useEffect(() => {
    if (!step.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    // scrollIntoView is smooth/async -- re-measure once it's likely settled,
    // and keep tracking resize/scroll so the ring doesn't drift out of place.
    const t = setTimeout(measure, 350);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [i]);

  const pad = 8;
  const cardOnTop = rect && rect.top > window.innerHeight * 0.55;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
      {rect ? (
        <div
          style={{
            position: "fixed",
            left: rect.left - pad, top: rect.top - pad,
            width: rect.width + pad * 2, height: rect.height + pad * 2,
            borderRadius: 14,
            boxShadow: "0 0 0 9999px rgba(6,9,20,0.84)",
            border: "2px solid var(--rubric)",
            pointerEvents: "none",
            transition: "left .2s ease, top .2s ease, width .2s ease, height .2s ease",
          }}
        />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: "rgba(6,9,20,0.84)" }} />
      )}

      <div
        className="card"
        style={{
          position: "fixed", left: "50%", transform: "translateX(-50%)",
          ...(cardOnTop ? { top: 20 } : { bottom: 20 }),
          width: "calc(100% - 32px)", maxWidth: 380, borderColor: "var(--rubric)",
        }}
      >
        <div className="row-sp" style={{ marginBottom: 8 }}>
          <span className="eyebrow">{i + 1} of {SPOTLIGHT_STEPS.length}</span>
          <button onClick={onDone} style={{ color: "var(--dim)", fontSize: 16 }}>Skip ✕</button>
        </div>
        <div className="disp" style={{ fontSize: 21, marginBottom: 8 }}>{step.title}</div>
        <p className="note" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>{step.body}</p>
        <button className="btn" style={{ width: "100%" }} onClick={() => (last ? onDone() : setI(i + 1))}>
          {last ? "Let's go" : "Next"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   INSTALL BANNER
   Chrome/Edge/Android expose a real programmatic install prompt
   (beforeinstallprompt, captured in src/lib/installPrompt.js as
   early as possible since it can fire before this even mounts) —
   there, this is one tap. iOS Safari has no such API at all; the
   only path is the manual Share -> Add to Home Screen menu, so
   there it shows those steps instead of a button. Dismissed the
   same one-time way as Callout below (state.seenIntro), and never
   shown at all once actually running standalone (already
   installed) or on a platform that offers neither path.
   ============================================================ */

function InstallBanner({ seenIntro, onSeen }) {
  const [prompt, setPrompt] = useState(null);
  useEffect(() => onInstallPromptAvailable(setPrompt), []);

  if (seenIntro.includes("cb-install") || isStandalone()) return null;

  const ios = isIOSDevice();
  // Used to return null here on Android/desktop Chrome whenever
  // beforeinstallprompt hadn't fired yet -- meaning anyone Chrome hasn't
  // yet decided to offer a real install to saw NOTHING, no explanation at
  // all. That's exactly the confusing case a real user hit: no button,
  // and manually using the browser's own "Add to Home screen" just makes
  // a bookmark shortcut (opens in a new browser tab forever after, not a
  // standalone app) -- indistinguishable from a real install unless
  // someone tells you. Show the explanation either way now; only the
  // actual button is conditional on a captured prompt.

  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    onSeen("cb-install");
  };

  return (
    <div className="card" style={{ borderColor: "var(--gold)", padding: "12px 14px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ color: "var(--gold)", marginBottom: 4 }}>Add to Home Screen</div>
          <div className="note" style={{ color: "var(--bone)", fontSize: 12.5 }}>
            {ios ? (
              <>
                Opens faster and works offline as its own app. Works best in <b>Safari</b> specifically —
                tap the <b>Share</b> button (the square with an arrow), then <b>Add to Home Screen</b>. On
                Chrome, if it offers an <b>"Open as Web App"</b> toggle, turn it off — a real user hit this:
                left on, the icon kept opening fresh tabs instead of reopening reliably (Chrome on iPhone
                can't actually host a standalone app the way Safari can).
              </>
            ) : prompt ? (
              <>Opens faster and works offline as its own app, off your home screen — no browser bar.</>
            ) : (
              <>
                Look for <b>Install app</b> in Chrome's <b>⋮</b> menu — not "Add to Home screen," which just
                saves a bookmark that reopens in the browser (and can pile up new tabs) instead of its own app
                window. If Chrome only offers "Add to Home screen" right now, it hasn't decided to offer the
                real install yet — that's Chrome's own call, not something this app can force, and it usually
                comes after a couple more visits.
              </>
            )}
          </div>
        </div>
        <button onClick={() => onSeen("cb-install")} style={{ color: "var(--dim)", fontSize: 16, lineHeight: 1, padding: 2 }}>
          ✕
        </button>
      </div>
      {!ios && prompt && (
        <button className="btn" style={{ marginTop: 10, width: "100%" }} onClick={install}>
          Install ፊደል
        </button>
      )}
    </div>
  );
}

/* ============================================================
   CALLOUT
   A small, dismissible, one-time tip anchored in place next to
   the feature it explains — pointing things out as they're
   encountered rather than all at once up front. Tracked in
   state.seenIntro alongside the app-tour flag.
   ============================================================ */

function Callout({ id, seenIntro, onSeen, children }) {
  if (seenIntro.includes(id)) return null;
  return (
    <div className="card" style={{ borderColor: "var(--gold)", padding: "12px 14px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ color: "var(--gold)", marginBottom: 4 }}>Tip</div>
          <div className="note" style={{ color: "var(--bone)", fontSize: 12.5 }}>{children}</div>
        </div>
        <button onClick={() => onSeen(id)} style={{ color: "var(--dim)", fontSize: 16, lineHeight: 1, padding: 2 }}>
          ✕
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   BADGES
   Milestones computed straight from state that already exists —
   no separate "earned" list to persist, so there's nothing to get
   out of sync. Tap one to see what it takes.
   ============================================================ */

const BADGES = [
  { id: "first", glyph: "1", label: "First step", hint: "Learn your first letter.", need: (c) => c.known.size >= 1 },
  { id: "bases", glyph: "34", label: "The 34", hint: "All 34 base shapes learned.", need: (c) => c.allBases },
  { id: "full", glyph: "238", label: "Full fidel", hint: `Every letter, every vowel — all ${ALL.length}, both tracks converge here.`, need: (c) => c.known.size >= ALL.length },
  { id: "lvl5", glyph: "5", label: "Level 5", hint: "Reach level 5 — 1,000 XP from drills, review, words, writing, or the speed round.", need: (c) => c.level >= 5 },
  { id: "mastered", glyph: "10", label: "Ten mastered", hint: "Ten letters at full brightness on the chart (level 5 or higher).", need: (c) => c.masteredCount >= 10 },
  { id: "streak", glyph: "7", label: "Week streak", hint: "Open the app seven days running.", need: (c) => c.state.streakDays >= 7 },
  { id: "speed", glyph: "15", label: "Quick draw", hint: "Score 15 or higher in the speed round.", need: (c) => c.state.bestSpeed >= 15 },
  { id: "voice", glyph: "●", label: "Family voice", hint: "Record your first letter — yours, or a relative's.", need: (c) => c.audioCount >= 1 },
];

function Badges({ state, known, level, allBases, audioCount }) {
  const [sel, setSel] = useState(null);
  const masteredCount = useMemo(
    () => Object.values(state.cards).filter((c) => (c.lvl || 0) >= 5).length,
    [state.cards]
  );
  const ctx = { known, level, allBases, masteredCount, state, audioCount };
  const selBadge = BADGES.find((b) => b.id === sel);
  return (
    <div>
      <div className="eyebrow" style={{ margin: "18px 0 10px" }}>Badges</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {BADGES.map((b) => {
          const earned = b.need(ctx);
          return (
            <button
              key={b.id}
              onClick={() => setSel(sel === b.id ? null : b.id)}
              style={{
                background: earned ? "rgba(217,169,60,.12)" : "var(--ink2)",
                border: "1px solid " + (earned ? "var(--gold)" : "var(--line)"),
                borderRadius: 9, padding: "7px 10px", textAlign: "center", minWidth: 56,
              }}
            >
              <div className="disp" style={{ fontSize: 18, color: earned ? "var(--gold)" : "var(--dim)" }}>
                {b.glyph}
              </div>
              <div className="note" style={{ fontSize: 9.5, marginTop: 2, color: earned ? "var(--bone)" : "var(--dim)" }}>
                {b.label}
              </div>
            </button>
          );
        })}
      </div>
      {selBadge && (
        <div className="note" style={{ marginTop: 10, fontSize: 11.5 }}>
          <b style={{ color: "var(--bone)" }}>{selBadge.label}</b>
          <span style={{ color: selBadge.need(ctx) ? "var(--gold)" : "var(--dim)" }}>
            {selBadge.need(ctx) ? " — earned. " : " — locked. "}
          </span>
          {selBadge.hint}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   DAILY QUESTS
   Same 3 (of a pool of 4) for everyone on a given calendar day —
   see questsForDay in src/lib/gamification.js for why that's
   deterministic rather than random. Progress and payout both come
   from state.today, which every XP-earning action already updates
   via bumpToday (see AmharicFidel below) — this component only reads.
   ============================================================ */

function DailyQuests({ today }) {
  const day = todayStamp();
  const quests = questsForDay(day);
  const t = today && today.day === day ? today : emptyToday(day);

  return (
    <div className="card" data-tour="quests" style={{ padding: "12px 14px", marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Today's quests</div>
      {quests.map((q) => {
        const done = t.claimed.includes(q.id);
        const progress = Math.min(q.get(t), q.target);
        return (
          <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
            <span style={{ fontSize: 15, color: done ? "var(--gold)" : "var(--dim)", width: 16, textAlign: "center" }}>
              {done ? "✓" : "○"}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, color: done ? "var(--dim)" : "var(--bone)", textDecoration: done ? "line-through" : "none" }}>
                {q.label}
              </div>
              {!done && (
                <div style={{ height: 3, background: "var(--ink3)", borderRadius: 2, marginTop: 4 }}>
                  <div style={{ height: 3, width: `${(progress / q.target) * 100}%`, background: "var(--rubric)", borderRadius: 2 }} />
                </div>
              )}
            </div>
            <span className="pill" style={{ fontSize: 10, opacity: done ? 0.5 : 1 }}>+{q.reward} xp</span>
          </div>
        );
      })}
    </div>
  );
}

function Home({ state, dueCount, level, known, onStart, onReview, onSpeed, track, setTrack, seenIntro, onSeen, audioCount }) {
  const bDone = new Set(state.basesDone || []);
  const sDone = new Set(state.sweepsDone || []);
  const uDone = new Set(state.unitsDone || []);
  const allBases = BASE_BATCHES.every((b) => bDone.has(b.id));

  const solid = (f, o) => ((state.cards[key(f, o)] || {}).lvl || 0) >= 3;

  // Feature-detected, not assumed -- navigator.share exists on iOS/Android
  // browsers and some desktop ones, not all (same pattern as the PWA
  // install prompt elsewhere in this file). No account, no server round
  // trip: it just hands plain text to whatever the OS share sheet offers.
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const shareProgress = () => {
    // Whoever gets this has never seen the app before -- exact copy the
    // user asked for: a real product description up front (not a stat
    // flex) plus both platforms' home-screen instructions, since this
    // travels in the message itself and the in-app banner/Callouts can't
    // reach someone before they've opened the link at all.
    const text = `Welcome to ፊደል Amharic Fidel!\n\nRead Amharic in a few minutes a day. Daily challenges, tracing practice, spaced review that catches what you forget, and a reader for real text.\n\nAdd it to your home screen so it opens like an app:\niPhone: use Safari (not Chrome) -- Share icon, then Add to Home Screen. If Chrome offers "Open as Web App," turn it off, or the icon may reopen as a fresh tab each time.\n\nAndroid (Chrome): three-dot menu, then Add to Home Screen`;
    navigator.share({ text, url: window.location.href }).catch(() => {});
  };

  // Purely a per-visit UI preference (not persisted) -- collapsing a
  // stage just saves scroll room while you're looking at the other one,
  // it's not a setting worth remembering across sessions.
  const [openStages, setOpenStages] = useState({ stage1: true, stage2: true, rows: true });
  const toggleStage = (id) => setOpenStages((s) => ({ ...s, [id]: !s[id] }));

  return (
    <div className="wrap" style={{ paddingTop: 18, paddingBottom: 30 }}>
      <Thesis />

      {(() => {
        const nb = BASE_BATCHES.find((b, i) => !bDone.has(b.id) && (i === 0 || bDone.has(BASE_BATCHES[i - 1].id)));
        const ns = allBases && SWEEPS.find((w, i) => !sDone.has(w.id) && (i === 0 || sDone.has(SWEEPS[i - 1].id)));
        const label = nb ? nb.title : ns ? `${ns.title}, part ${ns.part}` : "read and write";
        return <Plan state={state} dueCount={dueCount} nextLabel={label} />;
      })()}

      <div className="row-sp" style={{ marginBottom: 16, marginTop: 16 }}>
        <div className="stat"><b>{level}</b><span>level</span></div>
        <div className="stat"><b>{known.size}</b><span>letters known</span></div>
        <div className="stat"><b>{state.streakDays}</b><span>day streak</span></div>
      </div>

      {state.streakFreezes > 0 && (
        <div className="note" style={{ textAlign: "center", fontSize: 11, marginTop: -10, marginBottom: 4 }}>
          ❄️ {state.streakFreezes} freeze{state.streakFreezes > 1 ? "s" : ""} saved — a missed day won't break the streak
        </div>
      )}

      {canShare && (
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <button className="speaker" onClick={shareProgress}>share your progress</button>
        </div>
      )}

      <Callout id="cb-stats" seenIntro={seenIntro} onSeen={onSeen}>
        Level is just total XP in disguise — 250 XP per level, earned across lessons, review, word
        building, tracing, and the speed round. The streak counts by calendar day, from opening the
        app — it's on the honor system, not tied to actually finishing anything. Every 7-day milestone
        banks a freeze (up to {MAX_FREEZES}): miss a day with one saved and the streak survives anyway.
      </Callout>

      <DailyQuests today={state.today} />

      {/* Shown from the very first open, on purpose -- someone arriving
          via a shared link is exactly who most needs to know this can go
          on their home screen, not someone who's already invested time.
          Still fully dismissible and never shown again once seen. */}
      <div style={{ marginBottom: 16 }}>
        <InstallBanner seenIntro={seenIntro} onSeen={onSeen} />
      </div>

      {dueCount > 0 && (
        <button className="card" style={{ borderColor: "var(--rubric)" }} onClick={onReview}>
          <div className="card-head"><span className="card-fidel">ደግም</span></div>
          <div className="card-title" style={{ fontSize: 19 }}>{dueCount} letters are fading</div>
          <div className="card-blurb">Review them now and they hold for weeks instead of days.</div>
        </button>
      )}

      <div style={{ display: "flex", gap: 6, margin: "18px 0 6px", background: "var(--ink2)", padding: 4, borderRadius: 12, border: "1px solid var(--line)" }}>
        {[["bases", "Bases first"], ["rows", "Full rows"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTrack(id)}
            style={{
              flex: 1, padding: "9px 6px", borderRadius: 9, fontSize: 13, fontWeight: 600,
              background: track === id ? "var(--rubric)" : "transparent",
              color: track === id ? "#fff" : "var(--dim)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="note" style={{ margin: "8px 0 16px", fontSize: 11.5 }}>
        {track === "bases"
          ? "Learn all 34 base shapes, then sweep one vowel column at a time across every letter. If you already have the chant rhythm in your head, this is the faster road: the chant hands you the seven sounds for free, so the only new work is spotting the mark."
          : "Take one row at a time, all seven vowels together. You read real words within a day, but the vowel marks stay implicit longer."}
      </p>

      <Callout id="cb-track" seenIntro={seenIntro} onSeen={onSeen}>
        These two tracks aren't a one-time choice — switch anytime, for free. They feed the same
        progress, the same review queue, the same chart.
      </Callout>

      {track === "bases" ? (
        <>
          <StageHeader
            open={openStages.stage1}
            onToggle={() => toggleStage("stage1")}
            title="Stage one · the 34 shapes"
            done={BASE_BATCHES.filter((b) => bDone.has(b.id)).length}
            total={BASE_BATCHES.length}
            style={{ margin: "18px 0 10px" }}
            dataTour="stage"
          />
          {openStages.stage1 && BASE_BATCHES.map((b, i) => {
            const open = i === 0 || bDone.has(BASE_BATCHES[i - 1].id);
            const n = b.fams.filter((f) => solid(f, 0)).length;
            return (
              <LessonCard
                key={b.id}
                open={open}
                done={bDone.has(b.id)}
                fidel={b.fams.map((f) => FAMS[f].chars[0]).join("")}
                title={b.title}
                blurb={b.blurb}
                count={`${n}/${b.fams.length}`}
                onClick={() => onStart({ kind: "base", id: b.id, fams: b.fams, orders: [0], doneLabel: "Shapes locked in" })}
              />
            );
          })}

          <StageHeader
            open={openStages.stage2}
            onToggle={() => toggleStage("stage2")}
            title="Stage two · the six vowel columns"
            done={SWEEPS.filter((sw) => sDone.has(sw.id)).length}
            total={SWEEPS.length}
            style={{ margin: "22px 0 8px" }}
          />
          {openStages.stage2 && (
            <>
              <p className="note" style={{ marginBottom: 10, fontSize: 11.5 }}>
                {allBases ? "Taught most-regular first. The ə column comes last because it barely follows a rule." : "Opens once all 34 base shapes are done."}
              </p>
              {SWEEPS.map((sw, i) => {
                const open = allBases && (i === 0 || sDone.has(SWEEPS[i - 1].id));
                const n = sw.fams.filter((f) => solid(f, sw.order)).length;
                return (
                  <LessonCard
                    key={sw.id}
                    open={open}
                    done={sDone.has(sw.id)}
                    fidel={[0, 1, 3, 7].map((f) => FAMS[f].chars[sw.order]).join("")}
                    title={`${sw.title} · part ${sw.part}`}
                    blurb={sw.blurb}
                    count={`${n}/${sw.fams.length}`}
                    onClick={() => onStart({ kind: "sweep", id: sw.id, fams: sw.fams, orders: [sw.order], doneLabel: `${ORDERS[sw.order].v} column, part ${sw.part}` })}
                  />
                );
              })}
            </>
          )}
        </>
      ) : (
        <>
          <StageHeader
            open={openStages.rows}
            onToggle={() => toggleStage("rows")}
            title="Rows, four at a time"
            done={UNITS.filter((u) => uDone.has(u.n)).length}
            total={UNITS.length}
            style={{ margin: "0 0 10px" }}
          />
          {openStages.rows && UNITS.map((u, i) => {
            const open = i === 0 || uDone.has(UNITS[i - 1].n);
            const n = u.fams.reduce((a, f) => a + ORDERS.filter((_, o) => solid(f, o)).length, 0);
            return (
              <LessonCard
                key={u.n}
                open={open}
                done={uDone.has(u.n)}
                fidel={u.fams.map((f) => FAMS[f].chars[0]).join("")}
                title={u.title}
                blurb={u.blurb}
                count={`${n}/${u.fams.length * 7}`}
                onClick={() => onStart({ kind: "unit", id: u.n, fams: u.fams, orders: [0, 1, 2, 3, 4, 5, 6], doneLabel: `Unit ${u.n} cleared` })}
              />
            );
          })}
        </>
      )}

      <div className="rule" />

      <button className="card" onClick={onSpeed} disabled={known.size < 6}>
        <div className="card-head"><span className="card-fidel">ፍጥነት</span></div>
        <div className="row-sp">
          <span className="card-title">Speed round</span>
          <span className="pill">{known.size < 6 ? "locked" : `best ${state.bestSpeed}`}</span>
        </div>
        <div className="card-blurb" style={{ marginTop: 4 }}>
          Sixty seconds, no hints. This is what turns recognition into reflex.
        </div>
      </button>

      <Badges state={state} known={known} level={level} allBases={allBases} audioCount={audioCount} />

      <p className="note" style={{ marginTop: 14, textAlign: "center", fontSize: 11.5 }}>
        Both tracks feed the same chart, the same review queue, and the same writing practice. Switching
        between them costs you nothing.
      </p>
    </div>
  );
}

/* ============================================================
   APP
   ============================================================ */

export default function AmharicFidel() {
  const [state, setState] = useState(null);
  const [tab, setTab] = useState("learn");
  const [track, setTrack] = useState("bases");
  const [haveAudio, setHaveAudio] = useState(new Set());
  const [officialHave, setOfficialHave] = useState(new Set());
  const [wordTab, setWordTab] = useState("read");
  const [lesson, setLesson] = useState(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const introChecked = useRef(false);

  useEffect(() => {
    notifySaveFailure = () => setSaveFailed(true);
    return () => { notifySaveFailure = () => {}; };
  }, []);

  // Home renders immediately either way -- this only decides whether the
  // Spotlight overlay auto-opens on top of it once state has actually
  // loaded (state starts null; see loadState() above). introChecked
  // guards against re-opening on every later state change once this
  // has run once.
  useEffect(() => {
    if (state && !introChecked.current) {
      introChecked.current = true;
      if (!state.seenIntro.includes("app-tour")) setShowTour(true);
    }
  }, [state]);

  // Whatever verified official clips actually exist, if any — see
  // officialAudioUrl/officialKeyFromFilename above. A missing or
  // unparseable manifest just leaves this empty rather than throwing,
  // same graceful-degradation behavior as everything else audio-related:
  // "hear it" simply won't offer that tier for anyone until a real,
  // verified batch has actually been generated and deployed.
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}audio/official/manifest.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((names) => {
        const keys = new Set();
        (Array.isArray(names) ? names : []).forEach((n) => {
          const k = officialKeyFromFilename(n);
          if (k) keys.add(k);
        });
        setOfficialHave(keys);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadState().then((s) => {
      const t = todayStamp();
      const y = new Date(Date.now() - DAY);
      const ys = `${y.getFullYear()}-${y.getMonth()}-${y.getDate()}`;
      const rolled = rollStreak({ streakDays: s.streakDays, streakFreezes: s.streakFreezes, lastDay: s.lastDay, yesterdayStamp: ys, todayDay: t });
      s.streakDays = rolled.streakDays;
      s.streakFreezes = rolled.streakFreezes;
      s.lastDay = t;
      s.today = applyTodayPatch(s.today, t, {}).today;
      s.basesDone = s.basesDone || [];
      s.sweepsDone = s.sweepsDone || [];
      if (!s.startDate) s.startDate = Date.now();
      setState(s);
      if (s.track) setTrack(s.track);
      loadAudIndex().then(setHaveAudio);
    });
  }, []);

  // cards/xp are here specifically so a finished lesson (including a
  // review session, which never touches basesDone/sweepsDone/unitsDone)
  // always counts as structural, matching saveState's own "anything
  // you'd be upset to lose" comment -- an earlier version of this list
  // omitted them, so a completed review only got the 250ms-debounced
  // save like routine progress.
  const lastSig = useRef("");
  useEffect(() => {
    if (!state) return;
    const sig = JSON.stringify([
      state.basesDone, state.sweepsDone, state.unitsDone,
      state.bestSpeed, state.startDate, state.cards, state.xp, track,
    ]);
    const structural = sig !== lastSig.current;
    lastSig.current = sig;
    saveState({ ...state, track }, structural);
  }, [state, track]);

  // Once a device is linked (SyncPanel, on the Chart tab), push whatever
  // changed — progress or a new/removed recording — up automatically, so
  // the other device sees it on its next open. No-op, silently, if this
  // device was never linked or the request fails; sync is best-effort by
  // design, not something a lesson should ever block on.
  useEffect(() => {
    if (!state) return;
    const code = getSavedSyncCode();
    if (!code) return;
    const t = setTimeout(() => {
      gatherBundle().then((bundle) => pushBundle(code, bundle)).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [state, haveAudio]);

  // phones background apps without warning; get it to disk before that happens
  useEffect(() => {
    const f = () => flushSave();
    const vis = () => {
      if (document.visibilityState === "hidden") flushSave();
    };
    window.addEventListener("pagehide", f);
    window.addEventListener("blur", f);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("pagehide", f);
      window.removeEventListener("blur", f);
      document.removeEventListener("visibilitychange", vis);
      f();
    };
  }, []);

  const pool = useMemo(() => {
    if (!state) return [];
    const seen = new Set();
    const p = [];
    const add = (f, o) => {
      const k = key(f, o);
      if (!seen.has(k)) { seen.add(k); p.push({ fam: f, order: o }); }
    };
    const uD = state.unitsDone || [], bD = state.basesDone || [], sD = state.sweepsDone || [];
    UNITS.forEach((u) => { if (uD.includes(u.n)) u.fams.forEach((f) => ORDERS.forEach((_, o) => add(f, o))); });
    BASE_BATCHES.forEach((b) => { if (bD.includes(b.id)) b.fams.forEach((f) => add(f, 0)); });
    SWEEPS.forEach((sw) => { if (sD.includes(sw.id)) sw.fams.forEach((f) => add(f, sw.order)); });
    return p;
  }, [state]);

  const unlockedFams = useMemo(() => new Set(pool.map((p) => p.fam)), [pool]);
  const known = useMemo(() => new Set(pool.map((p) => FAMS[p.fam].chars[p.order])), [pool]);

  const due = useMemo(() => {
    if (!state) return [];
    const now = Date.now();
    return pool.filter((p) => {
      const c = state.cards[key(p.fam, p.order)];
      return c && c.lvl > 0 && c.due <= now;
    });
  }, [state, pool]);

  if (!state) {
    return (
      <div className="fd">
        <style>{CSS}</style>
        <div className="wrap" style={{ paddingTop: 80, textAlign: "center" }}>
          <div className="gz" style={{ fontSize: 40, color: "var(--rubric)" }}>ፊደል</div>
        </div>
      </div>
    );
  }

  const level = Math.floor(state.xp / 250) + 1;
  const pct = ((state.xp % 250) / 250) * 100;

  // Rolls a same-day quest-progress patch into state.today (see
  // src/lib/gamification.js), returning both the updated today object
  // and any bonus XP a quest just newly completed — call inside a
  // setState updater alongside whatever else that action already does,
  // same pattern at every XP-earning call site below.
  const bumpToday = (s, patch) => applyTodayPatch(s.today, todayStamp(), patch);

  const grade = (results) => {
    const now = Date.now();
    setState((s) => {
      const cards = { ...s.cards };
      results.forEach((r) => {
        const k = key(r.fam, r.order);
        const c = cards[k] || { lvl: 0, seen: 0, due: now };
        const lvl = r.ok ? Math.min(6, c.lvl + 1) : Math.max(0, c.lvl - 1);
        cards[k] = { lvl, seen: c.seen + 1, due: now + INTERVALS[lvl] * DAY };
      });
      return { ...s, cards };
    });
  };

  const addXp = (n) => setState((s) => {
    const { today, bonusXp } = bumpToday(s, { xp: n });
    return { ...s, xp: s.xp + n + bonusXp, today };
  });
  const audio = {
    have: haveAudio,
    official: officialHave,
    onSaved: (idx) => setHaveAudio(new Set(idx)),
  };

  const resetAll = () => {
    const fresh = { ...emptyState(), startDate: Date.now(), lastDay: todayStamp(), streakDays: 1, today: emptyToday(todayStamp()) };
    lastSig.current = "";
    setState(fresh);
    saveState({ ...fresh, track }, true);
  };

  // Marks a tour step / callout as seen — app-tour for the first-launch
  // walkthrough, cb-* ids for the in-place tips (see Callout).
  const markSeen = (id) =>
    setState((s) => (s.seenIntro.includes(id) ? s : { ...s, seenIntro: [...s.seenIntro, id] }));

  if (lesson) {
    return (
      <div className="fd">
        <style>{CSS}</style>
        <Lesson
          spec={lesson}
          state={state}
          pool={pool}
          audio={audio}
          onExit={() => setLesson(null)}
          onDone={(results, xp) => {
            grade(results);
            setState((s) => {
              const correct = results.filter((r) => r.ok).length;
              const { today, bonusXp } = bumpToday(s, { xp, lessonsDone: 1, correct });
              const n = { ...s, xp: s.xp + xp + bonusXp, today };
              if (lesson.kind === "base" && !n.basesDone.includes(lesson.id)) n.basesDone = [...n.basesDone, lesson.id];
              if (lesson.kind === "sweep" && !n.sweepsDone.includes(lesson.id)) n.sweepsDone = [...n.sweepsDone, lesson.id];
              if (lesson.kind === "unit" && !n.unitsDone.includes(lesson.id)) n.unitsDone = [...n.unitsDone, lesson.id];
              return n;
            });
            setLesson(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="fd">
      <style>{CSS}</style>

      <div className="top" data-tour="topbar">
        <span className="mark">ፊ</span>
        <span className="chip">lv <b>{level}</b></span>
        <div className="xpbar"><div className="xpfill" style={{ width: `${pct}%` }} /></div>
        <span className="chip"><b>{state.xp}</b> xp</span>
        <button
          onClick={() => setShowTour(true)}
          title="Show the tour again"
          style={{ color: "var(--dim)", fontSize: 13, fontWeight: 700, width: 22, height: 22, borderRadius: "50%", border: "1px solid var(--line)", flexShrink: 0 }}
        >
          ?
        </button>
      </div>

      {saveFailed && (
        <div className="wrap" style={{ paddingTop: 10 }}>
          <div className="row-sp card" style={{ borderColor: "var(--rubric)", padding: "10px 14px" }}>
            <span className="note" style={{ color: "var(--rubric)", fontSize: 12 }}>
              Couldn't save just now — your device may be low on storage. Progress from this session
              may not stick if you close the app.
            </span>
            <button onClick={() => setSaveFailed(false)} style={{ color: "var(--dim)", fontSize: 16, padding: "0 0 0 10px" }}>✕</button>
          </div>
        </div>
      )}

      <div className="grow" style={{ display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {tab === "learn" && (
          <Home
            state={state}
            level={level}
            known={known}
            dueCount={due.length}
            track={track}
            setTrack={setTrack}
            onStart={(spec) => setLesson(spec)}
            onSpeed={() => setTab("speed")}
            onReview={() => setLesson({ kind: "review", id: "rev", fams: [], orders: [], doneLabel: "Review done" })}
            seenIntro={state.seenIntro}
            onSeen={markSeen}
            audioCount={haveAudio.size}
          />
        )}
        {tab === "chart" && (
          <Chart
            cards={state.cards}
            unlockedFams={unlockedFams}
            audio={audio}
            onReset={resetAll}
            seenIntro={state.seenIntro}
            onSeen={markSeen}
            level={level}
            xp={state.xp}
            streakDays={state.streakDays}
          />
        )}
        {tab === "words" && (
          <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
            <div className="wrap" style={{ paddingTop: 12 }}>
              <div style={{ display: "flex", gap: 6, background: "var(--ink2)", padding: 4, borderRadius: 12, border: "1px solid var(--line)" }}>
                {[["read", "Read sentences"], ["build", "Spell words"]].map(([id, label]) => (
                  <button key={id} onClick={() => setWordTab(id)} style={{
                    flex: 1, padding: "8px 6px", borderRadius: 9, fontSize: 12.5, fontWeight: 600,
                    background: wordTab === id ? "var(--rubric)" : "transparent",
                    color: wordTab === id ? "#fff" : "var(--dim)",
                  }}>{label}</button>
                ))}
              </div>
            </div>
            {wordTab === "read" ? (
              <Reader known={known} audio={audio} />
            ) : (
              <WordBuild pool={pool} unlockedChars={known} onXp={addXp} />
            )}
          </div>
        )}
        {tab === "write" && (
          <Trace
            letters={
              pool.length
                ? pool
                    .slice()
                    .sort((a, b) => a.fam - b.fam || a.order - b.order)
                    .map((p) => FAMS[p.fam].chars[p.order])
                : []
            }
            onXp={addXp}
          />
        )}
        {tab === "speed" &&
          (pool.length < 6 ? (
            <div className="wrap" style={{ paddingTop: 50, textAlign: "center" }}>
              <p className="note">Finish one lesson first. The speed round needs a pool to draw from.</p>
              <button className="btn ghost" style={{ maxWidth: 200, margin: "20px auto 0" }} onClick={() => setTab("learn")}>Back</button>
            </div>
          ) : (
            <div className="grow">
              <div className="wrap" style={{ paddingTop: 10 }}>
                <button className="speaker" onClick={() => setTab("learn")}>← back</button>
              </div>
              <Speed
                pool={pool}
                best={state.bestSpeed}
                onEnd={(sc) => setState((s) => {
                  const { today, bonusXp } = bumpToday(s, { xp: sc * 5, speedPlayed: 1 });
                  return { ...s, xp: s.xp + sc * 5 + bonusXp, bestSpeed: Math.max(s.bestSpeed, sc), today };
                })}
              />
            </div>
          ))}
      </div>

      <div className="tabs" data-tour="tabs">
        {[["learn", "ት", "learn"], ["chart", "ፊ", "chart"], ["words", "ቃ", "read"], ["write", "ጽ", "write"]].map(
          ([id, g, label]) => (
            <button key={id} className={"tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>
              <span className="tg">{g}</span>
              <span className="tl">{label}</span>
            </button>
          )
        )}
      </div>

      {showTour && (
        <Spotlight
          onDone={() => {
            setShowTour(false);
            markSeen("app-tour");
          }}
        />
      )}
    </div>
  );
}
