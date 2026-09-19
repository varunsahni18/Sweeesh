# Real (non-synthetic) datasets — real names + real grades

Two genuinely public sources where a university or its registrar **published real
student names with grades/merit**. These are directory-information or gazette
publications, not synthetic, not anonymised.

> ⚠️ **Use these only for demo seed data, and be deliberate about it.** Sweesh's
> whole thesis is provenance and privacy. These are *published* (public) records —
> dean's lists are FERPA "directory information" released with the student's
> implicit consent unless they opted out; the Pakistani gazette is a government
> exam-result publication. Neither is private data. But treat them as **real
> people** — do not fabricate additional claims about them, and do not ship a demo
> that implies Sweesh minted these.

## 1. University of Iowa — Dean's & President's List (Spring 2026)

- **File:** `iowa_deans_list.csv` (8,737 students) + `iowa_deans.pdf` (source)
- **Source:** https://registrar.uiowa.edu/sites/registrar.uiowa.edu/files/2026-06/Spring2026_DeansPresidentsLists_6-17-2026_a_Rvsd6-29-26.pdf
- **Nature:** Real. The registrar publishes every semester's Dean's List (GPA 3.50–3.99) and President's List (4.00) as directory information. Students with privacy holds are excluded.
- **Fields:** `full_name, hometown, college, deans_list (Yes/No), presidents_list (Yes/No)`
- **Sweesh mapping:** this is exactly the `education.grade` registrar-only route made real — the institution (registrar) discloses a GPA tier per named student. `college` → `education.institution` sub-unit; `deans_list`/`presidents_list` → a registrar-signed grade-band claim.

### Caveats
- It's a **threshold/band** (GPA tier), not a numeric grade. Good for "grade withheld but band disclosed" demos.
- My CSV parser split `hometown` on the comma before the state code; multi-word hometowns like "Cedar Rapids, IA" split imperfectly (first word of the town stays glued to the name). The `full_name` column is reliable; `hometown` is approximate.

## 2. Quaid-i-Azam University (Islamabad) — B.Sc Gazette 2014

- **File:** `qau_bsc_results.csv` (1,254 records) + `qau_bsc.pdf` (source)
- **Source:** https://www.qau.edu.pk/Downloads/ict/b.scpart12014resultforwebsite.pdf
- **Nature:** Real. Government-university examination result gazette — the official published mark sheet.
- **Fields:** `s_no, reg_no, roll_no, full_name, marks, remarks`
- **Sweesh mapping:** the strongest real example of a registrar-disclosed numeric grade. `full_name` + numeric `marks` + `PASS`/`Failed in more than 2 papers`/subject-level remarks. A candidate's degree line could resolve to a real mark, real name, real issuer.

### Caveats
- Names include father's name appended (e.g. "ALIYA SAEED BHATTI SAEED IQBAL" = student "Aliya Saeed Bhatti", father "Saeed Iqbal"). Parser keeps them joined; split on the father's name if needed.
- Marks are total out of ~a few hundred, and "Failed" rows carry `-` with a remark. This is fine — it's a real distribution with passes *and* failures, which the synthetic set lacks.

## Why real names are rare (and what this means for the project)

FERPA (20 U.S.C. § 1232g) makes it illegal for US post-secondary institutions to
release **grades tied to an identifiable student** without consent. That is
precisely Sweesh's thesis: the grade is a registrar-only fact. So:

- **No modern flat "name + grade" CSV exists legally in the US.** Dean's/President's
  lists are the legal exception (directory information, opt-out).
- **Historical registers are the richest real source** (UC ClioMetric's 1893–1946
  registers: real name + course + grade, ~750k records), but their download links
  are dead (404) — they moved to a restricted Box/request-only access. I verified
  the links are broken; not worth chasing for a demo.
- **Overseas exam gazettes** (India/Pakistan universities) publish full name + marks
  openly — legally and routinely. QAU above is one; Osmania University, Anna
  University, etc. do the same.

## Recommended use

- **Authority/registrar demos:** QAU gazette (real numeric grade + name + issuer).
- **US directory-information demos:** Iowa Dean's/President's list (real name +
  GPA band + college).
- **Relational/registrar-structure demos:** the synthetic `mindweave` set in the
  parent `data/` folder (has course-level enrollment structure the real ones lack).

None of these should be presented as "Sweesh data." They are public seed fixtures.
