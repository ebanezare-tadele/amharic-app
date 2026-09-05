/* ============================================================
   THE FIDEL (ፊደል)
   34 consonant families x 7 vowel orders.
   Romanization: a = "sofa", u = "boot", i = "see", aa = "father",
   e = "cafe", (bare) = silent/very short, o = "go"
   ============================================================ */

export const ORDERS = [
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

export const FAMS = RAW.map(([chars, cons, name, note], i) => ({
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

export const CHAR_MAP = {};
FAMS.forEach((f) => f.chars.forEach((c, o) => (CHAR_MAP[c] = { fam: f.id, order: o })));

export const UNITS = [
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

export const WORDS = [
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

// The recording system (Voice, see components/AudioWidgets.jsx) is
// keyed by (fam, order) — a real consonant family id (0-33) plus a
// vowel order (0-6). Words aren't either of those, but the storage
// layer never actually validates that fam is a real family — it's just
// a string key. So words reuse the exact same storage unchanged, filed
// under pseudo-family ids safely outside the real 0-33 range: "order"
// is then just the word's index in its own list (ANCHORS or PHRASES).
// officialAudioUrl/officialKeyFromFilename/WORD_FAM live in src/audio.js
// so they're unit-testable without pulling in React — see
// src/audio.test.js. Verified with ffprobe duration + ffmpeg
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

export const BASE_BATCHES = [
  { id: "b1", fams: [0, 1, 2, 3, 4, 5], title: "ለ መ ረ ሰ በ ተ", blurb: "The six you'll see most. Get these cold." },
  { id: "b2", fams: [6, 7, 8, 9, 10, 11], title: "ነ ከ ወ የ ደ ገ", blurb: "Twelve down. Most short words are already within reach." },
  { id: "b3", fams: [12, 13, 14, 15, 16, 17], title: "ሀ አ ቀ ጠ ሸ ቸ", blurb: "ቀ and ጠ sit further back in the throat than anything in English." },
  { id: "b4", fams: [18, 19, 20, 21, 22, 23], title: "ጀ ኘ ዘ ጨ ፈ ፐ", blurb: "Half of these are shapes you've half-seen already." },
  { id: "b5", fams: [24, 25, 26, 27, 28], title: "ጸ ዠ ኸ ቨ ጰ", blurb: "The uncommon five. Recognize them, don't sweat them." },
  { id: "b6", fams: [29, 30, 31, 32, 33], title: "ሐ ኀ ሠ ዐ ፀ", blurb: "The silent twins. Each sounds exactly like a letter you already know — Amharic kept the old Ge'ez spellings. These are learned by word, not by ear." },
];

export const ARTIC = {
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

export const MARKS = {
  1: "A short horizontal stroke juts off the right side, about halfway up.",
  2: "A stroke off the right side too, but low — down near the foot.",
  3: "The right leg stretches down and out. On many letters the whole shape widens.",
  4: "A small ring or hook hangs off the bottom right.",
  5: "No single rule. Usually the right leg bends inward or the letter squats. This is the column you memorize case by case.",
  6: "A stroke high on the right, or the right side lifts up.",
};

// taught in order of regularity — the irregular ə column comes last
export const SWEEP_SEQ = [1, 2, 3, 4, 6, 5];

export const SWEEPS = SWEEP_SEQ.flatMap((o) => [
  { id: `s${o}a`, order: o, part: "A", fams: Array.from({ length: 17 }, (_, i) => i) },
  { id: `s${o}b`, order: o, part: "B", fams: Array.from({ length: 17 }, (_, i) => i + 17) },
]).map((s) => ({ ...s, title: `The ${ORDERS[s.order].v} column`, blurb: MARKS[s.order] }));

/* ---- more vocabulary, weighted toward home and table ---- */
export const EXTRA_WORDS = [
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
export const CATS = [
  ["family", "Family"],
  ["street", "Street & menu"],
  ["church", "Church"],
  ["news", "News"],
];

export const SENTENCES = [
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
export const GEEZ_NUM = [
  ["፩", 1, "and"], ["፪", 2, "hulet"], ["፫", 3, "sost"], ["፬", 4, "arat"], ["፭", 5, "amist"],
  ["፮", 6, "sidist"], ["፯", 7, "sebat"], ["፰", 8, "simint"], ["፱", 9, "zeteñ"], ["፲", 10, "asir"],
  ["፳", 20, "haya"], ["፴", 30, "selasa"], ["፵", 40, "arba"], ["፶", 50, "hamsa"],
  ["፷", 60, "silsa"], ["፸", 70, "seba"], ["፹", 80, "semanya"], ["፺", 90, "zetena"],
  ["፻", 100, "meto"],
];
