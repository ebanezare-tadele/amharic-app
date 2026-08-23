import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabaseConfigured } from "./lib/supabaseClient.js";
import { getCachedPasscode, setCachedPasscode, verifyPasscode } from "./lib/familyPasscode.js";

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

// [chars, consonant, display name, optional note]
const RAW = [
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
  ["ሐሑሒሓሔሕሖ", "h", "hä", "Sounds identical to ሀ today. Kept apart in spelling only."],
  ["ኀኁኂኃኄኅኆ", "h", "hä", "A third h. Same sound as ሀ and ሐ."],
  ["ሠሡሢሣሤሥሦ", "s", "sä", "Sounds identical to ሰ. Spelling-only distinction."],
  ["ዐዑዒዓዔዕዖ", "'", "ä", "Sounds identical to አ."],
  ["ፀፁፂፃፄፅፆ", "ts'", "ts'ä", "Sounds identical to ጸ."],
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

const PHRASES = [
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
const ANCHORS = [
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

const GEEZ_NUM = [
  ["፩", 1], ["፪", 2], ["፫", 3], ["፬", 4], ["፭", 5],
  ["፮", 6], ["፯", 7], ["፰", 8], ["፱", 9], ["፲", 10],
  ["፳", 20], ["፴", 30], ["፵", 40], ["፶", 50], ["፻", 100],
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
  romanize: true,
  cards: {},
  unitsDone: [],
  basesDone: [],
  sweepsDone: [],
  streakDays: 0,
  lastDay: null,
  bestSpeed: 0,
  seenIntro: [],
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

function flushSave() {
  if (!pendingSave) return;
  const p = pendingSave;
  pendingSave = null;
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    window.storage.set("fidel:v1", JSON.stringify(p));
  } catch (e) {
    /* memory-only session */
  }
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
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  -webkit-font-smoothing: antialiased;
}
.fd * { box-sizing: border-box; }
.fd button { font-family: inherit; cursor: pointer; border: none; background: none; color: inherit; }
.fd button:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }

.wrap { width: 100%; max-width: 540px; margin: 0 auto; padding: 0 16px; }
.grow { flex: 1; }

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
.chart table { border-collapse: collapse; }
.chart th { font-size: 9px; letter-spacing: .1em; color: var(--dim); font-weight: 600; padding: 4px 0 8px; text-transform: uppercase; }
.chart td { padding: 0; }
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

function Speak({ text, status }) {
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
  if (!voice)
    return status ? (
      <div className="note" style={{ fontSize: 11, marginTop: 4 }}>
        No Amharic voice installed on this device — record your own below.
      </div>
    ) : null;
  return (
    <button
      className="speaker"
      onClick={() => {
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.lang = voice.lang;
        u.rate = 0.85;
        window.speechSynthesis.speak(u);
      }}
    >
      ► hear it
    </button>
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

// no Latin anywhere — orders are named the way Amharic names them
const KINDS_FIDEL = {
  base: ["anchor", "anchor2"],
  sweep: ["transform", "orderName", "match"],
  unit: ["row", "orderName", "match"],
};

const kindsFor = (lessonKind, romanize) =>
  (romanize ? KINDS : KINDS_FIDEL)[lessonKind] || (romanize ? KINDS.unit : KINDS_FIDEL.unit);

function buildSession(targets, pool, reviews, kinds, romanize) {
  const q = [];
  targets.forEach((t) => {
    q.push(makeQ(t, pool, kinds));
    q.push(makeQ(t, pool, kinds));
  });
  pick(reviews, targets.length ? 4 : 18).forEach((r) =>
    q.push(makeQ(r, pool, kindsFor("unit", romanize)))
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
      <div className="wrap grow" style={{ paddingTop: 18 }}>
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
        <div style={{ textAlign: "center", marginTop: 12 }}><Speak text={F.chars[0]} /></div>

        {ARTIC[F.id] && (
          <div className="card" style={{ marginTop: 16, borderColor: "var(--gold)" }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>How to make the sound</div>
            <div className="note" style={{ color: "var(--bone)", fontSize: 13 }}>{ARTIC[F.id]}</div>
          </div>
        )}

        {audio && (
          <div style={{ marginTop: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Your voice</div>
            <Voice fam={F.id} order={0} have={audio.have.get(`${F.id}.0`)} scope={audio.scope} onSaved={audio.onSaved} />
          </div>
        )}

        <div className="rule" />

        {A && A[0] ? (
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Where you'll meet it</div>
            <div className="gz" style={{ fontSize: 34 }}>{A[0]}</div>
            <div className="note"><b style={{ color: "var(--bone)" }}>{A[1]}</b> — {A[2]}</div>
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
        <Chant fam={F.id} compact />
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
      <div className="wrap grow" style={{ paddingTop: 18 }}>
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

function FamilyIntro({ fams, i, onNext, onBack }) {
  const F = FAMS[fams[i]];
  return (
    <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
      <div className="wrap grow" style={{ paddingTop: 18 }}>
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
        <div style={{ textAlign: "center", marginBottom: 18 }}><Speak text={F.chars[0]} /></div>
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

function Lesson({ spec, state, pool, romanize, audio, onDone, onExit }) {
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
  const results = useRef([]);

  const qkinds = kind === "review" ? kindsFor("unit", romanize) : kindsFor(kind, romanize);

  const startDrills = useCallback(() => {
    const targets = [];
    fams.forEach((f) => orders.forEach((o) => targets.push({ fam: f, order: o })));
    const reviews = pool.filter(
      (p) => !targets.some((t) => t.fam === p.fam && t.order === p.order)
    );
    const b = targets.length ? [...pool, ...targets] : pool;
    bank.current = b;
    setQueue(buildSession(pick(targets, 9), b, reviews, qkinds, romanize));
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
    return <FamilyIntro fams={fams} i={introI} onNext={next} onBack={onExit} />;
  }

  if (phase === "done") {
    const acc = Math.round((got / Math.max(1, got + missed)) * 100);
    const badge =
      kind === "sweep" ? FAMS[3].chars[orders[0]] : kind === "review" ? "ደግ" : FAMS[fams[0]].chars[0];
    return (
      <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
        <div className="wrap grow" style={{ paddingTop: 40, textAlign: "center" }}>
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
    if (ok) setGot(got + 1);
    else {
      setMissed(missed + 1);
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
      <div className="wrap grow">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
          <button onClick={onExit} style={{ color: "var(--dim)", fontSize: 20, lineHeight: 1 }}>✕</button>
          <div className="xpbar">
            <div className="xpfill" style={{ width: `${(qi / queue.length) * 100}%` }} />
          </div>
          <span className="chip"><b>{qi + 1}</b>/{queue.length}</span>
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
              <span className={romanize ? "disp" : "gz"} style={{ fontSize: romanize ? 52 : 30, color: "var(--rubric)" }}>
                {romanize ? ORDERS[q.order].v : ORDERS[q.order].am}
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
          <button className="btn" onClick={next}>Continue</button>
        </div>
      ) : (
        <div className="verdict">
          <div className="vsub">
            {["vowel", "orderName", "match"].includes(q.kind)
              ? "Look at the right side of the letter. That's where the mark lives."
              : kind === "base"
              ? "Bare consonant — no vowel mark yet."
              : romanize
              ? `Order ${q.order + 1} · ${ORDERS[q.order].say}`
              : `${ORDERS[q.order].am} · ደረጃ ${q.order + 1}`}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   WORD BUILDER
   ============================================================ */

function WordBuild({ pool, unlockedChars, romanize, onXp }) {
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
      <div className="wrap grow" style={{ paddingTop: 20 }}>
        <div className="eyebrow">Spell it out</div>
        <div className="disp" style={{ fontSize: 34, margin: "4px 0 2px" }}>
          {w[2]}
        </div>
        <div className="note" style={{ marginBottom: 24 }}>
          {romanize && (
            <>
              sounds like <b style={{ color: "var(--bone)" }}>{w[1]}</b> ·{" "}
            </>
          )}
          {target.length} letters
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
            {romanize
              ? ` · ${w[1]} · ` +
                target.map((c) => (CHAR_MAP[c] ? FAMS[CHAR_MAP[c].fam].rom[CHAR_MAP[c].order] : c)).join(" · ")
              : ` · ${w[2]}`}
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

function Speed({ pool, best, romanize, onEnd }) {
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
    setQ({ rom, base: FAMS[tgt.fam].chars[0], am: ORDERS[tgt.order].am, correct: opts[0], options: shuffle(opts) });
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
        className={romanize ? "prompt-rom" : "gz"}
        style={{
          textAlign: "center",
          margin: romanize ? "34px 0" : "28px 0",
          fontSize: romanize ? undefined : 30,
          color: flash === "ok" ? "var(--verd)" : flash === "no" ? "var(--rubric)" : "var(--bone)",
        }}
      >
        {romanize ? q.rom : (
          <>
            <span style={{ fontSize: 48 }}>{q.base}</span>
            <span style={{ margin: "0 10px", color: "var(--dim)" }}>→</span>
            {q.am}
          </>
        )}
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
   CHART
   ============================================================ */

function Chart({ cards, unlockedFams, audio, onReset }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [sel, setSel] = useState(null);
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
        <div className="card" style={{ borderColor: audio.have.size ? "var(--verd)" : "var(--gold)" }}>
          <div className="row-sp">
            <span className="card-title" style={{ fontSize: 17 }}>Record the sounds yourself</span>
            <span className="pill">{audio.have.size} saved</span>
          </div>
          <div className="card-blurb" style={{ marginTop: 4 }}>
            No phone ships an Amharic voice, and this app can't reach a cloud one. So tap any letter below
            and record it — yours, or better, a relative's. Thirty-four base letters is about ten minutes of
            someone's time, and it beats any synthetic voice you'd get. Clips play back everywhere that
            letter shows up.
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 12, background: "var(--ink)", padding: 4, borderRadius: 10 }}>
            {[["me", "Just me"], ["all", "Everyone"]].map(([id, label]) => (
              <button
                key={id}
                onClick={(e) => { e.stopPropagation(); audio.setScope(id); }}
                style={{
                  flex: 1, padding: "7px 6px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                  background: audio.scope === id ? "var(--rubric)" : "transparent",
                  color: audio.scope === id ? "#fff" : "var(--dim)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="note" style={{ marginTop: 8, fontSize: 11.5 }}>
            {audio.scope === "all"
              ? "New recordings go to shared storage — anyone who opens this app will hear them, and they can overwrite them (you'll be asked to confirm first). Use this when you're recording for the family."
              : "New recordings stay on your account only. Nobody else sees them. Everyone gets their own progress either way."}
          </div>
          <div className="note" style={{ marginTop: 10, fontSize: 11, borderTop: "1px solid var(--line)", paddingTop: 9 }}>
            Nothing here asks for your name, email, or any account info — progress and clips are tied to
            the app, not to you. Your own progress and "Just me" recordings never leave this device — no
            analytics, nothing sent anywhere else. "Everyone" recordings sync to a shared server so the
            rest of the family can hear them, and writing to it needs the family passcode so a stranger
            with just the link can't overwrite or spam it. Anything you record, you can remove again with
            the ✕ next to it.
          </div>
        </div>
      )}

      <div className="chart">
        <table>
          <thead>
            <tr>
              <th style={{ width: 44 }} />
              {ORDERS.map((o) => (
                <th key={o.n}>
                  <span className="gz" style={{ fontSize: 10, display: "block", color: "var(--dim)" }}>{o.am}</span>
                  {o.v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FAMS.map((f) => (
              <tr key={f.id} style={{ opacity: unlockedFams.has(f.id) ? 1 : 0.3 }}>
                <td>
                  <div style={{ fontSize: 11, color: "var(--dim)", width: 44, fontWeight: 600 }}>
                    {f.cons === "'" ? "—" : f.cons}
                  </div>
                </td>
                {f.chars.map((c, o) => {
                  const lvl = (cards[key(f.id, o)] || {}).lvl || 0;
                  const cl = lvl >= 5 ? "l4" : lvl >= 3 ? "l3" : lvl >= 1 ? "l2" : unlockedFams.has(f.id) ? "l1" : "";
                  return (
                    <td key={o}>
                      <button className={"cc " + cl} onClick={() => setSel({ f: f.id, o })}>
                        {c}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && (
        <div className="card" style={{ marginTop: 18, borderColor: "var(--rubric)" }}>
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
          <div className="rule" style={{ margin: "12px 0" }} />
          <div className="note">{ORDERS[sel.o].hint}.</div>
          {FAMS[sel.f].note && (
            <div className="note" style={{ marginTop: 6, color: "var(--gold)" }}>{FAMS[sel.f].note}</div>
          )}
          {ARTIC[sel.f] && (
            <div className="note" style={{ marginTop: 6, color: "var(--gold)" }}>{ARTIC[sel.f]}</div>
          )}
          <div className="rule" style={{ margin: "12px 0" }} />
          <Chant fam={sel.f} />
          <div className="rule" style={{ margin: "12px 0" }} />
          <div className="eyebrow" style={{ marginBottom: 6 }}>Your voice</div>
          {audio && (
            <Voice
              fam={sel.f}
              order={sel.o}
              have={audio.have.get(`${sel.f}.${sel.o}`)}
              scope={audio.scope}
              onSaved={audio.onSaved}
            />
          )}
          <div style={{ marginTop: 8 }}>
            <Speak text={FAMS[sel.f].chars[sel.o]} status />
          </div>
        </div>
      )}

      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 8 }}>Ge'ez numerals</div>
      <p className="note" style={{ marginBottom: 10, fontSize: 11.5 }}>
        Still used on clock faces, church calendars, and chapter headings. Everyday writing uses 1 2 3.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {GEEZ_NUM.map(([g, n]) => (
          <div key={n} style={{ background: "var(--ink2)", border: "1px solid var(--line)", borderRadius: 9, padding: "7px 10px", textAlign: "center", minWidth: 48 }}>
            <div className="gz" style={{ fontSize: 20 }}>{g}</div>
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
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        Phrases worth knowing
      </div>
      {PHRASES.map((p) => (
        <div key={p[0]} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
          <div className="gz" style={{ fontSize: 24 }}>
            {p[0]}
          </div>
          <div className="note">
            <b style={{ color: "var(--bone)" }}>{p[1]}</b> — {p[2]}
          </div>
        </div>
      ))}

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
   VOICE
   No phone ships an Amharic voice and the sandbox can't call a
   cloud one, so the audio here is yours. Record a letter once
   and it plays back everywhere that letter appears.
   ============================================================ */

const audCache = new Map();
const IDX_KEY = { me: "aud:index", all: "aud:shared-index" };

// have = Map of "fam.order" -> "me" | "all". Personal wins over shared.
async function loadAudIndex() {
  const out = new Map();
  for (const scope of ["all", "me"]) {
    try {
      const r = await window.storage.get(IDX_KEY[scope], scope === "all");
      JSON.parse(r.value).forEach((k) => out.set(k, scope));
    } catch (e) {}
  }
  return out;
}

async function readMap(f, scope) {
  try {
    const r = await window.storage.get("aud:f" + f, scope === "all");
    return JSON.parse(r.value) || {};
  } catch (e) {
    return {};
  }
}

async function getClip(f, o, scope) {
  const ck = `${scope}:${f}.${o}`;
  if (audCache.has(ck)) return audCache.get(ck);
  const m = await readMap(f, scope);
  Object.entries(m).forEach(([oo, v]) => audCache.set(`${scope}:${f}.${oo}`, v));
  return m[o] || null;
}

async function putClip(f, o, url, scope) {
  const m = await readMap(f, scope);
  m[o] = url;
  await window.storage.set("aud:f" + f, JSON.stringify(m), scope === "all");
  audCache.set(`${scope}:${f}.${o}`, url);
  const idx = await loadAudIndex();
  idx.set(`${f}.${o}`, scope);
  await window.storage.set(
    IDX_KEY[scope],
    JSON.stringify([...idx].filter(([, v]) => v === scope).map(([k]) => k)),
    scope === "all"
  );
  return idx;
}

// Anyone should be able to pull back something they recorded — including
// by mistake, or a clip they no longer want other family members hearing.
async function deleteClip(f, o, scope) {
  const m = await readMap(f, scope);
  delete m[o];
  await window.storage.set("aud:f" + f, JSON.stringify(m), scope === "all");
  audCache.delete(`${scope}:${f}.${o}`);
  const idx = await loadAudIndex();
  idx.delete(`${f}.${o}`);
  await window.storage.set(
    IDX_KEY[scope],
    JSON.stringify([...idx].filter(([, v]) => v === scope).map(([k]) => k)),
    scope === "all"
  );
  return idx;
}

function Voice({ fam, order, have, scope, onSaved }) {
  const [st, setSt] = useState("idle"); // idle | rec | busy
  const [err, setErr] = useState(null);
  const [confirmOver, setConfirmOver] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [passErr, setPassErr] = useState(null);
  const [checking, setChecking] = useState(false);
  const mr = useRef(null);
  const fileRef = useRef(null);
  const pendingUrl = useRef(null);
  const pendingAction = useRef(null);

  // Writing to the shared "Everyone" scope needs the family passcode —
  // reads (play) never do. Cached in this browser after the server
  // verifies it once, so this only interrupts the first shared write.
  const gate = (action) => {
    if (scope !== "all" || !supabaseConfigured || getCachedPasscode()) return true;
    pendingAction.current = action;
    setPassErr(null);
    setNeedsPasscode(true);
    return false;
  };

  const submitPasscode = async () => {
    if (!passInput) return;
    setChecking(true);
    const res = await verifyPasscode(passInput);
    setChecking(false);
    if (!res.ok) return setPassErr(res.error || "Wrong passcode.");
    setCachedPasscode(passInput);
    setPassInput("");
    setNeedsPasscode(false);
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action) action();
  };

  const play = async () => {
    const url = (await getClip(fam, order, have || "me")) || (await getClip(fam, order, "all"));
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
      const idx = await putClip(fam, order, url, scope);
      onSaved(idx);
      setErr(null);
    } catch (e) {
      setErr("Couldn't save that clip.");
    }
    setSt("idle");
    setConfirmOver(false);
    pendingUrl.current = null;
  };

  const save = (url) => {
    if (url.length > 700000) {
      setSt("idle");
      return setErr("That clip is too long. Aim for about a second.");
    }
    // Overwriting your own scope is your business. Overwriting the shared
    // family copy replaces what everyone else hears, silently, unless we ask.
    if (scope === "all" && have === "all") {
      pendingUrl.current = url;
      setSt("idle");
      setConfirmOver(true);
      return;
    }
    commit(url);
  };

  const start = async () => {
    if (!gate(start)) return;
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
    const proceed = () => {
      const fr = new FileReader();
      fr.onload = () => save(fr.result);
      fr.readAsDataURL(f);
    };
    if (!gate(proceed)) return;
    proceed();
  };

  const del = async () => {
    if (!confirmDel) return setConfirmDel(true);
    if (!gate(del)) return;
    setSt("busy");
    try {
      const idx = await deleteClip(fam, order, have || scope);
      onSaved(idx);
      setErr(null);
    } catch (e) {
      setErr("Couldn't remove that clip.");
    }
    setSt("idle");
    setConfirmDel(false);
  };

  if (needsPasscode) {
    return (
      <div>
        <div className="note" style={{ color: "var(--bone)", marginBottom: 8, fontSize: 12.5 }}>
          Recording for the family needs the shared passcode. Ask whoever set this app up if you don't
          have it.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="password"
            inputMode="text"
            autoComplete="off"
            value={passInput}
            onChange={(e) => setPassInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitPasscode()}
            placeholder="family passcode"
            style={{
              flex: 1, minWidth: 140, background: "var(--ink)", border: "1px solid var(--line)",
              borderRadius: 20, padding: "6px 14px", color: "var(--bone)", fontSize: 12,
            }}
          />
          <button
            className="speaker"
            style={{ borderColor: "var(--rubric)", color: "var(--rubric)" }}
            disabled={checking || !passInput}
            onClick={submitPasscode}
          >
            {checking ? "checking…" : "unlock"}
          </button>
          <button
            className="speaker"
            onClick={() => { setNeedsPasscode(false); setPassInput(""); pendingAction.current = null; }}
          >
            cancel
          </button>
        </div>
        {passErr && <div className="note" style={{ color: "var(--rubric)", marginTop: 6, fontSize: 11.5 }}>{passErr}</div>}
      </div>
    );
  }

  if (confirmOver) {
    return (
      <div>
        <div className="note" style={{ color: "var(--gold)", marginBottom: 8, fontSize: 12.5 }}>
          This replaces the clip everyone in the family currently hears for this letter. Keep going?
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="speaker" onClick={() => { setConfirmOver(false); pendingUrl.current = null; }}>
            cancel
          </button>
          <button
            className="speaker"
            style={{ borderColor: "var(--rubric)", color: "var(--rubric)" }}
            onClick={() => commit(pendingUrl.current)}
          >
            replace it
          </button>
        </div>
      </div>
    );
  }

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
      {have === "all" && !confirmDel && (
        <div className="note" style={{ marginTop: 6, fontSize: 11 }}>
          This clip is shared — anyone using the app can hear it and re-record over it.
        </div>
      )}
      {err && <div className="note" style={{ color: "var(--rubric)", marginTop: 6, fontSize: 11.5 }}>{err}</div>}
    </div>
  );
}

/* ============================================================
   CHANT
   The row recited in rhythm — the oldest way this gets taught,
   and the one thing you already have.
   ============================================================ */

function Chant({ fam, compact }) {
  const F = FAMS[fam];
  const [i, setI] = useState(-1);
  const [tempo, setTempo] = useState(620);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);
  useEffect(() => {
    setI(-1);
    clearInterval(timer.current);
  }, [fam]);

  const play = () => {
    clearInterval(timer.current);
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
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
          <button className="speaker" onClick={play}>► chant the row</button>
          <button className="speaker" onClick={() => setTempo(tempo === 620 ? 900 : tempo === 900 ? 400 : 620)}>
            {tempo === 620 ? "steady" : tempo === 900 ? "slow" : "fast"}
          </button>
        </div>
      )}
      {compact && (
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <button className="speaker" onClick={play}>► chant the row</button>
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

function Trace({ letters, romanize, onXp }) {
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

  const down = (e) => {
    if (score !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    dirty.current = true;
    const x = inkRef.current.getContext("2d");
    const [a, b] = pos(e);
    x.strokeStyle = "#EDE3CE";
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
  };

  const up = () => {
    drawing.current = false;
  };

  const check = () => {
    if (!dirty.current || !maskRef.current) return;
    const d = inkRef.current.getContext("2d").getImageData(0, 0, PAD, PAD).data;
    const step = PAD / CELLS;
    const u = new Uint8Array(CELLS * CELLS);
    for (let py = 0; py < PAD; py++) {
      for (let px = 0; px < PAD; px++) {
        if (d[(py * PAD + px) * 4 + 3] > 60) {
          u[Math.floor(py / step) * CELLS + Math.floor(px / step)] = 1;
        }
      }
    }
    const g = maskRef.current;
    let gTot = 0, uTot = 0, hit = 0;
    for (let k = 0; k < g.length; k++) {
      if (g[k]) gTot++;
      if (u[k]) uTot++;
      if (g[k] && u[k]) hit++;
    }
    const coverage = gTot ? hit / gTot : 0;
    const spill = uTot ? (uTot - hit) / uTot : 1;
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
      <div className="wrap grow" style={{ paddingTop: 14 }}>
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
            {info ? (romanize ? `${FAMS[info.fam].rom[info.order]} · ${ORDERS[info.order].am}` : ORDERS[info.order].am) : "write it"}
          </span>
          <span className="pill">{i + 1} of {letters.length}</span>
        </div>

        {mode === "memory" && score === null && (
          <div
            className={romanize ? "disp" : "gz"}
            style={{ fontSize: romanize ? 40 : 24, textAlign: "center", marginBottom: 6 }}
          >
            {!info ? "" : romanize ? FAMS[info.fam].rom[info.order] : (
              <>
                <span style={{ fontSize: 40 }}>{FAMS[info.fam].chars[0]}</span>
                <span style={{ margin: "0 10px", color: "var(--dim)" }}>→</span>
                {ORDERS[info.order].am}
              </>
            )}
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

function Reader({ known, romanize, audio }) {
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
      <div className="wrap grow" style={{ paddingTop: 16 }}>
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

        {showRom && romanize && (
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
                  {romanize && <b style={{ color: "var(--bone)" }}>{w[1]} — </b>}
                  {w[2]}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          {romanize && (
            <button className="speaker" onClick={() => setShowRom(!showRom)}>
              {showRom ? "hide" : "show"} sounds
            </button>
          )}
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
                <div className={romanize ? "" : "gz"} style={{ fontSize: 20, fontWeight: 600 }}>
                  {romanize
                    ? FAMS[CHAR_MAP[tap.c].fam].rom[CHAR_MAP[tap.c].order]
                    : ORDERS[CHAR_MAP[tap.c].order].am}
                </div>
                <div className="note" style={{ fontSize: 11 }}>
                  {FAMS[CHAR_MAP[tap.c].fam].chars[0]} + {ORDERS[CHAR_MAP[tap.c].order].v} mark ·{" "}
                  {ORDERS[CHAR_MAP[tap.c].order].am}
                </div>
                {audio && audio.have.get(`${CHAR_MAP[tap.c].fam}.${CHAR_MAP[tap.c].order}`) && (
                  <button
                    className="speaker"
                    style={{ marginTop: 6, borderColor: "var(--verd)", color: "#8FD9B4" }}
                    onClick={async () => {
                      const f = CHAR_MAP[tap.c].fam, o = CHAR_MAP[tap.c].order;
                      const u = (await getClip(f, o, audio.have.get(`${f}.${o}`) || "me")) || (await getClip(f, o, "all"));
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
  return (
    <button className={"card" + (done ? " done" : "") + (open ? "" : " locked")} disabled={!open} onClick={onClick}>
      <div className="card-head"><span className="card-fidel">{fidel}</span></div>
      <div className="row-sp">
        <span className="card-title">{title}</span>
        <span className="pill">{open ? count : "locked"}</span>
      </div>
      <div className="card-blurb" style={{ marginTop: 4 }}>{blurb}</div>
    </button>
  );
}

function Home({ state, dueCount, level, known, onStart, onReview, onSpeed, track, setTrack, romanize, setRomanize }) {
  const bDone = new Set(state.basesDone || []);
  const sDone = new Set(state.sweepsDone || []);
  const uDone = new Set(state.unitsDone || []);
  const allBases = BASE_BATCHES.every((b) => bDone.has(b.id));

  const solid = (f, o) => ((state.cards[key(f, o)] || {}).lvl || 0) >= 3;

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

      <button
        className="card"
        onClick={() => setRomanize(!romanize)}
        style={{ borderColor: romanize ? "var(--line)" : "var(--gold)" }}
      >
        <div className="row-sp">
          <span className="card-title" style={{ fontSize: 17 }}>
            {romanize ? "Romanization on" : "ፊደል only"}
          </span>
          <span className="pill" style={{ background: romanize ? "var(--ink3)" : "rgba(217,169,60,.2)", color: romanize ? "var(--dim)" : "var(--gold)" }}>
            {romanize ? "tap to drop it" : "on"}
          </span>
        </div>
        <div className="card-blurb" style={{ marginTop: 4 }}>
          {romanize
            ? "Drills answer in Latin letters. Fine to start with, but it becomes the thing you read instead of the fidel."
            : "No Latin in drills. Orders go by their real names — ግዕዝ, ካዕብ, ሣልስ — and letters are matched against words and each other. Reference screens still show sounds."}
        </div>
      </button>

      {track === "bases" ? (
        <>
          <div className="eyebrow" style={{ margin: "18px 0 10px" }}>Stage one · the 34 shapes</div>
          {BASE_BATCHES.map((b, i) => {
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

          <div className="eyebrow" style={{ margin: "22px 0 4px" }}>Stage two · the six vowel columns</div>
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
      ) : (
        <>
          <div className="eyebrow" style={{ margin: "0 0 10px" }}>Rows, four at a time</div>
          {UNITS.map((u, i) => {
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
  const [romanize, setRomanize] = useState(true);
  const [haveAudio, setHaveAudio] = useState(new Map());
  const [audScope, setAudScope] = useState("me");
  const [wordTab, setWordTab] = useState("read");
  const [lesson, setLesson] = useState(null);

  useEffect(() => {
    loadState().then((s) => {
      const t = todayStamp();
      if (s.lastDay !== t) {
        const y = new Date(Date.now() - DAY);
        const ys = `${y.getFullYear()}-${y.getMonth()}-${y.getDate()}`;
        s.streakDays = s.lastDay === ys ? (s.streakDays || 0) + 1 : 1;
        s.lastDay = t;
      }
      s.basesDone = s.basesDone || [];
      s.sweepsDone = s.sweepsDone || [];
      if (!s.startDate) s.startDate = Date.now();
      setState(s);
      if (s.track) setTrack(s.track);
      if (typeof s.romanize === "boolean") setRomanize(s.romanize);
      loadAudIndex().then(setHaveAudio);
    });
  }, []);

  const lastSig = useRef("");
  useEffect(() => {
    if (!state) return;
    const sig = JSON.stringify([
      state.basesDone, state.sweepsDone, state.unitsDone,
      state.bestSpeed, state.startDate, track, romanize,
    ]);
    const structural = sig !== lastSig.current;
    lastSig.current = sig;
    saveState({ ...state, track, romanize }, structural);
  }, [state, track, romanize]);

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

  const addXp = (n) => setState((s) => ({ ...s, xp: s.xp + n }));
  const audio = {
    have: haveAudio,
    scope: audScope,
    setScope: setAudScope,
    onSaved: (idx) => setHaveAudio(new Map(idx)),
  };

  const resetAll = () => {
    const fresh = { ...emptyState(), startDate: Date.now(), lastDay: todayStamp(), streakDays: 1 };
    lastSig.current = "";
    setState(fresh);
    saveState({ ...fresh, track, romanize }, true);
  };

  if (lesson) {
    return (
      <div className="fd">
        <style>{CSS}</style>
        <Lesson
          spec={lesson}
          state={state}
          pool={pool}
          romanize={romanize}
          audio={audio}
          onExit={() => setLesson(null)}
          onDone={(results, xp) => {
            grade(results);
            setState((s) => {
              const n = { ...s, xp: s.xp + xp };
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

      <div className="top">
        <span className="mark">ፊ</span>
        <span className="chip">lv <b>{level}</b></span>
        <div className="xpbar"><div className="xpfill" style={{ width: `${pct}%` }} /></div>
        <span className="chip"><b>{state.xp}</b> xp</span>
      </div>

      <div className="grow" style={{ display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {tab === "learn" && (
          <Home
            state={state}
            level={level}
            known={known}
            dueCount={due.length}
            track={track}
            setTrack={setTrack}
            romanize={romanize}
            setRomanize={setRomanize}
            onStart={(spec) => setLesson(spec)}
            onSpeed={() => setTab("speed")}
            onReview={() => setLesson({ kind: "review", id: "rev", fams: [], orders: [], doneLabel: "Review done" })}
          />
        )}
        {tab === "chart" && <Chart cards={state.cards} unlockedFams={unlockedFams} audio={audio} onReset={resetAll} />}
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
              <Reader known={known} romanize={romanize} audio={audio} />
            ) : (
              <WordBuild pool={pool} unlockedChars={known} romanize={romanize} onXp={addXp} />
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
            romanize={romanize}
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
                romanize={romanize}
                onEnd={(sc) => setState((s) => ({ ...s, xp: s.xp + sc * 5, bestSpeed: Math.max(s.bestSpeed, sc) }))}
              />
            </div>
          ))}
      </div>

      <div className="tabs">
        {[["learn", "ት", "learn"], ["chart", "ፊ", "chart"], ["words", "ቃ", "read"], ["write", "ጽ", "write"]].map(
          ([id, g, label]) => (
            <button key={id} className={"tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>
              <span className="tg">{g}</span>
              <span className="tl">{label}</span>
            </button>
          )
        )}
      </div>
    </div>
  );
}
