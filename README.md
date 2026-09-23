# Sweeesh

Chain of custody for facts about a person — every line of a resume checkable, without phoning a university or an old boss, and without the candidate handing over their life history.

One badge carries the claims a person chooses to reveal. The employer's software checks every signature, then checks the signers: verification walks up a delegation chain (person → institution → register → root) until it reaches a root the verifier chose. If any link is missing, expired or revoked, that claim does not pass.

## Repo layout

- `docs/` — project description, technical requirements, and team plan
- `Sweeesh/visualisation/` — the Atlas / trust-graph demo

## Visualisation

Open `Sweeesh/visualisation/index.html` in a browser. It shows a resume at the centre,
with the people who verified each block on the left and the authority chain
(institution → register → root) on the right.

- `index.html` — the demo (self-contained, references `./resume.png`)
- `resume.png` — rendered resume
- `render_resume.py` — re-render `resume.png` from a PDF (requires PyMuPDF: `pip install pymupdf`)
- `extract_blocks.py` — extract block coordinates from a PDF (for re-mapping overlay boxes)
- 
