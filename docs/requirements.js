// Starter requirement checklists. Requirements differ by department, so every templated item
// starts UNCONFIRMED: tick "confirmed" once you have checked it on your program's own page.
// Gathered October 2026 from the pages listed in `sources`.
const TEMPLATES = {
  ucsb: {
    name: "UC Santa Barbara", match: /ucsb|santa barbara/i,
    sources: ["https://www.graddiv.ucsb.edu/eapp", "https://ucsb-atlas.atlassian.net/wiki/spaces/GUM/pages/18661146903/Minimum+Requirements+for+Admission"],
    items: [
      ["Online application (UCSB eApp)", "Start at graddiv.ucsb.edu/eapp"],
      ["Application fee", "Reported as $155 for international applicants — confirm on the portal"],
      ["Statement of purpose", "Some programs cap it at 2 pages"],
      ["Personal history / diversity statement", "Name and format vary by program"],
      ["CV / résumé", ""],
      ["Letters of recommendation", "Usually 3 — confirm the number with your department"],
      ["Unofficial transcripts for every institution attended", ""],
      ["English test score (TOEFL / IELTS / Duolingo)", "e.g. TOEFL iBT 80, IELTS 7, DET 120 in some departments; scores must be under 2 years old"],
      ["GRE scores", "Only if your program asks for them"],
      ["Writing sample", "Only some departments"],
    ],
  },
  uchicago: {
    name: "University of Chicago", match: /uchicago|university of chicago|\bchicago\b/i,
    sources: ["https://grad.uchicago.edu/admissions/apply/guidelines-and-deadlines", "https://grad.uchicago.edu/admissions/apply"],
    items: [
      ["Online application on your division's portal", "Each division has its own portal (e.g. apply-psd for Physical Sciences); one application per program"],
      ["Application fee", "Check the amount and waiver rules on the portal"],
      ["Statement of purpose", ""],
      ["CV / résumé", ""],
      ["Letters of recommendation", "Usually 3 — confirm with your department"],
      ["Transcripts uploaded for every school attended", "Unofficial is fine for applying; non-English documents need a certified translation"],
      ["English proficiency score or waiver", "Required of all applicants unless waived; e.g. TOEFL 90 / IELTS 7 in Geosciences"],
      ["GRE scores", "Varies — some departments do not accept GRE at all"],
      ["Writing sample", "Only some departments"],
    ],
  },
  cuboulder: {
    name: "CU Boulder", match: /boulder|colorado/i,
    sources: ["https://catalog.colorado.edu/graduate/admissions", "https://www.colorado.edu/graduateschool/admissions/where-begin/international-students/english-proficiency-requirements"],
    items: [
      ["Online application through your department", "Start at colorado.edu/bb/grad-apply"],
      ["Application fee", "Catalog lists $80 for international applicants — confirm on the portal"],
      ["Personal statement / statement of purpose", ""],
      ["CV / résumé", ""],
      ["Letters of recommendation", "3–4 depending on program"],
      ["Unofficial transcripts", ""],
      ["English test score (TOEFL / IELTS / Duolingo)", "Minimum set by each program (Duolingo floor 120); test within 2 years of your start term. TOEFL school code 4841"],
      ["GRE / department test scores", "Only if your program requires them"],
    ],
  },
  generic: {
    name: "Generic graduate application", match: /$^/,
    sources: [],
    items: [
      ["Online application", ""], ["Application fee", ""], ["Statement of purpose", ""], ["CV / résumé", ""],
      ["Letters of recommendation", ""], ["Transcripts", ""], ["English test score", ""], ["GRE scores", "If required"],
    ],
  },
};
