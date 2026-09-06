import { FAMS } from "../content.js";

/* ============================================================
   SPELL IT IN FIDEL
   A simple, self-consistent way to render a plain-English word or
   name in the fidel -- not a claim about the "correct" or official
   Amharic spelling of anything. English consonants map to whichever
   fidel row already carries that same base sound (FAMS' own `cons`
   field, the same data the chart/lessons use); each written vowel
   letter maps to the same vowel sound already taught via ORDERS in
   content.js (a -> father, e -> cafe, i -> see, o -> go, u -> boot).
   A consonant with no vowel after it lands on the bare sixth-order
   glyph. English spelling is famously irregular (silent letters, a
   "ch" that's really a hard c, a name that just breaks its own
   rules) -- this can't and doesn't try to resolve that; it's an
   approximate phonetic spelling for reading/writing practice.
   ============================================================ */

const VOWEL_ORDER = { a: 3, e: 4, i: 2, o: 6, u: 1 };
const FRONT = new Set(["e", "i", "y"]);
const CONSONANTS = new Set("bdfhjklmnprstvwz".split(""));

function famByCons(cons) {
  return FAMS.find((f) => f.cons === cons);
}

function glyphFor(cons, order) {
  const fam = famByCons(cons);
  return fam ? { glyph: fam.chars[order], rom: fam.rom[order] } : null;
}

// Reads one consonant sound starting at index i (English digraphs first).
// Returns { cons, len } or null if i isn't the start of a consonant sound.
function readConsonant(w, i) {
  const two = w.slice(i, i + 2);
  if (two === "sh" || two === "ch") return { cons: two, len: 2 };
  const c = w[i];
  if (c === "c") return { cons: FRONT.has(w[i + 1]) ? "s" : "k", len: 1 };
  if (c === "g") return { cons: FRONT.has(w[i + 1]) ? "j" : "g", len: 1 };
  if (c === "q") return { cons: "k", len: 1 };
  if (c === "y") {
    const prevIsVowel = i > 0 && "aeiou".includes(w[i - 1]);
    const nextIsVowel = i + 1 < w.length && "aeiou".includes(w[i + 1]);
    if (!prevIsVowel && nextIsVowel) return { cons: "y", len: 1 };
    return null;
  }
  return CONSONANTS.has(c) ? { cons: c, len: 1 } : null;
}

function spellWord(word) {
  const w = word
    .toLowerCase()
    .replace(/ck/g, "k")
    .replace(/qu/g, "kw")
    .replace(/x/g, "ks")
    .replace(/ph/g, "f")
    .replace(/wh/g, "w")
    .replace(/th/g, "t")
    .replace(/[^a-z]/g, "");

  const out = [];
  let i = 0;
  while (i < w.length) {
    const c = readConsonant(w, i);
    if (c) {
      i += c.len;
      let order = 5;
      if (i < w.length && "aeiou".includes(w[i])) {
        order = VOWEL_ORDER[w[i]];
        i++;
        while (i < w.length && "aeiou".includes(w[i])) i++;
      }
      const g = glyphFor(c.cons, order);
      if (g) out.push(g);
    } else if ("aeiou".includes(w[i])) {
      const order = VOWEL_ORDER[w[i]];
      i++;
      while (i < w.length && "aeiou".includes(w[i])) i++;
      const g = glyphFor("'", order);
      if (g) out.push(g);
    } else {
      // a lone 'y' acting as a vowel (no consonant slot claimed it above)
      const g = glyphFor("'", 2);
      if (g) out.push(g);
      i++;
    }
  }
  return out;
}

// One array of { glyph, rom } per whitespace-separated word.
export function spellInFidel(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map(spellWord)
    .filter((word) => word.length);
}
