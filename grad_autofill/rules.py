"""Label -> profile-key matching rules, plus the lists of things the tool must never touch."""
import re

# Fields the tool will NEVER fill. They are listed for you to answer by hand.
MANUAL_ONLY = [
    (r"social security|\bssn\b", "US Social Security Number"),
    (r"\brace\b|ethnic|hispanic|latin[oa]", "race / ethnicity (voluntary demographic)"),
    (r"disabilit", "disability status"),
    (r"veteran|military", "military / veteran status"),
    (r"sexual orientation|gender identity|transgender", "voluntary demographic"),
    (r"criminal|convicted|felony|misdemeanor|disciplin|expelled|suspended|probation", "conduct / legal history"),
    (r"signature|\bsign\b|certif|attest|i agree|i affirm|i understand|acknowledg", "certification / signature"),
    (r"\bfees?\b|payment|credit card|card number|cvv|waiver", "payment / fee waiver"),
    (r"password|security question", "account security"),
]

# Buttons the tool will never click, and which the in-page guard blocks until you unlock it.
SUBMIT_LIKE = re.compile(r"submit|pay\b|payment|certify|finali[sz]e|sign and", re.I)
# Buttons the tool may click on `next`, after you confirm.
NEXT_LIKE = re.compile(r"^\s*(save\s*(&|and)?\s*)?(continue|next)\b|^\s*save\s*$", re.I)

# (profile key, regex, confidence). First match wins, so specific rules go first.
# "*" in a key is the list index chosen with `ctx <list> <n>`.
# confidence "low" rows are always flagged for your review.
RULES = [
    # recommenders (before generic name/email rules)
    ("recommenders.*.first_name", r"(recommend|referee|reference).*first|first.*(recommend|referee)", "high"),
    ("recommenders.*.last_name", r"(recommend|referee|reference).*(last|family|sur)|(last|family).*(recommend|referee)", "high"),
    ("recommenders.*.email", r"(recommend|referee|reference).*e-?mail", "high"),
    ("recommenders.*.institution", r"(recommend|referee|reference).*(institution|organi[sz]ation|employer|affiliation)", "high"),
    ("recommenders.*.title", r"(recommend|referee|reference).*(title|position)", "high"),
    ("recommenders.*.phone", r"(recommend|referee|reference).*(phone|mobile)", "high"),
    ("recommenders.*.relationship", r"relationship", "high"),
    ("recommenders.*.prefix", r"^(prefix|salutation)$", "low"),

    # tests
    ("tests.toefl.total", r"toefl.*(total|overall)", "high"),
    ("tests.toefl.reading", r"toefl.*reading", "high"),
    ("tests.toefl.listening", r"toefl.*listening", "high"),
    ("tests.toefl.speaking", r"toefl.*speaking", "high"),
    ("tests.toefl.writing", r"toefl.*writing", "high"),
    ("tests.toefl.date", r"toefl.*date", "high"),
    ("tests.toefl.registration_number", r"toefl.*(registration|appointment)", "high"),
    ("tests.ielts.overall", r"ielts.*(overall|total|band)", "high"),
    ("tests.ielts.reading", r"ielts.*reading", "high"),
    ("tests.ielts.listening", r"ielts.*listening", "high"),
    ("tests.ielts.speaking", r"ielts.*speaking", "high"),
    ("tests.ielts.writing", r"ielts.*writing", "high"),
    ("tests.ielts.date", r"ielts.*date", "high"),
    ("tests.ielts.trf_number", r"ielts.*(trf|form number)", "high"),
    ("tests.gre.verbal", r"gre.*verbal", "high"),
    ("tests.gre.quantitative", r"gre.*quant", "high"),
    ("tests.gre.writing", r"gre.*(analytical|writing)", "high"),
    ("tests.gre.date", r"gre.*date", "high"),
    ("tests.gre.registration_number", r"gre.*registration", "high"),
    ("tests.duolingo.score", r"duolingo.*score", "high"),
    ("tests.duolingo.date", r"duolingo.*date", "high"),

    # employment (before education: "start date" alone is ambiguous and handled below)
    ("employment.*.employer", r"employer|company|organi[sz]ation name", "high"),
    ("employment.*.title", r"job title|\bposition\b|\brole\b", "high"),
    ("employment.*.description", r"(job|duties|responsibilit)", "low"),

    # education
    ("education.*.institution", r"institution|university|college|school name", "high"),
    ("education.*.major", r"major|field of study|discipline|concentration", "high"),
    ("education.*.degree", r"degree (earned|received|type|awarded)|^degree$", "low"),
    ("education.*.gpa_scale", r"gpa.*scale|scale|out of|maximum (gpa|grade)", "high"),
    ("education.*.gpa", r"\bgpa\b|grade point|cgpa|cumulative average", "high"),
    ("education.*.status", r"degree status|completed\??$", "low"),

    # program
    ("program.term", r"\bterm\b|semester|entry (term|quarter)|\bquarter\b", "low"),
    ("program.program_name", r"program|department|major applying", "low"),
    ("program.degree", r"degree (sought|objective|applying)", "high"),
    ("program.area_of_interest", r"area of interest|research interest|specialization|emphasis", "high"),
    ("program.faculty_of_interest", r"faculty|professor|advisor", "low"),

    # personal
    ("personal.middle_name", r"middle", "high"),
    ("personal.preferred_name", r"preferred|nick ?name|chosen name", "high"),
    ("personal.former_names", r"former|previous|other names|maiden", "high"),
    ("personal.first_name", r"first name|given name|forename", "high"),
    ("personal.last_name", r"last name|family name|surname", "high"),
    ("personal.date_of_birth", r"birth ?date|date of birth|\bdob\b", "high"),
    ("citizenship.city_of_birth", r"city of birth|birth ?city|place of birth", "high"),
    ("citizenship.country_of_birth", r"country of birth|birth ?country", "high"),
    ("personal.pronouns", r"pronoun", "high"),
    ("personal.sex", r"^sex$|legal sex|gender", "low"),

    # citizenship
    ("citizenship.us_permanent_resident", r"permanent resident|green card", "high"),
    ("citizenship.us_citizen", r"u\.?s\.? citizen", "high"),
    ("citizenship.country_of_citizenship", r"citizenship|country of citizen", "low"),
    ("citizenship.visa_type", r"visa type|type of visa", "low"),
    ("citizenship.visa_required", r"visa", "low"),

    # contact
    ("contact.alternate_email", r"(alternate|secondary|other) e-?mail", "high"),
    ("contact.email", r"e-?mail", "high"),
    ("contact.phone", r"phone|mobile|cell|telephone", "high"),
    ("contact.address.line1", r"(address|street).*(1|line 1|one)|^street|^address$", "high"),
    ("contact.address.line2", r"(address|street).*(2|line 2|two)|apt|suite", "high"),
    ("contact.address.postal_code", r"postal|zip|pin ?code", "high"),
    ("contact.address.city", r"\bcity\b|town", "low"),
    ("contact.address.state", r"\bstate\b|province|region", "low"),
    ("contact.address.country", r"country", "low"),

    # dates that only make sense with list context
    ("*.start_date", r"(start|from|begin|attended from)", "low"),
    ("*.end_date", r"(end|to\b|until|graduat|completion|conferr)", "low"),

    ("misc.how_did_you_hear", r"how did you (hear|learn)", "high"),
]

DOCUMENT_RULES = [
    ("documents.cv", r"\bcv\b|resume|curriculum vitae"),
    ("documents.statement_of_purpose", r"statement of purpose|\bsop\b|purpose"),
    ("documents.personal_history", r"personal (history|statement)|diversity"),
    ("documents.transcript", r"transcript|mark ?sheet"),
]

_COMPILED = [(k, re.compile(p, re.I), c) for k, p, c in RULES]
_MANUAL = [(re.compile(p, re.I), why) for p, why in MANUAL_ONLY]
_DOCS = [(k, re.compile(p, re.I)) for k, p in DOCUMENT_RULES]


def manual_reason(label):
    for rx, why in _MANUAL:
        if rx.search(label):
            return why
    return None


def match_key(label, is_file=False):
    """Return (key, confidence) or (None, None)."""
    if is_file:
        for key, rx in _DOCS:
            if rx.search(label):
                return key, "low"  # always ask: right file version?
        return None, None
    for key, rx, conf in _COMPILED:
        if rx.search(label):
            return key, conf
    return None, None
