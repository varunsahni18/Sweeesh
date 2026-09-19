# Sweesh Education Dataset

**Source:** [mindweave/student-grades-enrollment](https://huggingface.co/datasets/mindweave/student-grades-enrollment) — Hugging Face
**License:** CC-BY-NC-4.0
**Version:** Free sample (2,553 rows across 5 tables). Full dataset = 38,567 rows (4,200 students), available via Gumroad.
**Nature:** Synthetic — a simulated mid-size US university ("Westfield"), not real student PII.

## Why this one

The Sweesh spec models education facts as path-addressed claims where **only the
registrar may disclose the recorded grade** (`education.grade`, registrar-only).
This dataset mirrors that structure exactly: it is registrar-shaped data — a
student roster plus a course catalogue plus an enrollment table carrying the
per-course grade the registrar recorded — rather than a flat "grades.csv".

This maps cleanly onto the Team B "authority DAG" + attestation model:

- `students.csv` → `education.institution` / `education.timeframe` / `education.degree` subjects
- `enrollments.csv` → `education.grade` + `education.classes[]` (registrar-signed, per course)
- `courses.csv` / `departments.csv` / `semesters.csv` → the institution/organisation graph
  (registrar → department → college → university)

## Tables

| File | Rows | What it is |
|------|------|------------|
| `students.csv` | 500 | `id, first_name, last_name, email, major_dept_id, enrollment_year, gpa, status` |
| `enrollments.csv` | 2,000 | `id, student_id, course_id, semester_id, grade, grade_points` |
| `courses.csv` | 39 | `id, department_id, code, name, credits, level` |
| `departments.csv` | 8 | `id, name, college, code` |
| `semesters.csv` | 6 | `id, name, start, end, note` |

## Notes

- `status` ∈ active / graduated.
- `semesters.csv` `note` column encodes two deliberate anomalies: a COVID remote
  semester grade bump and a "cheating scandal" semester (mass failures in one course).
- `courses.csv` codes are mislabeled in places (`CSCI-130` = "American Literature") —
  that's the source's own quirk; treat codes as opaque unless you re-map them.

## Other candidates considered

- **UCI "Student Performance" (Cortez & Silva 2008)** — real but *high school*
  Portuguese schools; grades are 0–20 with no names; wrong level for degree claims.
- **MIDFIELDR `midfielddata`** — real US undergraduate records (98k students) but
  fully anonymised, practice-only, R package distribution.
- **Kaggle "Student Scores" / "Student Performance 1000 Records"** — have names but
  flat, fictional, no registrar/course structure.

`mindweave/student-grades-enrollment` is the best fit: registrar-shaped, has names,
has grades, and is openly downloadable.
