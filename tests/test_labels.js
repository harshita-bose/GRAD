// How GradFill reads real-world question wordings. Run: node tests/test_labels.js
const path = require("path");
globalThis.GF = {};
require(path.join(__dirname, "../extension/schema.js")); require(path.join(__dirname, "../extension/matcher.js"));
const cases = [
  // [label, section word, name attr, autocomplete, type] -> expected key (or null), expected auto-fill?
  ["First Name", "", "", "", "text", "personal.first_name", true],
  ["Given name(s)", "", "", "", "text", "personal.first_name", true],
  ["Surname / Family name (as in passport)", "", "", "", "text", "personal.last_name", true],
  ["Legal last name", "", "", "", "text", "personal.last_name", true],
  ["Name of participant", "", "", "", "text", "personal.full_name", false],
  ["Father's name", "", "", "", "text", null, false],
  ["Emergency contact name", "", "", "", "text", null, false],
  ["Emergency contact phone", "", "", "", "tel", null, false],
  ["Phone", "other person", "", "", "tel", null, false],
  ["Mother's email", "", "", "email", "email", null, false],
  ["E-mail ID", "", "", "", "text", "contact.email", true],
  ["Mobile no.", "", "", "", "text", "contact.phone", true],
  ["WhatsApp number", "", "", "", "text", "contact.phone", true],
  ["Date of Birth (DD/MM/YYYY)", "", "", "", "text", "personal.date_of_birth", true],
  ["D.O.B.", "", "", "", "text", "personal.date_of_birth", true],
  ["Nationality", "", "", "", "select", "citizenship.country_of_citizenship", true],
  ["Country of citizenship", "", "", "", "select", "citizenship.country_of_citizenship", true],
  ["Country of birth", "citizenship", "", "", "select", "citizenship.country_of_birth", true],
  ["Country of residence", "", "", "", "select", "address.country", true],
  ["Country", "", "", "", "select", "address.country", false],
  ["Country", "address", "", "", "select", "address.country", true],
  ["Country", "recommender", "", "", "select", "recommenders.*.country", true],
  ["Passport number", "", "", "", "text", "citizenship.passport_number", true],
  ["Passport expiry date", "", "", "", "text", "citizenship.passport_expiry", true],
  ["Pincode", "", "", "", "text", "address.postal_code", true],
  ["Zip/Postal Code", "", "", "", "text", "address.postal_code", true],
  ["Street Address Line 2", "", "", "", "text", "address.line2", true],
  ["Permanent address", "", "", "", "text", "address.line1", true],
  ["Name of University", "", "", "", "text", "education.*.institution", true],
  ["CGPA", "education", "", "", "text", "education.*.gpa", true],
  ["Percentage / CGPA obtained", "education", "", "", "text", "education.*.gpa", true],
  ["Branch / Specialization", "education", "", "", "text", "education.*.major", true],
  ["Degree", "education", "", "", "select", "education.*.degree", true],
  ["Year of graduation", "education", "", "", "text", "education.*.end_date", true],
  ["First Name", "recommender", "", "", "text", "recommenders.*.first_name", true],
  ["Title", "recommender", "", "", "text", "recommenders.*.title", true],
  ["Institution/Organization", "recommender", "", "", "text", "recommenders.*.institution", true],
  ["Relationship to applicant", "recommender", "", "", "text", "recommenders.*.relationship", true],
  ["", "", "fname", "", "text", "personal.first_name", true],
  ["", "", "q1234", "given-name", "text", "personal.first_name", true],
  ["Program of interest", "", "", "", "select", null, false],
  ["Term of entry", "", "", "", "select", null, false],
];
let bad = 0;
for (const [label, word, name, ac, type, want, auto] of cases) {
  const f = { label, name, id: "", autocomplete: ac, type, section: word ? { word, sec: { recommender: "recommenders", education: "education", address: "address", citizenship: "citizenship", "other person": "other" }[word] } : null };
  const got = GF.pickKey(f, (word ? word + " " : "") + label);
  const key = got ? got.key : null, fills = !!got && got.conf !== "low";
  const ok = key === want && (want === null || fills === auto);
  if (!ok) bad++;
  console.log(ok ? "ok " : "BAD", JSON.stringify(label || name || ac).padEnd(42), word.padEnd(12), "→", key, got ? got.conf : "", ok ? "" : `(wanted ${want}${want ? auto ? ", auto" : ", ask" : ""})`);
}
console.log(bad ? `${bad} problem(s)` : "LABELS: ALL PASSED");
process.exitCode = bad ? 1 : 0;
