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
    { k: "address_line1", label: "Business address line 1" },
    { k: "address_line2", label: "Business address line 2" },
    { k: "city", label: "City" },
    { k: "state", label: "State / province" },
    { k: "postal_code", label: "Postal code" },
    { k: "country", label: "Country" },
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
// Patterns are tested against "<section> <label>", where <section> comes from the heading above the
// field ("recommender", "education", "employment", "address", "citizenship" or nothing). So
// "First Name" under a "Recommender 2" heading is tested as "recommender first name".
// "*" is the list entry: taken from the heading's number when there is one ("Recommender 2" → #2),
// otherwise the entry picked in the panel. "low" confidence rows are never filled without your tick.
const REC = "(recommend|referee|reference|evaluator|letter writer)";
const EDU = "(education|institution|college|universit|school)";
const EMP = "(employment|employer|work|job|company)";
const rx = (s, f = "i") => new RegExp(s, f);
GF.RULES = [
  ["recommenders.*.first_name", rx(`${REC}.*(first|given)|(first|given).*${REC}`), "high"],
  ["recommenders.*.last_name", rx(`${REC}.*(last|family|sur)|(last|family).*${REC}`), "high"],
  ["recommenders.*.email", rx(`${REC}.*e-?mail`), "high"],
  ["recommenders.*.phone", rx(`${REC}.*(phone|mobile|telephone|contact (number|no))`), "high"],
  ["recommenders.*.institution", rx(`${REC}.*(institution|organi[sz]ation|employer|affiliation|universit|company)`), "high"],
  ["recommenders.*.title", rx(`${REC}.*(title|position|designation|rank)`), "high"],
  ["recommenders.*.relationship", /relationship/i, "high"],
  ["recommenders.*.prefix", rx(`^${REC}?\\w* ?(prefix|salutation|honorific)$`), "low"],
  ["recommenders.*.address_line2", rx(`${REC}.*(address|street).*(\\b2\\b|line 2|two)`), "high"],
  ["recommenders.*.address_line1", rx(`${REC}.*(address|street)`), "high"],
  ["recommenders.*.city", rx(`${REC}.*(\\bcity\\b|\\btown\\b)`), "high"],
  ["recommenders.*.state", rx(`${REC}.*(\\bstate\\b|province|region)`), "high"],
  ["recommenders.*.postal_code", rx(`${REC}.*(postal|\\bzip\\b|pin ?code)`), "high"],
  ["recommenders.*.country", rx(`${REC}.*country`), "high"],
  ["recommenders.*.full_name", rx(`${REC}.*\\bname\\b`), "low"],

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

  ["employment.*.start_date", rx(`^${EMP}.*(start|from|begin)`), "high"],
  ["employment.*.end_date", rx(`^${EMP}.*(\\bend\\b|\\bto\\b|until)`), "high"],
  ["employment.*.city", rx(`^${EMP}.*(\\bcity\\b|\\btown\\b)`), "high"],
  ["employment.*.country", rx(`^${EMP}.*country`), "high"],
  ["employment.*.employer", /employer|company|organi[sz]ation( name)?$|^employment .*\bname\b/i, "high"],
  ["employment.*.title", /job title|\bposition\b|\brole\b|designation|^employment .*\btitle\b/i, "high"],

  ["education.*.start_date", rx(`^${EDU}.*(start|from|begin|entr(y|ance)|attended from)`), "high"],
  ["education.*.end_date", rx(`^${EDU}.*(\\bend\\b|\\bto\\b|until|graduat|completion|conferr|award)`), "high"],
  ["education.*.city", rx(`^${EDU}.*(\\bcity\\b|\\btown\\b)`), "high"],
  ["education.*.country", rx(`^${EDU}.*country`), "high"],
  ["education.*.institution", /institution|university|college|school name|name of (the )?school|^education .*\bname\b/i, "high"],
  ["education.*.major", /major|field of study|discipline|concentration|specialization|branch/i, "high"],
  ["education.*.degree", /^education .*(degree|qualification)( (earned|received|type|awarded|name|title))?$/i, "high"],
  ["education.*.degree", /degree (earned|received|type|awarded|name|title)|^(education )?degree$|qualification/i, "low"],
  ["education.*.gpa_scale", /gpa.*scale|grading scale|\bscale\b|out of|maximum (gpa|grade)/i, "high"],
  ["education.*.gpa", /\bgpa\b|grade point|\bcgpa\b|cumulative average|percentage|marks obtained/i, "high"],

  ["citizenship.passport_expiry", /passport.*(expir|valid until|validity)/i, "high"],
  ["citizenship.passport_number", /passport (number|no\.?|#)|^passport$/i, "high"],
  ["personal.middle_name", /middle/i, "high"],
  ["personal.preferred_name", /preferred|nick ?name|chosen name|known as/i, "high"],
  ["personal.former_names", /former|previous name|other names|maiden|alias/i, "high"],
  ["personal.first_name", /first name|given name|forename|christian name|first\/given|^(\w+ )?first$/i, "high"],
  ["personal.last_name", /last name|family name|surname|sur name|last\/family|family\/last|^(\w+ )?last$/i, "high"],
  ["personal.full_name", /full (legal )?name|legal name|^(\w+ )?name$|^your name|name of (the )?(participant|applicant|student|candidate)|(participant|applicant|student|candidate)'?s? name/i, "low"],
  ["personal.date_of_birth", /birth ?date|date of birth|\bd\.?o\.?b\b|^birthday|born on|birth day/i, "high"],
  ["citizenship.city_of_birth", /city of birth|birth ?city|place of birth/i, "high"],
  ["citizenship.country_of_birth", /country of birth|birth ?country/i, "high"],
  ["personal.pronouns", /pronoun/i, "high"],
  ["personal.sex", /^sex$|legal sex|\bgender\b/i, "low"],

  ["citizenship.us_permanent_resident", /permanent resident|green card/i, "high"],
  ["citizenship.us_citizen", /u\.?\s?s\.? citizen/i, "high"],
  ["citizenship.country_of_citizenship", /country of citizen|nationality|^citizenship (country|citizenship)( \(.*\))?$/i, "high"],
  ["citizenship.country_of_citizenship", /citizenship/i, "low"],
  ["citizenship.visa_type", /visa type|type of visa/i, "low"],
  ["citizenship.visa_required", /visa/i, "low"],

  ["contact.alternate_email", /(alternate|secondary|other) e-?mail/i, "high"],
  ["contact.email", /e-?mail/i, "high"],
  ["contact.phone", /phone|mobile|\bcell\b|telephone|contact (number|no)|whats ?app|country ?code|dial(ing)? code|calling code|\bisd\b/i, "high"],
  // line 2 before line 1: "Street Address Line 2" also matches the line-1 pattern
  ["address.line2", /(address|street).*(\b2\b|line 2|two)|\bapt\b|suite/i, "high"],
  ["address.line1", /(address|street).*(\b1\b|line 1|one)|^street|^(\w+ )?address$|(permanent|mailing|home|current|residential) address/i, "high"],
  ["address.postal_code", /postal|\bzip\b|pin ?code/i, "high"],
  ["address.city", /^address .*(\bcity\b|\btown\b)|(current|home|residential) city/i, "high"],
  ["address.state", /^address .*(\bstate\b|province|region)/i, "high"],
  ["address.country", /^address .*country|country of (residence|domicile)|residence country|current country/i, "high"],
  ["address.city", /\bcity\b|\btown\b/i, "low"],
  ["address.state", /\bstate\b|province|region/i, "low"],
  ["address.country", /country/i, "low"],

  // Bare dates only make sense for the list entry chosen in the panel.
  ["*.start_date", /\b(start|from|begin)|attended from/i, "low"],
  ["*.end_date", /\b(end|until)\b|\bto\b|graduat|completion|conferr/i, "low"],
];

// Questions about someone else: never answered with your details.
GF.OTHER_PERSON = /emergency|parent|guardian|father|mother|next of kin|spouse|partner'?s|sibling|brother|sister|sponsor|dependent/i;

// Section headings above fields: which part of your details they are about.
GF.HEADINGS = [
  ["other", /emergency|parent|guardian|father|mother|family (information|details|background)|next of kin|spouse|sponsor|financial support/i, "other person"],
  ["recommenders", /recommend|referee|reference|evaluator|letter writer/i, "recommender"],
  ["education", /education|academic (history|record|background)|institution|colleges?( attended)?$|universit(y|ies)( attended)?$|schools? attended|prior degree/i, "education"],
  ["employment", /employment|work experience|professional experience|\bjob\b|employer/i, "employment"],
  ["citizenship", /citizenship|nationality|immigration|visa/i, "citizenship"],
  ["address", /address|contact information|mailing|residence/i, "address"],
];

// Details that are built from others, offered when a form asks for a whole name at once.
GF.DERIVED = {
  full_name: { label: "Full name (first middle last)", from: ["first_name", "middle_name", "last_name"] },
};

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
  "personal.sex", "personal.date_of_birth", "personal.full_name", "citizenship.country_of_citizenship",
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
