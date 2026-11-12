/*
 * Neon Hop – Textfilter für Level- und Spielernamen.
 *
 * Abgelehnt werden: Links, E-Mail-Adressen, lange Zahlenfolgen (Telefon,
 * Karten), Codes aus Buchstaben und Ziffern und eine Liste grober Wörter
 * (Deutsch/Englisch). Auch mit Ersatzzeichen wie "f1ck" oder "a$$".
 * Vorlage für die Link-/Nummern-Regeln: shared/src/safety.ts in
 * DasLeon08/Scam_with_your_bros.
 */
'use strict';

const TLDS = 'com|net|org|ch|de|at|li|io|gg|app|dev|me|ly|xyz|info|biz|co|uk|eu|tv|link|site|online|shop|store|ru|cn|be|fr|it|nl|us|to|cc|ws|gl|gd|su|top|club|live|pro|page|art|fun';
const CONTACT_RULES = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/,                                   // E-Mail
  /\b(?:https?|ftp):\/\//i,                                    // Link
  /\bwww\./i,
  new RegExp('\\b[a-z0-9-]+\\.(?:' + TLDS + ')\\b', 'i'),        // nackte Domain
  /\d(?:[\d\s./-]{5,})\d/,                                     // lange Zahlenfolge
  /\b(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{9,}\b/i,         // Code-artig
];

// Teilwörter, die auch innerhalb anderer Wörter nicht vorkommen sollen
const BAD_PARTS = [
  'fick', 'fuck', 'fotze', 'wichs', 'hurens', 'arschloch', 'schlampe', 'missgeburt', 'schwuchtel',
  'nigg', 'neger', 'kanake', 'hitler', 'nazi', 'porn', 'penis', 'vagina', 'pussy',
  'bitch', 'whore', 'faggot', 'retard', 'vergewalt', 'killyourself', 'asshole',
];
// Ganze Wörter (wären als Teilwort zu oft harmlos, z.B. "Sechs" / "Essex")
const BAD_WORDS = ['sex', 'hure', 'arsch', 'spast', 'shit', 'dick', 'slut', 'nude', 'heil', 'kot', 'kys', 'rape', 'cunt', 'ass'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i' };

function normalize(text) {
  return String(text || '').toLowerCase()
    .replace(/[0134578@$!|]/g, (c) => LEET[c])
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

/** Steuerzeichen raus, Leerzeichen zusammenfassen, kürzen. */
function cleanText(input, max) {
  return String(typeof input === 'string' ? input : '')
    .replace(new RegExp('[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff<>]', 'g'), ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

/** true, wenn der Text nicht erlaubt ist. */
function isBlocked(text) {
  const raw = String(text || '');
  if (CONTACT_RULES.some((re) => re.test(raw))) return true;
  const norm = normalize(raw);
  const compact = norm.replace(/[^a-z]/g, '');          // "f.u.c.k" -> "fuck"
  if (BAD_PARTS.some((w) => compact.includes(w))) return true;
  const words = norm.split(/[^a-z]+/).filter(Boolean);
  return words.some((w) => BAD_WORDS.includes(w));
}

module.exports = { cleanText, isBlocked, normalize };
