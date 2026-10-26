// Matching layer: which of your details a form field wants, and how to write it the form's way.
// Loaded after schema.js and before content.js. Pure functions; no page access except what is passed in.
var GF = globalThis.GF;

(() => {
  const norm = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9+@.]/g, "");
  const words = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  // ---------- 1. reading a field: label + section + autofill hint + internal name ----------

  // Standard browser autofill hints that pages put on inputs (the last token is the field type).
  const AUTOCOMPLETE = {
    "given-name": "personal.first_name", "additional-name": "personal.middle_name", "family-name": "personal.last_name",
    "name": "personal.full_name", "nickname": "personal.preferred_name", "sex": "personal.sex",
    "bday": "personal.date_of_birth", "bday-day": "personal.date_of_birth", "bday-month": "personal.date_of_birth", "bday-year": "personal.date_of_birth",
    "email": "contact.email", "tel": "contact.phone", "tel-national": "contact.phone", "tel-country-code": "contact.phone",
    "address-line1": "address.line1", "street-address": "address.line1", "address-line2": "address.line2",
    "address-level2": "address.city", "address-level1": "address.state", "postal-code": "address.postal_code",
    "country": "address.country", "country-name": "address.country",
    "organization": "employment.*.employer", "organization-title": "employment.*.title",
  };
  // When a field sits under a recommender / work heading, applicant keys become that entry's keys.
  const IN_SECTION = {
    recommenders: { "personal.first_name": "first_name", "personal.last_name": "last_name", "personal.full_name": "full_name",
      "contact.email": "email", "contact.phone": "phone", "address.line1": "address_line1", "address.line2": "address_line2",
      "address.city": "city", "address.state": "state", "address.postal_code": "postal_code", "address.country": "country",
      "employment.*.employer": "institution", "employment.*.title": "title" },
    employment: { "address.city": "city", "address.country": "country" },
    education: { "address.city": "city", "address.country": "country" },
  };

  // Common short internal names → words, so name="fname" reads as "first name".
  const ABBREV = { fname: "first name", firstname: "first name", givenname: "given name", lname: "last name", lastname: "last name",
    surname: "surname", familyname: "family name", mname: "middle name", middlename: "middle name", dob: "date of birth",
    bdate: "birthdate", birthdate: "birthdate", birthday: "birthdate", addr: "address", addr1: "address 1", addr2: "address 2",
    address1: "address 1", address2: "address 2", zip: "zip", zipcode: "zip", postcode: "postal", pincode: "pin code",
    cntry: "country", ctry: "country", tel: "phone", phonenumber: "phone", mobileno: "mobile", emailaddress: "email",
    nationality: "nationality", citizenship: "citizenship", gpa: "gpa", cgpa: "cgpa", univ: "university", inst: "institution" };
  function humanize(s) {
    return String(s || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-.[\]]+/g, " ").replace(/(\D)(\d)/g, "$1 $2")
      .split(/\s+/).map(t => ABBREV[t.toLowerCase()] || t).join(" ").trim().toLowerCase();
  }
  // Internal names that are just machine IDs carry no meaning.
  const meaningful = s => /[a-z]{3}/i.test(s) && !/^[a-f0-9-]{16,}$/i.test(s) && !/^(field|input|q|question|element)\s*\d+$/i.test(s);

  function inSection(key, f) {
    const sec = f.section && f.section.sec;
    const t = sec && IN_SECTION[sec] && IN_SECTION[sec][key];
    if (t) return `${sec}.*.${t}`;
    return key;
  }
  function rule(text) {
    const r = GF.RULES.find(([, rx]) => rx.test(text));
    return r ? { key: r[0], conf: r[2] } : null;
  }

  // Decide which detail a field wants. Returns { key, conf: "high" | "verify" | "low", why }.
  // A field is filled automatically only when the evidence is strong: a specific label, the page's
  // own autofill hint, or two independent clues that agree.
  GF.pickKey = function (f, ctxLabel) {
    if ((f.section && f.section.sec === "other") || GF.OTHER_PERSON.test(f.label || "")) return null; // someone else's details
    const prefix = f.section ? f.section.word + " " : "";
    const fromLabel = rule(ctxLabel);
    const ac = String(f.autocomplete || "").trim().split(/\s+/).pop();
    const fromAuto = AUTOCOMPLETE[ac] ? { key: inSection(AUTOCOMPLETE[ac], f) } : null;
    const attr = [f.name, f.id].filter(meaningful).map(humanize).find(t => rule(prefix + t));
    const fromAttr = attr ? rule(prefix + attr) : null;
    const typeKey = f.type === "email" ? "contact.email" : f.type === "tel" ? "contact.phone" : null;
    const agrees = k => [fromAuto && fromAuto.key, fromAttr && fromAttr.key, typeKey && inSection(typeKey, f)].filter(x => x === k).length;

    if (fromLabel && fromLabel.conf === "high") return { key: fromLabel.key, conf: "high", why: "label" };
    if (fromAuto) {
      const conf = !fromLabel || fromLabel.key === fromAuto.key ? "high" : "low";
      return { key: fromAuto.key, conf, why: "the page's autofill hint" };
    }
    if (fromLabel) return { key: fromLabel.key, conf: agrees(fromLabel.key) ? "high" : "low", why: agrees(fromLabel.key) ? "label and field name agree" : "label" };
    if (fromAttr) return { key: fromAttr.key, conf: fromAttr.conf === "high" && (!ctxLabel.trim() || typeKey === fromAttr.key) ? "verify" : "low", why: "the field's internal name" };
    if (typeKey) return { key: inSection(typeKey, f), conf: "verify", why: "the field type" };
    return null;
  };

  // ---------- 2. writing a value the form's way ----------

  // [name, ISO2, ISO3, demonym, other spellings…]
  const COUNTRIES = [
    ["India", "IN", "IND", "Indian", "Republic of India", "Bharat"],
    ["United States", "US", "USA", "American", "United States of America", "U.S.", "U.S.A.", "America"],
    ["United Kingdom", "GB", "GBR", "British", "UK", "U.K.", "Great Britain", "Britain", "England"],
    ["Canada", "CA", "CAN", "Canadian"], ["Australia", "AU", "AUS", "Australian"], ["Germany", "DE", "DEU", "German", "Deutschland"],
    ["France", "FR", "FRA", "French"], ["China", "CN", "CHN", "Chinese", "People's Republic of China", "PRC"],
    ["Japan", "JP", "JPN", "Japanese"], ["South Korea", "KR", "KOR", "South Korean", "Korea, Republic of", "Republic of Korea", "Korea"],
    ["Nepal", "NP", "NPL", "Nepalese", "Nepali"], ["Bangladesh", "BD", "BGD", "Bangladeshi"], ["Pakistan", "PK", "PAK", "Pakistani"],
    ["Sri Lanka", "LK", "LKA", "Sri Lankan"], ["Bhutan", "BT", "BTN", "Bhutanese"], ["Singapore", "SG", "SGP", "Singaporean"],
    ["United Arab Emirates", "AE", "ARE", "Emirati", "UAE"], ["Saudi Arabia", "SA", "SAU", "Saudi"], ["Italy", "IT", "ITA", "Italian"],
    ["Spain", "ES", "ESP", "Spanish"], ["Netherlands", "NL", "NLD", "Dutch", "The Netherlands", "Holland"],
    ["Switzerland", "CH", "CHE", "Swiss"], ["Sweden", "SE", "SWE", "Swedish"], ["Ireland", "IE", "IRL", "Irish"],
    ["Russia", "RU", "RUS", "Russian", "Russian Federation"], ["Brazil", "BR", "BRA", "Brazilian"], ["Mexico", "MX", "MEX", "Mexican"],
    ["Taiwan", "TW", "TWN", "Taiwanese", "Taiwan, Province of China", "Republic of China"],
    ["Hong Kong", "HK", "HKG", "Hong Konger", "Hong Kong SAR", "Hong Kong, China"], ["Vietnam", "VN", "VNM", "Vietnamese", "Viet Nam"],
    ["Iran", "IR", "IRN", "Iranian", "Iran, Islamic Republic of"], ["Turkey", "TR", "TUR", "Turkish", "Türkiye"],
    ["Nigeria", "NG", "NGA", "Nigerian"], ["Kenya", "KE", "KEN", "Kenyan"], ["Egypt", "EG", "EGY", "Egyptian"],
    ["Indonesia", "ID", "IDN", "Indonesian"], ["Malaysia", "MY", "MYS", "Malaysian"], ["Thailand", "TH", "THA", "Thai"],
    ["Philippines", "PH", "PHL", "Filipino"], ["New Zealand", "NZ", "NZL", "New Zealander"], ["Israel", "IL", "ISR", "Israeli"],
    ["Czech Republic", "CZ", "CZE", "Czech", "Czechia"], ["Poland", "PL", "POL", "Polish"], ["Portugal", "PT", "PRT", "Portuguese"],
  ];
  const DEGREES = [
    [/^(b\.?\s?tech|btech|b\.?\s?e\.?|bachelor of (technology|engineering))$/i, ["Bachelor of Technology", "Bachelor of Engineering", "B.Tech", "B.E.", "Bachelor's degree", "Bachelor's", "Bachelors", "Bachelor", "Undergraduate"]],
    [/^(b\.?\s?sc?\.?|bs|bachelor of science)$/i, ["Bachelor of Science", "B.S.", "B.Sc.", "Bachelor's degree", "Bachelor's", "Bachelors", "Bachelor"]],
    [/^(b\.?\s?a\.?|bachelor of arts)$/i, ["Bachelor of Arts", "B.A.", "Bachelor's degree", "Bachelor's", "Bachelor"]],
    [/^(m\.?\s?tech|mtech|m\.?\s?e\.?|master of (technology|engineering))$/i, ["Master of Technology", "Master of Engineering", "M.Tech", "M.E.", "Master's degree", "Master's", "Masters", "Master"]],
    [/^(m\.?\s?sc?\.?|ms|master of science)$/i, ["Master of Science", "M.S.", "M.Sc.", "Master's degree", "Master's", "Masters", "Master"]],
    [/^(ph\.?\s?d\.?|doctorate)$/i, ["Doctor of Philosophy", "Ph.D.", "PhD", "Doctorate", "Doctoral"]],
  ];
  const SEX = { female: ["Female", "F", "Woman"], male: ["Male", "M", "Man"], x: ["X", "Non-binary", "Another", "Other"] };
  const YESNO = { yes: ["Yes", "Y", "True"], no: ["No", "N", "False"] };
  const PREFIX = { "dr.": ["Dr.", "Dr", "Doctor"], "prof.": ["Prof.", "Prof", "Professor"], "mr.": ["Mr.", "Mr"], "ms.": ["Ms.", "Ms"], "mrs.": ["Mrs.", "Mrs"] };

  function countryRow(v) { return COUNTRIES.find(r => r.some(x => norm(x) === norm(v))); }

  // All the ways your value could appear in this form, most likely first.
  GF.variants = function (key, value, f) {
    const last = key.split(".").pop(), out = [value];
    if (/country/.test(last)) {
      const row = countryRow(value);
      if (row) {
        const [name, iso2, iso3, demonym, ...more] = row;
        // "Nationality" / "Citizenship" dropdowns often list demonyms ("Indian")
        if (/national|citizen/i.test(f.label)) out.push(name, demonym, ...more, iso3, iso2);
        else out.push(name, ...more, iso3, iso2, demonym);
      }
    }
    if (last === "sex") out.push(...(SEX[norm(value)] || []));
    if (/^(us_citizen|us_permanent_resident|visa_required)$/.test(last)) out.push(...(YESNO[norm(value)] || []));
    if (last === "degree") for (const [rx, alts] of DEGREES) if (rx.test(value.trim())) out.push(...alts);
    if (last === "prefix") out.push(...(PREFIX[value.toLowerCase()] || []));
    return [...new Set(out)];
  };

  // Phone: split "+91 98000 00000" when the form has its own country-code box.
  GF.phoneParts = function (value) {
    const m = /^\s*\+\s*(\d{1,3})[\s\-.)]*(.*)$/.exec(value);
    if (!m) return { code: "", national: value.replace(/[^\d]/g, "") };
    return { code: m[1], national: m[2].replace(/[^\d]/g, "") };
  };
  GF.codeVariants = function (code) {
    const row = COUNTRIES.find(r => r[0] && DIAL[r[0]] === code);
    const name = row ? row[0] : "";
    return [`+${code}`, code, name && `${name} (+${code})`, name && `+${code} (${name})`, name].filter(Boolean);
  };
  const DIAL = { "India": "91", "United States": "1", "Canada": "1", "United Kingdom": "44", "Germany": "49", "France": "33",
    "China": "86", "Japan": "81", "South Korea": "82", "Nepal": "977", "Bangladesh": "880", "Pakistan": "92", "Sri Lanka": "94",
    "Singapore": "65", "United Arab Emirates": "971", "Australia": "61", "Italy": "39", "Spain": "34", "Netherlands": "31" };

  // Dates in whatever order / separator the form shows ("DD-MM-YYYY", "yyyy.mm.dd", "MM/YY"…).
  GF.formatDateByHint = function (iso, hint) {
    const [y, mo, d] = iso.split("-");
    const parts = { dd: d, mm: mo, yyyy: y, yy: y.slice(2) };
    const three = /\b(dd|mm|yyyy|yy)\s*([\/\-. ])\s*(dd|mm|yyyy|yy)\s*\2\s*(dd|mm|yyyy|yy)\b/i.exec(hint);
    if (three) { const [, a, sep, b, c] = three; return [a, b, c].map(p => parts[p.toLowerCase()]).join(sep); }
    const two = /\b(mm|yyyy|yy)\s*([\/\-. ])\s*(mm|yyyy|yy)\b/i.exec(hint);
    if (two) { const [, a, sep, b] = two; return [a, b].map(p => parts[p.toLowerCase()]).join(sep); }
    return null;
  };

  // ---------- 3. choosing a dropdown option ----------
  const PLACEHOLDER = /^(select|choose|please|pick|--|—|-+|none selected|\.\.\.)/i;
  function stripParens(s) { return String(s).replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim(); }
  function bigrams(s) { const b = new Set(); for (let i = 0; i < s.length - 1; i++) b.add(s.slice(i, i + 2)); return b; }
  function similar(a, b) {
    const x = bigrams(norm(a)), y = bigrams(norm(b));
    if (!x.size || !y.size) return 0;
    let n = 0; for (const g of x) if (y.has(g)) n++;
    return (2 * n) / (x.size + y.size);
  }
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function scoreOne(text, value, v) {
    const nt = norm(text), nv = norm(v);
    if (!nv) return 0;
    if (nt === nv || (value && norm(value) === nv)) return 100;
    if (norm(stripParens(text)) === nv) return 95;
    const wt = words(text), wv = words(v);
    if (!wv) return 0;
    if (new RegExp(`^${esc(wv)}\\b`).test(wt)) return 85;     // "India (IN)", "Yes, I am…"
    if (new RegExp(`\\b${esc(wv)}\\b`).test(wt)) return 75;   // "01 - January"
    if (wt.length >= 4 && new RegExp(`^${esc(wt)}\\b`).test(wv)) return 65;
    const s = similar(text, v);
    return s >= 0.85 ? Math.round(70 * s) : 0;
  }
  GF.isPlaceholder = text => !String(text || "").trim() || PLACEHOLDER.test(String(text).trim());
  // Returns { opt, score, exact, sure, runnerUp }. "sure" = clearly better than every other option.
  GF.chooseOption = function (options, variants) {
    const scored = options
      .filter(o => String(o.text || "").trim() && !PLACEHOLDER.test(String(o.text).trim()))
      .map(o => {
        let best = 0;
        variants.forEach((v, i) => { const s = scoreOne(o.text, o.value, v) - Math.min(i, 5); if (s > best) best = s; });
        return { o, s: best };
      })
      .sort((a, b) => b.s - a.s);
    const top = scored[0], second = scored[1];
    if (!top || top.s < 60) return { opt: null, score: 0, exact: false, sure: false };
    const gap = top.s - (second ? second.s : 0);
    return { opt: top.o, score: top.s, exact: top.s >= 95, sure: top.s >= 95 || (top.s >= 70 && gap >= 10),
      runnerUp: second && second.s >= 60 && gap < 10 ? second.o : null };
  };
})();
