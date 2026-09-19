# **Sweesh \- Project Description, Technical Requirements & Team Plan**

Sweesh makes every line of a resume checkable, without anyone phoning a university or an old boss, and without the candidate handing over their life history to do it.

Today a resume is an unverified document. An employer either takes it on faith or pays a background-check company to spend three days making phone calls. The information that would settle the question already exists. The registrar has the transcript, the HR system has the dates, the old manager remembers the project. It sits in disconnected systems, none set up to answer questions, all of which lose interest in you the day you leave.

Sweesh turns each of those facts into a small signed statement, issued once, at the moment the fact becomes true. The university signs the degree when it confers it. HR signs the dates at hire and again at departure. The manager signs what the person actually did. The person collects those statements and keeps them.

When they apply for a job they send a **badge**: one link carrying the statements they choose to reveal. The employer's software checks every signature, then does the part that makes Sweesh different. It checks the signers.

That second step is the whole idea. A signature means nothing unless you know who signed. So Sweesh records authority the same way it records facts. The manager could sign because the company granted them that authority. The company appears in a national company register. The registrar could sign because the university employs them, and the university is accredited by a body the employer already trusts. Verification walks up that chain until it reaches a root the employer chose. **If any link is missing, unverifiable, expired or revoked, that claim does not pass.**

It does this without showing the employer the chain. They learn the degree is backed by a properly accredited institution under a root they trust. They do not learn which registrar signed it, which manager vouched, or anything not deliberately sent. That is what the zero-knowledge layer is for.

In one sentence: **Sweesh is a chain of custody for facts about a person, portable as one badge, verifiable end to end, revealing nothing beyond the answer.**

We are building three things.

1. **The protocol.** An open specification for attestations, delegated authority and proofs. Free and open source. The thing we want the world to adopt.  
2. **The software.** Products on top that make participating cost nothing, especially for the institutions that have to issue. This is the business.  
3. **The Atlas.** A live map of the institution network, which makes an invisible protocol legible, shareable and demoable.

## **The problem**

Verification is expensive because the cost sits on the party that captures none of the value. An employer wants the answer. A registrar or HR team has to produce it, gets paid nothing, and carries the liability. That asymmetry, not a missing technology, is why this has stayed broken.

The dominant workaround is to centralise the data. Equifax's Work Number holds more than 839 million employee records contributed by over 5 million employers, fed automatically through payroll, and sells access to verifiers. Employers hand over data because it makes verification requests someone else's problem. It works, and it gives one credit bureau a copy of the employment history of most of the American workforce.

Four gaps remain, and they define our opening.

| Gap | Why it persists | What Sweesh does |
| ----- | ----- | ----- |
| Payroll data knows dates and titles, nothing about what you did | Payroll systems do not record contribution | Manager attestations under delegated authority |
| Credentials verify, issuers do not | Blockcerts and similar systems verify a document but not that the issuer is a real accredited institution | Recursive authority chains to a verifier-chosen root |
| Verification costs privacy | Answering a query means revealing the record, and callback models tell the issuer where you are applying | Selective disclosure plus zero-knowledge path proofs |
| Records die with the relationship | Work email stops working the day you leave, which is the day you need it | Issue once at the moment of truth, prove for life |

The last row is the one to internalise. Any design where verification requires someone to answer a question later will fail, because the answerer has no incentive and often no longer exists. Every flow in Sweesh issues at the moment the fact becomes true and never asks the institution anything again.

## **Core concepts**

Everyone on all three teams should be able to use these ten words the same way.

| Term | Meaning |
| ----- | ----- |
| **Subject** | The person the claims are about. Identified by a key they control, never by a Sweesh account. |
| **Attestation** | One signed statement about a subject. The atomic unit. Not a document, a claim. |
| **Claim path** | The address of a fact inside the resume tree, e.g. `employment.e44.work.w7.tools`. Attestations target paths. |
| **Attester** | The entity that signs an attestation. Always an organisation legally; a person may be the signer acting under delegation. |
| **Accreditation** | An attestation whose content is authority: *this entity may attest these paths, about these subjects, until this date*. |
| **Authority chain** | The ordered accreditations from an attester up to a root. Each link must contain the one below it in scope. |
| **Root** | A trust anchor the verifier chooses. A national accreditor, a company register, a payroll provider. Sweesh is never a root. |
| **Scope** | The set of claim paths an attester may sign. Narrows at every hop down the chain and can never widen. |
| **Badge** | The portable object a subject sends. Carries selected claims and their proofs. |
| **Mode** | How a claim is backed. `authoritative` (delegated chain) or `corroborative` (peer, no authority). |

### **The two attestation modes**

This distinction matters and getting it wrong would be a serious modelling error.

**Authoritative.** Flows down a delegation chain from a root. A registrar signs a degree. A manager signs a work description under authority their employer granted. Answers: *is this backed by an institution?*

**Corroborative.** Peer to peer, no delegated authority. A coworker confirms what someone did. Answers: *do independent people who were there agree?*

Corroboration never converts into authority. It adds weight and is displayed as a count, never as a tick. Its strength comes from the corroborator's own verified standing, from whether HR independently confirms the two people overlapped, and from graph independence. Reciprocal-only clusters, where two people corroborate each other and nobody else, are detected and downweighted.

### **Extensibility**

Attestation types are open. `EducationAward`, `EmploymentPeriod`, `RoleAssignment` and `WorkContribution` ship in v1, but the schema is a registry, not an enum. A professional body can define `LicenceHeld`, a hospital `PrivilegesGranted`, a union `MembershipVerified`, with no protocol change. The rules that stay fixed are the ones that make verification sound: every attestation names its authority, every scope is path-addressed, and scope only ever narrows.

## **The knowledge partition**

Each attester signs only what they had first-hand knowledge of. This single rule produces the whole scope model and it has a consequence that is easy to miss: **HR grants the manager's authority but never sees what the manager writes.**

HR knows metadata. Dates, title, employment type, org unit, who reported to whom. HR does not know, and does not receive, the work descriptions. Those live under the manager's scope. The manager's attestation goes to the subject, not up to HR.

This is a real architectural constraint, not a policy preference. It means the HR connector writes `EmploymentPeriod` and `ReportingRelationship` attestations and has no read path to `WorkContribution` content. Team A must be able to demonstrate this, because it is the answer to an employee asking whether their old employer can read what their manager said about them. They cannot.

### **Education**

| Claim path | Registrar | Teacher | Collaborator |
| ----- | ----- | ----- | ----- |
| `education.institution` | yes |  |  |
| `education.timeframe` | yes |  |  |
| `education.degree` | yes |  |  |
| `education.grade` | yes |  |  |
| `education.classes[]` | yes | own course only |  |
| `project.description` |  | yes | corroborate |
| `project.tools[]` |  | yes | corroborate |
| `project.skills[]` |  | yes | corroborate |
| `project.links[]` |  | yes | corroborate |
| `project.collaborators[].role` |  | yes | own and peers |

Grade sits with the registrar, not the teacher. The teacher submits a grade; the registrar records it, possibly curved or amended. Only the registrar knows the recorded value, and in most jurisdictions only the registrar may disclose it.

### **Employment**

| Claim path | HR / HRIS | Manager | Coworker |
| ----- | ----- | ----- | ----- |
| `employment.employer` | yes |  |  |
| `employment.period` | yes |  |  |
| `employment.title` | yes |  |  |
| `employment.type` | yes |  |  |
| `employment.unit` | yes |  |  |
| `employment.reportsTo` | yes |  |  |
| `employment.compensation` | held, never disclosable |  |  |
| `employment.exitReason` | held, never disclosable |  |  |
| `employment.performanceRating` | held, never disclosable |  |  |
| `work.contribution.statement` | no visibility | yes | corroborate |
| `work.contribution.scope` | no visibility | yes | corroborate |
| `work.contribution.tools` | no visibility | yes | corroborate |
| `work.contribution.outcome` | no visibility | yes, with `basis` |  |
| `work.contribution.teamRole` | no visibility | yes | strongest corroboration |

Three fields are marked held but never disclosable on purpose. Compensation, exit reason and performance ratings are increasingly restricted by law and are exactly what an employer's counsel will worry about. Modelling them as structurally excluded paths lets a customer prove to their own legal team that the system cannot leak them.

### **Why peer corroboration is stronger at work than at university**

A student collaborator has no institutional backing; nobody can confirm they were on that project. At work, **HR can verify the peer relationship the same way it verifies the manager relationship.** "Both in org 44, overlapping March 2021 to August 2022" is an HRIS fact.

That closes the collusion hole. You can only be corroborated by people the employer confirms you worked alongside, in the window you are claiming. Two friends cannot inflate each other's records unless they genuinely worked together, in which case the corroboration is legitimate.

So HR issues two relationship types, both automatic from the org chart. `ReportingRelationship` grants authority. `PeerRelationship` grants standing to corroborate, which is weaker and does not chain.

### **Work email is a bootstrap, not evidence**

Work email proves current mailbox access. It does not prove employment, title or dates, and it stops working the day you leave, which is the day you need it. Use it once, at onboarding, to bind a person's key to an employee record. Never as evidence inside a badge.

## **The Universal Badge**

The badge is one object a person can send to anyone. A link, a QR code, or a file. The recipient needs no Sweesh account and no integration; a verifier page or a 40-line library is enough.

What it carries:

* The subject's public key and a freshness proof that they hold the matching private key  
* The claims they chose to reveal, each with its disclosed fields  
* A proof per claim: plain disclosure, a predicate, or a zero-knowledge path proof  
* The registry root each proof was made against  
* An audience and a nonce, so the badge cannot be replayed elsewhere

What it never carries: the full resume, the fields the subject withheld, the identity of intermediate attesters, or the shape of the authority chain.

### **Properties**

| Property | How |
| ----- | ----- |
| Portable | A static object. No callback to Sweesh, the university or the employer at verification time. |
| Offline-verifiable | Everything needed is in the badge plus a cached registry root. |
| Audience-bound | Signed over the recipient and a nonce. Forwarding it to a second employer fails. |
| Time-bound | The subject sets an expiry. A badge sent in March does not still open in December. |
| Revocable downstream | The subject can invalidate an issued badge without touching the underlying attestations. |
| Non-correlating | Two badges from the same person to different employers share no linkable identifier. |

The last property is the one that needs the cryptography. If both badges carry the same subject key or the same revocation index, two employers who compare notes can link them. BBS-style unlinkable presentations or per-audience pseudonyms are the fix, and this needs to be decided in week one rather than retrofitted.

### **Badge states**

A badge renders each claim in one of four states. Four states, not two, is deliberate. Reducing this to verified/unverified would destroy the information the model exists to carry.

| State | Meaning | Display |
| ----- | ----- | ----- |
| Authoritative | Complete chain to the verifier's root | Solid check, with the root named |
| Corroborative | No authority chain; N independent verified peers agree | Count, never a check |
| Self-asserted | The subject's own statement, cryptographically bound to them but backed by nobody | Neutral, explicitly labelled |
| Withheld | Exists but deliberately not disclosed | Visible as withheld, not hidden |

Showing withheld rather than omitting is a deliberate choice. It tells the employer the candidate is exercising control rather than concealing an absence, and it makes selective disclosure a visible feature instead of a suspicious gap.

## **Recursive verification and chain completeness**

The rule: **every attester must themselves be attested, recursively, until a root the verifier chose.** A break anywhere invalidates.

flowchart TD  
  R\["Root\<br/\>verifier's choice"\] \--\> A\["Accreditor"\]  
  A \--\> U\["University"\]  
  U \--\> G\["Registrar"\]  
  G \--\> C\["Degree claim"\]  
  R2\["Company register"\] \--\> E\["Employer"\]  
  E \--\> H\["HR system"\]  
  E \--\> M\["Manager"\]  
  H \--\> P\["Dates and title"\]  
  M \--\> W\["Work claim"\]

Each arrow is an accreditation. Verification checks at every hop that the signature is valid, the accreditation is within its validity window, neither party is revoked, and the child's scope is contained in the parent's. Scope containment is what stops a manager delegated to attest their own reports from attesting a stranger's degree.

### **One refinement I would make**

All-or-nothing across the whole badge would be a mistake. If a 2009 employer no longer exists and its chain cannot be completed, that should not invalidate a 2024 degree.

**Completeness is evaluated per claim, not per badge.** Each claim independently either reaches the root or does not. The badge then reports honestly: seven claims authoritative, two corroborative, one self-asserted.

The strict rule you described still holds where it matters. Within a single claim, there is no partial credit. A work description whose manager's accreditation has been revoked does not degrade to corroborative; it fails. The all-or-nothing applies to the chain, not to the resume.

This matters commercially as well. A product that returns a red cross because one link is missing will be switched off in a week. A product that returns a precise account of what is backed and what is not is one a recruiter will actually use.

### **Proving completeness without revealing the chain**

The tension: completeness requires walking the chain, but the verifier must not see it.

Resolution. The registry publishes a Merkle root over all currently valid accreditations, each leaf being (entity, scope, validity, parent). A zero-knowledge circuit proves, against that public root:

1. This claim was signed by key K  
2. K's holder is a leaf under root R  
3. That leaf's scope covers this claim path  
4. An unbroken parent chain exists from that leaf to R  
5. No link in the chain is revoked  
6. The subject binding holds

The verifier learns the claim is backed by a complete chain under a root they trust. They do not learn which university, which manager, how many hops, or which revocation slot. This is the core cryptographic deliverable and it is what makes the recursive rule compatible with the privacy promise.

## **End-to-end walkthrough**

One person, six years, no institution ever answers a question.

| When | Event | What Sweesh does | Human effort |
| ----- | ----- | ----- | ----- |
| Jun 2019 | Degree conferred | SIS webhook mints `EducationAward`. Registrar key signs. | None |
| Mar 2021 | Hired at Acme | HRIS webhook mints `EmploymentPeriod` (open-ended) and `ReportingRelationship` to manager e-8812. Email challenge binds her key. | None |
| Mar 2021 | Manager onboarded | Acme mints an accreditation to e-8812, scoped to `work.**` for direct reports, bounded to his tenure. | None |
| Nov 2022 | Project closes | Manager is prompted once. Drafts a statement, passes company disclosure policy review, signs. | 3 minutes, once |
| Nov 2022 | Peers prompted | Two teammates corroborate `teamRole` and `tools`. HR-issued `PeerRelationship` confirms overlap. | 30 seconds each |
| Nov 2023 | She leaves | HRIS closes the period. Manager's accreditation expires with his own tenure. Her email dies. | None |
| Feb 2026 | She applies | Builds a badge. Discloses degree and dates, withholds grade, proves tenure exceeded 24 months without dates, reveals one work claim. | 2 minutes |
| Feb 2026 | Employer verifies | Checks signatures, verifies ZK path proofs against the published root, renders per-claim states. | Instant |

Nothing in the 2026 column required Acme, the manager or the university to be reachable, willing, or still in business.

### **What the employer sees**

Senior Product Manager · Acme Corp · Mar 2021 – Nov 2023  
├─ employer            authoritative ✓   chain complete to Companies House  
├─ period              authoritative ✓  
├─ title               authoritative ✓  
├─ tenure \> 24 months  predicate     ✓   exact dates not revealed  
├─ compensation        structurally excluded  
│  
└─ Owned the pricing migration for the SMB segment  
   ├─ statement        authoritative ✓   signer not revealed  
   ├─ scope · team of 6 authoritative ✓  
   ├─ tools            authoritative ✓  
   ├─ churn −3pp       authoritative \~   basis: attester-estimate  
   └─ team role        corroborative ✓   3 peers, overlap HR-confirmed

BSc Computer Science · 2019  
├─ institution         authoritative ✓   chain complete to a recognised accreditor  
├─ timeframe           authoritative ✓  
├─ degree              authoritative ✓  
└─ grade               withheld by candidate

The employer never learns the manager's name, the university's identity inside the ZK proof, or the chain depth. They learn that each check reached a root they nominated.

## **Technical requirements**

### **Functional**

| ID | Requirement |
| ----- | ----- |
| F1 | Issue attestations of any registered type, signed by an organisation key, targeting claim paths |
| F2 | Issue accreditations carrying path patterns, subject constraints, validity windows and a max delegation depth |
| F3 | Enforce monotonic scope attenuation: a child's paths must be a subset of its parent's; exclusions inherit and may only grow |
| F4 | Resolve an authority chain from any attester to any verifier-nominated root, returning complete, incomplete or revoked |
| F5 | Evaluate completeness per claim, never per badge |
| F6 | Selective disclosure at field level, holder-controlled at presentation time |
| F7 | Predicate proofs over dates and durations without revealing the underlying values |
| F8 | Zero-knowledge chain proofs hiding intermediate attesters, chain depth and revocation index |
| F9 | Generate an audience-bound, time-bound, revocable badge |
| F10 | Verify a badge offline given a cached registry root |
| F11 | Corroborative attestations with independence scoring and reciprocal-cluster detection |
| F12 | Employer disclosure policy constraining what may be attested, restrictive by default |
| F13 | Issuer connectors minting from HRIS and SIS events with zero human touch |
| F14 | Revocation by issuer, and badge invalidation by the subject, independently |

### **Security**

| ID | Requirement |
| ----- | ----- |
| S1 | Organisation key rotation with historical validity; signatures made under a retired key still verify for their period |
| S2 | Archive DID documents and key history so verification survives a lapsed domain or a closed company |
| S3 | Holder binding: the presenter proves control of the subject key, with a fresh nonce |
| S4 | Replay resistance via audience binding plus nonce |
| S5 | Registry roots published to an append-only signed transparency log; roots are independently auditable |
| S6 | Attestations are content-addressed and tamper-evident |
| S7 | No privilege escalation through delegation under any chain shape, proven by adversarial test vectors |

### **Privacy**

| ID | Requirement |
| ----- | ----- |
| P1 | No personal data on any ledger, in clear text, encrypted or hashed form |
| P2 | No issuer callback at verification time; the issuer never learns where a subject applied |
| P3 | Two badges from one subject to different verifiers carry no linkable identifier |
| P4 | Revocation status lists large enough for herd privacy; list size must not identify the issuer |
| P5 | The public Atlas contains institutions only; no individual is ever a node |
| P6 | Subject consent recorded before any attestation about them is issued |
| P7 | HR systems have no read path to work-contribution content |

P1 is not a preference. The EDPB's finalised guidelines on blockchain advise against registering personal data on a blockchain in clear text, encrypted or hashed form, treat a hash referencing off-chain personal data as personal data, and reject technical impossibility as an excuse for non-compliance with erasure rights.

### **Performance**

| ID | Target |
| ----- | ----- |
| N1 | Badge verification under 200 ms for a 10-claim badge, excluding ZK |
| N2 | ZK proof verification under 50 ms per claim |
| N3 | ZK proof generation under 3 s per claim in-browser, or precomputed if not met |
| N4 | Attestation issuance under 500 ms from webhook receipt |
| N5 | Atlas first meaningful paint under 2 s; 60 fps pan and zoom at 5,000 nodes |
| N6 | Atlas rebuild pipeline completes in under 2 hours |

### **Compliance**

| ID | Requirement |
| ----- | ----- |
| C1 | Architecture must be defensible as holder-mediated, so Sweesh never assembles consumer reports. A US FCRA opinion gates this. |
| C2 | GDPR erasure must be satisfiable: attestations are deletable, registry leaves are organisational only |
| C3 | Education records handling must respect the registrar-only disclosure route for grades |
| C4 | Attestation vocabulary must be factual and scoped; evaluative language must be structurally unrepresentable |
| C5 | Interoperate with W3C VC 2.0 and SD-JWT VC so EU wallet credentials can be consumed and produced |

## **Architecture and locked decisions**

flowchart LR  
  HRIS\["HRIS / SIS"\] \--\> CONN\["Issuer connector"\]  
  CONN \--\> CORE\["sweesh-core\<br/\>sign, scope, status"\]  
  CORE \--\> HOLD\["Holder wallet"\]  
  REG\["Registry\<br/\>Merkle \+ log"\] \--\> CORE  
  REG \--\> PROVE\["Prover"\]  
  HOLD \--\> PROVE  
  PROVE \--\> BADGE\["Badge"\]  
  BADGE \--\> VER\["Verifier SDK"\]  
  REG \--\> VER  
  REG \--\> ATLAS\["Atlas pipeline"\]  
  ATLAS \--\> WEB\["Atlas web"\]

Six components. `sweesh-core` is the library everything else calls. The registry is the only shared state and it holds organisations only.

### **Locked decisions**

Agree these in week one and do not reopen them mid-build.

| Area | Choice | Reason |
| ----- | ----- | ----- |
| Credential format | SD-JWT VC | Where the EU wallet ecosystem converged |
| Data model | W3C VC 2.0 profile | Adopt, do not invent |
| Org identity | `did:web` | No infrastructure; institutions already own domains |
| Person identity | `did:key` | No registry, no correlation handle |
| Hierarchy model | EBSI-style verifiable accreditations | Root accreditor delegates to intermediates who delegate to issuers. Already specified; do not reinvent. |
| Trust metadata | OpenID Federation 1.0 concepts | Final spec; intermediates below a trust anchor with policy constraining further delegation |
| Revocation | Bitstring Status List | Herd privacy, cacheable, no callback |
| Transport | OID4VCI and OID4VP | Wallet-compatible |
| Registry | Merkle tree \+ append-only signed log | CT-shaped. No blockchain in phase one, and we say so on stage. |
| ZK toolchain | Circom \+ snarkjs, Groth16 | Deepest tooling, fastest to working |
| Demo curve | EdDSA over BabyJubjub | Roughly 10× cheaper in-circuit than P-256. Flagged publicly as a demo shortcut. |
| Clustering | Leiden | Better behaved than Louvain, drop-in |
| Layout | ForceAtlas2 or sfdp, server-side, seeded from prior run | Stability across rebuilds |
| Renderer | sigma.js v3 | Purpose-built WebGL, lowest risk for the timeline |
| Graph delivery | Static precomputed blobs on a CDN | No live graph queries |

### **Explicitly out of scope for phase one**

Blockchain of any kind. A wallet of our own. Identity proofing, meaning we bind to a key and do not establish that the key belongs to a named human. Registry governance and federation, which we design for but do not build. Email authentication, driving licences and passports, which dilute the story.

## **Cross-team contracts**

Three interfaces, frozen in week one with fake contents committed to the repo. Everything downstream builds against the fake version until the real one lands. Integration is the most likely cause of a bad demo, and this is the countermeasure.

| Contract | Producer | Consumer | Shape |
| ----- | ----- | ----- | ----- |
| `graph.v1.json` | Team B | Team C | nodes (id, label, type, ror/lei, size, community, x, y), edges (src, dst, weight, kind), communities, meta |
| `badge.v1.json` | Team A | Team C | subject key, claims with disclosed fields, proof per claim, registry root, audience, nonce, expiry |
| `verify(badge)` | Team A | Team C | One WASM or JS function returning per-claim `{state, root, unrevoked, mode}` |

Rules:

* A contract change needs sign-off from both sides and a version bump. No silent edits.  
* Team C never reads Team A's internals or Team B's pipeline. Only these three.  
* If a producer slips, the consumer keeps building against the fixture. Nobody blocks.

**Integration checkpoint: end of week 2, end to end, with stubs.** Not week 5\. Three parallel teams converging at the last minute is how demos die.

## **Team A — Protocol and core**

**Mission.** Make "verified" mean something precise and mechanically checkable, and make the authority chain walkable and provable.

**Size.** 3 to 4 engineers, at least one strong on cryptography. Owns the ZK track.

**Skills.** TypeScript, applied cryptography, JOSE and COSE, spec writing. One person who enjoys adversarial thinking.

### **Deliverables**

| Deliverable | Definition of done |
| ----- | ----- |
| `sweesh-spec` | Attestation, Accreditation and Badge documents, plus the path-pattern grammar. Implementable by someone not in the room. |
| `sweesh-core` | Issue, sign, disclose, verify, resolve chains, check status. TypeScript with a WASM build. |
| Chain resolver | Pure function, verifier-root parameterised, per-claim completeness. |
| Adversarial test suite | 10+ vectors, each failing before the fix and passing after. |
| Registry \+ log | Merkle tree over accreditation leaves, roots to an append-only signed log. |
| `verify(badge)` | The function Team C calls. Contract-stable from week 2\. |

### **Week by week**

| Week | Focus |
| ----- | ----- |
| 1 | Freeze the data model, the path grammar and the three contracts. Publish fixtures. Decide the unlinkability approach. |
| 2 | `sweesh-core` issue, sign, verify, selective disclosure, status lists. Ship stub `verify()` to Team C. |
| 3 | Chain resolution with monotonic attenuation. Adversarial suite. Employer disclosure policy enforcement. |
| 4 | Merkleise the registry. Transparency log. Corroboration scoring with reciprocal-cluster detection. |
| 5 | Harden. Key rotation and historical validity. Archive path for dead domains. Support Team C integration. |
| 6 | Freeze. Write the spec document. Rehearse. |

### **The adversarial suite**

This is the real deliverable and the most credible slide in the deck. Minimum vectors:

1. Attester claims a path outside their accreditation  
2. Intermediate accreditation expired when the attestation was signed  
3. Intermediate revoked after signing  
4. Delegation exceeding `maxDelegationDepth`  
5. Child scope wider than parent scope  
6. Cycle in the accreditation graph  
7. Manager attesting a subject outside their reporting line  
8. Excluded path re-granted downstream  
9. Badge replayed to a second audience  
10. Corroborators forming a reciprocal-only ring  
11. Claim valid under root X but not under root Y  
12. Attestation signed under a key retired before the signing date

### **Week-1 decisions Team A owns**

* Claim types shipping in v1 and how the type registry is extended  
* The exact path-pattern grammar, including wildcards and exclusions  
* Whether unlinkability comes from BBS-style presentations or per-audience pseudonyms  
* Circom or Noir, chosen once

## **Team B — Data and graph**

**Mission.** Produce a real, defensible institution graph from open data, and own the edge-weight function that decides whether the Atlas looks like insight or like a hairball.

**Size.** 2 to 3, data engineering and data science. Not frontend people.

**Skills.** Python, large XML and JSON processing, entity resolution, network science. Comfort with Leiden, ForceAtlas2 and the difference between them.

### **Source datasets**

| Source | Licence | What it gives | Priority |
| ----- | ----- | ----- | ----- |
| [ORCID Public Data File](https://info.orcid.org/documentation/integration-guide/working-with-bulk-data/) | CC0, annual | Education and employment affiliations per person, each marked as added by the record owner or by a trusted member organisation | 1 |
| [ROR](https://ror.org) | CC0 | \~104,000 organisations with acronyms, aliases and parent/child relations | 1 |
| [DAPIP](https://ope.ed.gov/dapip/) | CC0 | US accreditor → institution edges, across institution, accreditation record and agency action files | 1 |
| OpenAlex | CC0 | Author affiliation histories at better scale than ORCID | 2 |
| GLEIF LEI | Free bulk | Company identity plus parent/child relationship records | 2 |
| IPEDS | Public | Institution metadata for node sizing | 3 |
| O\*NET / ESCO / Lightcast Open Skills | Open | Vocabulary for work claims | 3 |

ORCID's distinction between validated items added by a trusted member organisation and self-asserted items added by the record owner is exactly our authoritative/self-asserted split, available for free at scale. Coverage is the catch: completeness is low and uneven, with only around 23% of ORCID records carrying employment information.

### **Two graphs, not one**

Conflating these would be the main way this work goes wrong.

**Authority DAG.** Directed, small, structural. Accreditor → university → registrar; register → company → manager. From DAPIP, ROR parent/child, GLEIF relationship records. This is what verification walks.

**Affinity graph.** Undirected, weighted, large, emergent. Institutions linked by how many people hold credentials from both. From ORCID and OpenAlex. This is what makes the map.

### **The edge-weight function**

This is the single highest-value piece of work Team B does, and it is a data-science problem, not a rendering problem. Assigning it to Team C is the standard way these maps fail.

The brief: **an edge must mean unusual overlap, not large overlap.** Raw co-occurrence ranks by size and produces an undifferentiated blob. What is needed is inverse-frequency weighting so that a person affiliated with 30 institutions contributes almost nothing while a person with 2 contributes a lot, then normalisation by institution size so the weight expresses proportion rather than volume, then top-k sparsification at roughly 8 to 20 neighbours per node.

Deliverable: a notebook showing the naive version beside the weighted version. It is also a good slide.

### **The honesty requirement**

ORCID and OpenAlex skew academic. The map will look like a research network, not a labour market. Two acceptable responses: lean into academia where the data is genuinely real, and supplement with synthetic employer data that is **visibly labelled as synthetic in the UI**. Never quietly mix. The entire product is about provenance; being caught faking provenance would be fatal in a way it would not be for another product.

### **Week by week**

| Week | Focus |
| ----- | ----- |
| 1 | Acquire ROR, DAPIP and one ORCID year. Publish `graph.v1.json` fixture for Team C. |
| 2 | Canonical org table keyed on ROR and LEI, with an alias index. Entity resolution pipeline. |
| 3 | Authority DAG from DAPIP and ROR parent/child. Affinity edges from ORCID affiliations. |
| 4 | Edge-weight function. Sparsification. Leiden clustering. Naive-versus-weighted comparison. |
| 5 | Layout with position seeding. Full `graph.v1.json` to Team C. Synthetic employer overlay, labelled. |
| 6 | Rebuild automation. Freeze. |

Budget roughly 60% of Team B's time on entity resolution. "MIT", "Massachusetts Institute of Technology", "M.I.T." and "MIT Media Lab" are four strings and one or two institutions, and ROR identifiers only cover part of the join.

## **Team C — Atlas and demo**

**Mission.** Make an invisible protocol visible. Build the live institution map and the badge inspector that together carry the whole pitch.

**Size.** 2 to 3 frontend engineers, at least one with WebGL or data-visualisation experience.

**Skills.** TypeScript, WebGL, sigma.js or equivalent, interaction design. One person with genuine visual taste.

### **The reference and what to take from it**

twitchmap builds a live map from Twitch chat: every streamer is a node sized by active chatters, pulled together by the chat they share. They track around 1,000 channels, count only people who actually type, filter bots, treat accounts that chat across dozens of channels as noise, and weight loyal chatters far more heavily. Communities are not assigned; they emerge from overlap and get a colour. A physics simulation lays everything out with nothing placed by hand. The map rebuilds every six hours from a rolling ten-day window and archives each week for timeline scrubbing.

Structurally that means precomputed static artefacts on a CDN and a hash-routed WebGL single-page app, never live graph queries. The lesson to carry: the visual quality comes from the weighting and the sparsification, which is Team B's work, not from shaders.

### **The privacy inversion**

twitchmap works because Twitch chat is public. A map of who verified whom would be the most sensitive graph imaginable, and someone in the demo audience will say so.

**Map institutions, never people.** Nodes are universities, employers, accreditors and professional bodies. Edges are accreditation and aggregated shared-people counts. An individual never appears. A candidate's badge is a private path highlight over a public map, stored nowhere.

| twitchmap | Sweesh Atlas |
| ----- | ----- |
| channel | institution |
| chatter | verified individual, never a node |
| chat overlap | shared verified people |
| community | sector or region cluster |
| node size | attestations issued |
| `#w1llyv` | `#/b/<badge-id>` |

### **The four interactions, in priority order**

1. **Fly to a node.** Click an institution: its cluster, its accreditor, its attestation volume, its strongest links.  
2. **Walk the chain.** Click "how do I know this?" and animate the path upward to the root. This is the thesis made visible and it is the thing to protect if the schedule compresses.  
3. **Drop a resume, light a path.** Paste a resume; each line resolves to a node; backed lines light their chain, unbacked lines grey out.  
4. **Prove it privately.** Toggle ZK mode. The path collapses to a badge, the verifier panel says valid, the map dims to root and claim. Show the two payloads side by side: full disclosure versus the proof. The visual contrast is the argument.

### **The badge inspector**

Cheaper to build than the map and it explains more. Make it the centrepiece and let the map draw people in. It renders the four states from the badge section, per claim path, with the attester shown only when the mode is plain disclosure.

### **Week by week**

| Week | Focus |
| ----- | ----- |
| 1 | Skeleton app against the `graph.v1.json` fixture. Hash routing. sigma.js rendering a fake 500-node graph. |
| 2 | Badge inspector against the `badge.v1.json` fixture, calling Team A's stub `verify()`. Integration checkpoint. |
| 3 | Interaction 1 and 2\. Chain-walk animation. Node detail panel. |
| 4 | Real graph from Team B. Community colours, sizing, labels, performance pass. |
| 5 | Interaction 3 and 4\. Real `verify()`. ZK mode. Payload comparison view. |
| 6 | Polish, mobile, fallback recording, rehearsal. |

### **Cut lines**

If the timeline compresses: keep interactions 2 and 3 and the badge inspector, on a curated 200-node graph, with a pre-recorded fallback. Cut glow effects, the timeline scrubber and leaderboards before cutting the chain walk.

## **The ZK track**

One or two people inside Team A. Ship in tiers so a slip degrades gracefully instead of killing the demo.

| Tier | Proves | Tech | Risk |
| ----- | ----- | ----- | ----- |
| 0 | Show some fields, hide others | SD-JWT salted disclosures | None. Ships regardless. |
| 1 | Tenure exceeded 24 months, without dates | Range proof over a commitment | Low |
| 2 | Backed by a complete chain under root R, without revealing the chain | Merkle membership, in-circuit signatures, recursive parent links, status bit | High |

Tier 0 is the floor the whole demo stands on. If tiers 1 and 2 both slip, selective disclosure alone still carries a credible privacy story.

### **Tier 2 circuit**

Public inputs: registry root, claim path, claim value commitment, audience, nonce. Private: the credential, the signature, the attester leaf, the Merkle path, the parent chain, the status witness.

The circuit asserts that the credential was signed by key K; that K's leaf sits under the root; that the leaf's scope covers the claim path; that an unbroken parent chain reaches the root; that no link's status bit is set; and that the holder controls the subject key bound in the credential.

The chain-walk inside the circuit is the hard part. Depth must be fixed and padded, because a variable-depth circuit would leak depth through proof shape. Fix it at four hops and pad shorter chains with self-referential links.

### **Two landmines, to be confronted in week 1 and 2**

**In-circuit signature verification.** Real credentials use ECDSA P-256 or Ed25519, both expensive in SNARK circuits. EdDSA over BabyJubjub is roughly an order of magnitude cheaper and is what circomlib provides. Decision: BabyJubjub for demo keys, stated publicly as a demo shortcut, with production requiring a P-256 circuit or a hybrid attestation. Saying this ourselves reads as competence. Being caught reads as hand-waving.

**Proving time.** Benchmark a toy circuit in week 2, before committing to live proving. If generation exceeds three seconds in-browser, precompute the demo proofs and perform verification live. Verification is milliseconds and still honestly demonstrates the property.

### **Week by week**

| Week | Focus |
| ----- | ----- |
| 1 | Toolchain chosen. Toy Merkle membership circuit compiling. |
| 2 | Signature-in-circuit benchmark. Proving-time decision made and recorded. |
| 3 | Tier 1 predicate proofs working end to end. |
| 4 | Tier 2 circuit: membership plus scope plus status. |
| 5 | Tier 2: fixed-depth parent chain. Integration with `verify()`. |
| 6 | Precompute demo proofs. Rehearse the failure path. |

## **Milestones and definition of done**

The six-week shape below assumes a demo date roughly six weeks out. That date is the one input everything else scales from, and it is currently unset.

| Milestone | Week | Gate |
| ----- | ----- | ----- |
| Contracts frozen, fixtures committed | 1 | All three teams building against fixtures |
| Integration end to end with stubs | 2 | A fake badge renders against a fake graph. Non-negotiable. |
| Chain resolution with adversarial suite green | 3 | 10+ vectors pass |
| Real graph in the Atlas | 4 | Team B's output renders at 60 fps |
| ZK tier 2 verifying | 5 | A real proof verifies in the inspector |
| Freeze and rehearse | 6 | Full run-through twice, plus the fallback |

### **Demo script, five minutes**

| Time | Beat |
| ----- | ----- |
| 0:00 | Open on the living map. Communities, motion, scale. No explanation. |
| 0:30 | "Everything here is institutions. No person is on this map, deliberately." |
| 0:45 | Click a university. Walk the chain to its accreditor. "This is how you know the issuer is real. Blockcerts never solved this." |
| 1:45 | Paste a resume. Lines light up. One stays grey. "That employer isn't in the network. Unverified doesn't mean false." |
| 2:45 | Click a work line item. Manager attestation, company delegation, register record. "This is the layer nobody has built." |
| 3:45 | Toggle ZK. Two payloads side by side. Valid. Map dims to root and claim. |
| 4:45 | Share the badge link. "This proves everything you just saw and reveals none of it." |

### **Definition of done**

**Demo day.** A live resume resolves against real accreditation data. The chain animates from accreditor to claim. A work item shows a manager attestation under company authority. A ZK proof verifies on stage without revealing the path. One line stays grey and we explain why that is correct behaviour.

**Month 3\.** One real issuer connected to an HRIS or SIS sandbox, minting automatically. The adversarial suite green. A published spec someone outside the team could implement.

**Month 6\.** The metric that matters is not users and not badges issued. It is **accredited issuers × attestations auto-minted per month with zero human touch**, and whether that number grows without sales touching it.

## **Challenges, risks and open decisions**

### **Existential**

**Corporate counsel already forbids what we are asking managers to do.** Most large employers instruct managers to give references limited to dates and title, routed through HR, because of defamation and negligent-referral exposure. Our core innovation asks managers to do the opposite. The design answers: attestations are factual and scoped, never evaluative, and the vocabulary should make evaluation unrepresentable; the company is the legal attester with the manager as signer under delegation; the company retains repudiation; subject consent is recorded; every outcome carries a `basis` field. Test this with one employment lawyer before Team A finalises the vocabulary. If it survives review, the product is buildable. If not, the manager layer becomes phase two and v1 ships period-and-role attestations.

**FCRA determines the company structure.** In the US, assembling information about consumers for employment decisions likely makes an entity a consumer reporting agency, with accuracy, dispute and adverse-action obligations. A strictly holder-mediated architecture, where Sweesh never assembles or furnishes anything, may sit outside that, and that argument collapses the moment we operate a lookup service or cache person-level data. Get an opinion early and let it shape whether Sweesh ever holds person-level data at all.

**Cold start.** The party who must act first captures the least. The only escape is selling something valuable on day one to an issuer with no network: verification-request deflection for registrars and HR teams who currently field these requests for free. Credentials enter the network as exhaust.

**The incumbent's moat is coverage.** We cannot out-cover 839 million records. Compete on what payroll data structurally cannot do: granular work claims, candidate-controlled disclosure, cross-border, and verification without paying per check.

### **Hard engineering**

| Challenge | Status |
| ----- | ----- |
| Holder binding: proving the key belongs to the named human | Unsolved without a government-grade source. Bind to EU wallets or mobile driving licences where available; elsewhere state that we prove credential authenticity, not identity. |
| In-circuit signature verification | BabyJubjub for demo, flagged publicly |
| Browser proving time | Benchmark week 2, precompute if over 3 s |
| Entity resolution | 60% of Team B's time, budgeted |
| Institutional key management | Rotation with historical validity; `did:web` means a DNS compromise is an issuer compromise |
| Company death | Archive DID documents and key history in the transparency log so verification survives a lapsed domain |
| Revocation privacy vs list size | Small issuers leak by list size; shared lists reintroduce coordination |
| Hairball risk | Team B's weighting problem, not Team C's rendering problem |

### **Manageable**

GDPR, answered by keeping all personal data off any ledger. Academic data skew, answered by owning it and labelling synthetic supplements. No global root for companies, answered by letting the verifier choose among registries, LEI records and payroll providers. Negative space, where verified-by-default penalises people from non-participating institutions, informal economies and disrupted careers, answered by designing "unverified is not false" into the UI rather than a policy page. A manager who refuses to attest, answered by HR facts and peer corroboration remaining unaffected, so refusal degrades a record rather than destroying it.

### **Open decisions needing an owner this week**

* Demo date. Everything above scales from this one number.  
* Who owns legal review, and is it FCRA first or employment liability first?  
* Circom or Noir.  
* Real academic data only, or academic plus labelled synthetic employer data?  
* Which HRIS or SIS sandbox can we actually get, and who is chasing it?  
* Unlinkability approach: BBS-style presentations or per-audience pseudonyms.  
* Does a peer corroborate only observable facts (role, tools) and never outcomes?  
* When is the manager prompted: at project close, at promotion, at departure, or all three?

