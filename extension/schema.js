// Shared by the settings page (to build the profile form) and the page filler (to match fields).
// Loaded as a classic script: everything hangs off one global.
var GF = globalThis.GF || {};
globalThis.GF = GF;

const YES_NO = ["", "Yes", "No"];

// Profile layout. `list: n` sections hold up to n entries (Education #1, #2, ...).
GF.SECTIONS = [
  { id: "personal", title: "Personal", fields: [
    { k: "first_name", label: "First / given name", hint: "Exactly as on your passport" },
    { k: "middle_name", label: "Middle name" },
    { k: "last_name", label: "Last / family name", hint: "Exactly as on your passport" },
    { k: "preferred_name", label: "Preferred name" },
    { k: "former_names", label: "Former / other names" },
    { k: "date_of_birth", label: "Date of birth", type: "date" },
    { k: "sex", label: "Sex (as on passport)", options: ["", "Female", "Male", "X"] },
    { k: "pronouns", label: "Pronouns" },
  ] },
  { id: "contact", title: "Contact", fields: [
    { k: "email", label: "Email", type: "email" },
    { k: "alternate_email", label: "Alternate email", type: "email" },
    { k: "phone", label: "Phone", type: "tel", hint: "With country code, e.g. +91 98…" },
  ] },
  { id: "address", title: "Permanent address", fields: [
    { k: "line1", label: "Address line 1" },
    { k: "line2", label: "Address line 2" },
    { k: "city", label: "City" },
    { k: "state", label: "State / province" },
    { k: "postal_code", label: "Postal / PIN code" },
    { k: "country", label: "Country" },
  ] },
  { id: "citizenship", title: "Citizenship", fields: [
    { k: "country_of_citizenship", label: "Country of citizenship" },
    { k: "country_of_birth", label: "Country of birth" },
    { k: "city_of_birth", label: "City of birth" },
    { k: "us_citizen", label: "U.S. citizen?", options: YES_NO },
    { k: "us_permanent_resident", label: "U.S. permanent resident?", options: YES_NO },
    { k: "visa_required", label: "Need a U.S. visa to study?", options: YES_NO },
    { k: "visa_type", label: "Visa type", hint: "e.g. F-1" },
    { k: "passport_number", label: "Passport number" },
    { k: "passport_expiry", label: "Passport expiry", type: "date" },
  ] },
  { id: "education", title: "Education", list: 3, hint: "#1 = most recent", fields: [
    { k: "institution", label: "Institution" },
    { k: "city", label: "City" },
    { k: "country", label: "Country" },
    { k: "degree", label: "Degree", hint: "e.g. B.Tech" },
    { k: "major", label: "Major / field" },
    { k: "start_date", label: "Start date", type: "date" },
    { k: "end_date", label: "End / expected date", type: "date" },
    { k: "gpa", label: "GPA", hint: "Exactly as on your transcript — never converted" },
    { k: "gpa_scale", label: "GPA scale", hint: "e.g. 10" },
  ] },
  { id: "tests", title: "Test scores", fields: [
    { k: "gre_verbal", label: "GRE verbal" },
    { k: "gre_quant", label: "GRE quantitative" },
    { k: "gre_writing", label: "GRE analytical writing" },
    { k: "gre_date", label: "GRE test date", type: "date" },
    { k: "toefl_total", label: "TOEFL total" },
    { k: "toefl_reading", label: "TOEFL reading" },
    { k: "toefl_listening", label: "TOEFL listening" },
    { k: "toefl_speaking", label: "TOEFL speaking" },
    { k: "toefl_writing", label: "TOEFL writing" },
    { k: "toefl_date", label: "TOEFL test date", type: "date" },
    { k: "ielts_overall", label: "IELTS overall" },
    { k: "ielts_date", label: "IELTS test date", type: "date" },
    { k: "duolingo_score", label: "Duolingo score" },
    { k: "duolingo_date", label: "Duolingo test date", type: "date" },
  ] },
  { id: "employment", title: "Work experience", list: 3, fields: [
    { k: "employer", label: "Employer" },
    { k: "title", label: "Job title" },
    { k: "city", label: "City" },
    { k: "country", label: "Country" },
    { k: "start_date", label: "Start date", type: "date" },
    { k: "end_date", label: "End date", type: "date" },
  ] },
  { id: "recommenders", title: "Recommenders", list: 4, fields: [
    { k: "prefix", label: "Prefix", options: ["", "Dr.", "Prof.", "Mr.", "Ms.", "Mrs."] },
    { k: "first_name", label: "First name" },
    { k: "last_name", label: "Last name" },
    { k: "title", label: "Title / position" },
    { k: "institution", label: "Institution" },
    { k: "email", label: "Email", type: "email" },
    { k: "phone", label: "Phone", type: "tel" },
    { k: "relationship", label: "Relationship to you" },
  ] },
];

// Never filled. The panel lists them for you to answer yourself.
GF.MANUAL = [
  [/password|passcode|\bpin\b(?!\s*code)|security question/i, "password / account security"],
  [/captcha|not a robot/i, "CAPTCHA"],
  [/social security|\bssn\b/i, "U.S. Social Security Number"],
  [/\brace\b|ethnic|hispanic|latin[oa]/i, "race / ethnicity (voluntary)"],
  [/disabilit/i, "disability status"],
  [/veteran|military/i, "military / veteran status"],
  [/sexual orientation|gender identity|transgender/i, "voluntary demographic"],
  [/criminal|convicted|felony|misdemeanou?r|disciplin|expelled|suspended|probation/i, "conduct / legal history"],
  [/signature|\bsign\b|certif|attest|i agree|i affirm|i understand|acknowledg|consent|terms (and|of)|privacy policy/i, "agreement / certification"],
  [/\bfees?\b|payment|credit card|card number|cvv|waiver/i, "payment / fee waiver"],
];

// Buttons blocked by the guard on pages where the panel is open.
GF.SUBMIT_LIKE = /submit|\bpay\b|payment|certify|finali[sz]e|sign and/i;

// [profile key, label pattern, confidence]. First match wins, so specific rules go first.
// "*" is the list entry you pick in the panel (Education #1, Recommender #2, ...).
// "low" confidence rows are always flagged for review.
GF.RULES = [
  ["recommenders.*.first_name", /(recommend|referee|reference|evaluator).*(first|given)|(first|given).*(recommend|referee|evaluator)/i, "high"],
  ["recommenders.*.last_name", /(recommend|referee|reference|evaluator).*(last|family|sur)|(last|family).*(recommend|referee|evaluator)/i, "high"],
  ["recommenders.*.email", /(recommend|referee|reference|evaluator).*e-?mail/i, "high"],
  ["recommenders.*.institution", /(recommend|referee|reference|evaluator).*(institution|organi[sz]ation|employer|affiliation)/i, "high"],
  ["recommenders.*.title", /(recommend|referee|reference|evaluator).*(title|position)/i, "high"],
  ["recommenders.*.phone", /(recommend|referee|reference|evaluator).*(phone|mobile)/i, "high"],
  ["recommenders.*.relationship", /relationship/i, "high"],
  ["recommenders.*.prefix", /^(recommender )?(prefix|salutation)$/i, "low"],

  ["tests.gre_verbal", /gre.*verbal/i, "high"],
  ["tests.gre_quant", /gre.*quant/i, "high"],
  ["tests.gre_writing", /gre.*(analytical|writing)/i, "high"],
  ["tests.gre_date", /gre.*date/i, "high"],
  ["tests.toefl_total", /toefl.*(total|overall)/i, "high"],
  ["tests.toefl_reading", /toefl.*reading/i, "high"],
  ["tests.toefl_listening", /toefl.*listening/i, "high"],
  ["tests.toefl_speaking", /toefl.*speaking/i, "high"],
  ["tests.toefl_writing", /toefl.*writing/i, "high"],
  ["tests.toefl_date", /toefl.*date/i, "high"],
  ["tests.ielts_overall", /ielts.*(overall|total|band)/i, "high"],
  ["tests.ielts_date", /ielts.*date/i, "high"],
  ["tests.duolingo_score", /duolingo.*score/i, "high"],
  ["tests.duolingo_date", /duolingo.*date/i, "high"],

  ["employment.*.employer", /employer|company|organi[sz]ation name/i, "high"],
  ["employment.*.title", /job title|\bposition\b|\brole\b/i, "high"],

  ["education.*.institution", /institution|university|college|school name/i, "high"],
  ["education.*.major", /major|field of study|discipline|concentration/i, "high"],
  ["education.*.degree", /degree (earned|received|type|awarded)|^degree$/i, "low"],
  ["education.*.gpa_scale", /gpa.*scale|grading scale|\bscale\b|out of|maximum (gpa|grade)/i, "high"],
  ["education.*.gpa", /\bgpa\b|grade point|\bcgpa\b|cumulative average/i, "high"],

  ["citizenship.passport_expiry", /passport.*(expir|valid)/i, "high"],
  ["citizenship.passport_number", /passport/i, "high"],
  ["personal.middle_name", /middle/i, "high"],
  ["personal.preferred_name", /preferred|nick ?name|chosen name/i, "high"],
  ["personal.former_names", /former|previous name|other names|maiden/i, "high"],
  ["personal.first_name", /first name|given name|forename|^first$/i, "high"],
  ["personal.last_name", /last name|family name|surname|^last$/i, "high"],
  ["personal.date_of_birth", /birth ?date|date of birth|\bdob\b|^birthday/i, "high"],
  ["citizenship.city_of_birth", /city of birth|birth ?city|place of birth/i, "high"],
  ["citizenship.country_of_birth", /country of birth|birth ?country/i, "high"],
  ["personal.pronouns", /pronoun/i, "high"],
  ["personal.sex", /^sex$|legal sex|\bgender\b/i, "low"],

  ["citizenship.us_permanent_resident", /permanent resident|green card/i, "high"],
  ["citizenship.us_citizen", /u\.?\s?s\.? citizen/i, "high"],
  ["citizenship.country_of_citizenship", /citizenship|country of citizen/i, "low"],
  ["citizenship.visa_type", /visa type|type of visa/i, "low"],
  ["citizenship.visa_required", /visa/i, "low"],

  ["contact.alternate_email", /(alternate|secondary|other) e-?mail/i, "high"],
  ["contact.email", /e-?mail/i, "high"],
  ["contact.phone", /phone|mobile|\bcell\b|telephone/i, "high"],
  // line 2 before line 1: "Street Address Line 2" also matches the line-1 pattern
  ["address.line2", /(address|street).*(\b2\b|line 2|two)|\bapt\b|suite/i, "high"],
  ["address.line1", /(address|street).*(\b1\b|line 1|one)|^street|^address$/i, "high"],
  ["address.postal_code", /postal|\bzip\b|pin ?code/i, "high"],
  ["address.city", /\bcity\b|\btown\b/i, "low"],
  ["address.state", /\bstate\b|province|region/i, "low"],
  ["address.country", /country/i, "low"],

  // Bare dates only make sense for the list entry chosen in the panel.
  ["*.start_date", /\b(start|from|begin)|attended from/i, "low"],
  ["*.end_date", /\b(end|until)\b|\bto\b|graduat|completion|conferr/i, "low"],
];

// Upload fields: the panel tells you which document is wanted; you attach it yourself.
GF.DOCS = [
  [/\bcv\b|resume|résumé|curriculum vitae/i, "CV / résumé"],
  [/statement of purpose|\bsop\b|purpose/i, "Statement of purpose"],
  [/personal (history|statement)|diversity/i, "Personal history statement"],
  [/transcript|mark ?sheet/i, "Transcript"],
  [/writing sample/i, "Writing sample"],
];

// Fields where a wrong value has legal or immigration consequences: always flagged.
GF.ALWAYS_CHECK = new Set([
  "personal.sex", "personal.date_of_birth", "citizenship.country_of_citizenship",
  "citizenship.visa_type", "citizenship.visa_required", "citizenship.us_citizen",
  "citizenship.us_permanent_resident", "citizenship.passport_number", "citizenship.passport_expiry",
]);

GF.LIST_SECTIONS = GF.SECTIONS.filter(s => s.list).map(s => s.id);

GF.emptyProfile = function () {
  const p = {};
  for (const s of GF.SECTIONS) {
    const blank = () => Object.fromEntries(s.fields.map(f => [f.k, ""]));
    p[s.id] = s.list ? Array.from({ length: s.list }, blank) : blank();
  }
  return p;
};
