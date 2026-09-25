// Everyday vocabulary for the More tab's topic sections. Plain data, no
// React or Vite-only imports, so scripts/ (audio generation) can import
// this same file directly instead of keeping a copy that could drift.
//
// Each entry is [amharic, romanization, gloss], with an optional 4th
// field `true` for a question (the audio generator ends it with "?"
// instead of "።", so it's read with a question's intonation).
//
// `fam` is the pseudo-family id recordings and built-in clips are filed
// under, the same way anchor words (900) and phrases (901) are -- see
// WORD_FAM in src/audio.js. Never renumber one: personal recordings are
// stored under it.

export const VOCAB = [
  {
    id: "time",
    fam: 903,
    title: "Date and time",
    note:
      "Ethiopia counts the hours from dawn, not midnight: 7 a.m. is 1 o'clock, noon is 6. The calendar is its own too — 13 months, and the year number runs about 7 to 8 years behind the Gregorian one.",
    words: [
      ["ዛሬ", "zare", "today"],
      ["ነገ", "nege", "tomorrow"],
      ["ትናንት", "tinant", "yesterday"],
      ["ቀን", "qen", "day; also date"],
      ["ሳምንት", "samint", "week"],
      ["ወር", "wer", "month"],
      ["ዓመት", "amet", "year"],
      ["ሰዓት", "se'at", "hour; also clock, time"],
      ["ደቂቃ", "deqiqa", "minute"],
      ["ጠዋት", "tewat", "morning"],
      ["ቀትር", "qetir", "noon"],
      ["ከሰዓት በኋላ", "kese'at behwala", "afternoon"],
      ["ምሽት", "mishit", "evening"],
      ["ሌሊት", "lelit", "night"],
      ["ሰኞ", "seño", "Monday"],
      ["ማክሰኞ", "makseño", "Tuesday"],
      ["ረቡዕ", "rebu", "Wednesday"],
      ["ሐሙስ", "hamus", "Thursday"],
      ["ዓርብ", "arb", "Friday"],
      ["ቅዳሜ", "qidame", "Saturday"],
      ["እሑድ", "ehud", "Sunday"],
      ["ስንት ሰዓት ነው", "sint se'at new", "What time is it?", true],
    ],
  },
  {
    id: "family",
    fam: 904,
    title: "Family",
    words: [
      ["ቤተሰብ", "beteseb", "family"],
      ["እናት", "enat", "mother"],
      ["አባት", "abat", "father"],
      ["ወንድም", "wendim", "brother"],
      ["እህት", "ehit", "sister"],
      ["ልጆች", "lijoch", "children"],
      ["ወንድ ልጅ", "wend lij", "son"],
      ["ሴት ልጅ", "set lij", "daughter"],
      ["አያት", "ayat", "grandparent"],
      ["አጎት", "agot", "uncle"],
      ["አክስት", "akist", "aunt"],
      ["የአጎት ልጅ", "ye'agot lij", "cousin (literally, uncle's child)"],
      ["ባል", "bal", "husband"],
      ["ሚስት", "mist", "wife"],
      ["ዘመድ", "zemed", "relative"],
    ],
  },
  {
    id: "colors",
    fam: 905,
    title: "Colors",
    note:
      "Several colors are named after things: ቡናማ is coffee-colored (ቡና, coffee), ብርቱካናማ is orange-fruit-colored (ብርቱካን), and ሰማያዊ is sky-colored (ሰማይ, sky).",
    words: [
      ["ቀለም", "qelem", "color"],
      ["ቀይ", "qey", "red"],
      ["ሰማያዊ", "semayawi", "blue"],
      ["አረንጓዴ", "arengwade", "green"],
      ["ቢጫ", "bicha", "yellow"],
      ["ብርቱካናማ", "birtukanama", "orange"],
      ["ሐምራዊ", "hamrawi", "purple"],
      ["ሮዝ", "roz", "pink"],
      ["ቡናማ", "bunama", "brown"],
      ["ጥቁር", "tiqur", "black"],
      ["ነጭ", "nech", "white"],
      ["ግራጫ", "gracha", "gray"],
    ],
  },
  {
    id: "directions",
    fam: 906,
    title: "Directions",
    words: [
      ["ላይ", "lay", "up; on top"],
      ["ታች", "tach", "down; below"],
      ["ግራ", "gra", "left"],
      ["ቀኝ", "qeñ", "right"],
      ["ፊት", "fit", "front; ahead"],
      ["ኋላ", "hwala", "back; behind"],
      ["ቀጥታ", "qetita", "straight"],
      ["ውስጥ", "wist", "inside"],
      ["ውጭ", "wich", "outside"],
      ["አጠገብ", "ategeb", "next to"],
      ["ቅርብ", "qirb", "near"],
      ["ሩቅ", "ruq", "far"],
      ["ሰሜን", "semen", "north"],
      ["ደቡብ", "debub", "south"],
      ["ምሥራቅ", "misraq", "east"],
      ["ምዕራብ", "mi'rab", "west"],
      ["ወደ ግራ ታጠፍ", "wede gra tatef", "Turn left — to a man."],
      ["ወደ ቀኝ ታጠፍ", "wede qeñ tatef", "Turn right — to a man."],
    ],
  },
];

// The exact text the audio generator speaks for a vocab entry.
export function vocabText([word, , , question]) {
  return `${word}${question ? "?" : "።"}`;
}
