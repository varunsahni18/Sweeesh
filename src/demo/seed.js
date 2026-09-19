'use strict';

const { Registry } = require('../core/registry');

const YEAR = 365 * 24 * 60 * 60 * 1000;
const iso = (d) => new Date(d).toISOString();

/**
 * The demo scenario, matching the resume rendered in the visualisation.
 *
 * Nothing here declares a claim to be "authoritative". Every state the API
 * reports is derived by walking the accreditations below to a root the verifier
 * nominated. Delete a link and the claim degrades — that is the point.
 */
function seed() {
  const reg = new Registry();
  const now = Date.now();

  // ---------------------------------------------------------------- subject
  const subject = reg.addEntity({ id: 'subject:varun', name: 'Varun Sahni', kind: 'subject' });

  // ------------------------------------------------------------------ roots
  const usde = reg.addEntity({ id: 'root:usde', name: 'US Dept of Education', kind: 'root' });
  const ugc = reg.addEntity({ id: 'root:ugc', name: 'UGC (India)', kind: 'root' });
  const deReg = reg.addEntity({ id: 'root:de-register', name: 'DE Company Register', kind: 'root' });
  const ukReg = reg.addEntity({ id: 'root:uk-register', name: 'UK Company Register', kind: 'root' });

  // -------------------------------------------------------------- registers
  const msche = reg.addEntity({ id: 'reg:msche', name: 'MSCHE', kind: 'register' });
  const naac = reg.addEntity({ id: 'reg:naac', name: 'NAAC', kind: 'register' });
  const deSos = reg.addEntity({ id: 'reg:de-sos', name: 'Delaware SoS', kind: 'register' });
  const ch = reg.addEntity({ id: 'reg:companies-house', name: 'Companies House', kind: 'register' });

  // ----------------------------------------------------------- institutions
  const nyu = reg.addEntity({ id: 'inst:nyu', name: 'New York University', kind: 'institution' });
  const bits = reg.addEntity({ id: 'inst:bits', name: 'BITS-Pilani', kind: 'institution' });
  const qualcomm = reg.addEntity({ id: 'inst:qualcomm', name: 'Qualcomm', kind: 'employer' });
  const amd = reg.addEntity({ id: 'inst:amd', name: 'AMD', kind: 'employer' });
  const sc = reg.addEntity({ id: 'inst:sc', name: 'Standard Chartered', kind: 'employer' });

  // ----------------------------------------------------- delegated signers
  const nyuRegistrar = reg.addEntity({ id: 'person:nyu-registrar', name: 'NYU Registrar', kind: 'person', role: 'records officer' });
  const bitsRegistrar = reg.addEntity({ id: 'person:bits-registrar', name: 'BITS Registrar', kind: 'person', role: 'records officer' });
  const ananya = reg.addEntity({ id: 'person:ananya-rao', name: 'Ananya Rao', kind: 'person', role: 'Engineering Manager' });
  const marcus = reg.addEntity({ id: 'person:marcus-chen', name: 'Marcus Chen', kind: 'person', role: 'Staff Engineer' });
  const davidKim = reg.addEntity({ id: 'person:david-kim', name: 'David Kim', kind: 'person', role: 'Team Lead' });
  const rohit = reg.addEntity({ id: 'person:rohit-verma', name: 'Rohit Verma', kind: 'person', role: 'Manager' });

  // ------------------------------------------------------------------ peers
  const peer = (id, name, role) => reg.addEntity({ id, name, kind: 'person', role });
  const profChen = peer('person:prof-chen', 'Prof. Chen', 'advisor · NYU');
  const profMehta = peer('person:prof-mehta', 'Prof. Mehta', 'professor · BITS');
  const priya = peer('person:priya-nair', 'Priya Nair', 'peer · Qualcomm');
  const sarah = peer('person:sarah-lin', 'Sarah Lin', 'peer · AMD');
  const ravi = peer('person:ravi-menon', 'Ravi Menon', 'co-finalist');
  const neha = peer('person:neha-joshi', 'Neha Joshi', 'SparQ judge');
  const samK = peer('person:sam-kapoor', 'Sam Kapoor', 'teammate');
  const alexD = peer('person:alex-dsouza', "Alex D'Souza", 'mentor');
  const profKumar = peer('person:prof-kumar', 'Prof. Kumar', 'instructor');
  const rahul = peer('person:rahul-iyer', 'Rahul Iyer', 'lab partner');
  const divya = peer('person:divya-rao', 'Divya Rao', 'TA');
  const aditi = peer('person:aditi-shah', 'Aditi Shah', 'core team');
  const karan = peer('person:karan-mehta', 'Karan Mehta', 'member');
  const meera = peer('person:meera-pillai', 'Meera Pillai', 'organizer');

  // ------------------------------------------------------- authority chains
  // Compensation, exit reason and performance ratings are excluded at the
  // employer hop. Exclusions inherit downward and may only grow, so no manager
  // can be re-granted them further down the chain.
  const EMPLOYMENT_EXCLUSIONS = (org) => [
    `employment.${org}.compensation`,
    `employment.${org}.exitReason`,
    `employment.${org}.performanceRating`
  ];

  const acc = (issuerId, subjectId, scope, opts = {}) =>
    reg.issueAccreditation({ issuerId, subjectId, scope, ...opts });

  // education — US
  acc(usde.id, msche.id, { include: ['education.**'] });
  acc(msche.id, nyu.id, { include: ['education.nyu.**'] });
  acc(nyu.id, nyuRegistrar.id, {
    include: ['education.nyu.degree', 'education.nyu.timeframe', 'education.nyu.grade']
  });

  // education — India
  acc(ugc.id, naac.id, { include: ['education.**'] });
  acc(naac.id, bits.id, { include: ['education.bits.**'] });
  acc(bits.id, bitsRegistrar.id, { include: ['education.bits.degree', 'education.bits.timeframe'] });

  // employment — Delaware
  acc(deReg.id, deSos.id, { include: ['employment.**'] });
  acc(deSos.id, qualcomm.id, {
    include: ['employment.qualcomm.**'],
    exclude: EMPLOYMENT_EXCLUSIONS('qualcomm')
  });
  acc(deSos.id, amd.id, { include: ['employment.amd.**'], exclude: EMPLOYMENT_EXCLUSIONS('amd') });

  // The manager's accreditation is bounded to their own tenure. When they leave,
  // it expires — but attestations signed while it was live still verify.
  acc(qualcomm.id, ananya.id, {
    include: ['employment.qualcomm.work.**'],
    exclude: EMPLOYMENT_EXCLUSIONS('qualcomm')
  }, { validFrom: iso(now - 5 * YEAR), validUntil: iso(now - 0.5 * YEAR) });

  acc(qualcomm.id, marcus.id, {
    include: ['employment.qualcomm.work.**'],
    exclude: EMPLOYMENT_EXCLUSIONS('qualcomm')
  }, { validFrom: iso(now - 5 * YEAR), validUntil: iso(now + YEAR) });

  acc(amd.id, davidKim.id, {
    include: ['employment.amd.work.**'],
    exclude: EMPLOYMENT_EXCLUSIONS('amd')
  }, { validFrom: iso(now - 6 * YEAR), validUntil: iso(now + YEAR) });

  // employment — UK
  acc(ukReg.id, ch.id, { include: ['employment.**'] });
  acc(ch.id, sc.id, { include: ['employment.sc.**'], exclude: EMPLOYMENT_EXCLUSIONS('sc') });
  acc(sc.id, rohit.id, {
    include: ['employment.sc.work.**'],
    exclude: EMPLOYMENT_EXCLUSIONS('sc')
  }, { validFrom: iso(now - 7 * YEAR), validUntil: iso(now + YEAR) });

  // ------------------------------------------- HR-confirmed peer relationships
  // Peer standing grants the right to corroborate. It does not chain.
  // Academic peers have no institutional backing, so their overlap is not
  // HR-confirmable and they are weighted lower. That asymmetry is deliberate.
  reg.addRelationship({ kind: 'peer', orgId: qualcomm.id, aDid: priya.did, bDid: subject.did, from: iso(now - 4 * YEAR), to: iso(now - 2 * YEAR) });
  reg.addRelationship({ kind: 'peer', orgId: amd.id, aDid: sarah.did, bDid: subject.did, from: iso(now - 6 * YEAR), to: iso(now - 4 * YEAR) });

  // ----------------------------------------------------------- attestations
  const authoritative = (attesterId, claimPath, claims, opts = {}) =>
    reg.issueAttestation({ attesterId, subjectDid: subject.did, claimPath, claims, mode: 'authoritative', ...opts });

  const corroborate = (attesterId, claimPath, rel, extra = {}) =>
    reg.issueAttestation({
      attesterId,
      subjectDid: subject.did,
      claimPath,
      claims: { rel, ...extra },
      mode: 'corroborative'
    });

  const selfAssert = (claimPath, claims) =>
    reg.issueAttestation({ attesterId: subject.id, subjectDid: subject.did, claimPath, claims, mode: 'self-asserted' });

  authoritative(nyuRegistrar.id, 'education.nyu.degree', {
    institution: 'New York University',
    award: 'M.S. Computer Science',
    school: 'Courant Institute',
    conferred: '2024-05'
  }, { issuedAt: iso(now - 1.2 * YEAR) });

  authoritative(bitsRegistrar.id, 'education.bits.degree', {
    institution: 'BITS-Pilani',
    award: 'B.E. Electrical & Electronics',
    conferred: '2020-06'
  }, { issuedAt: iso(now - 5 * YEAR) });

  // Signed while Ananya's accreditation was still live.
  authoritative(ananya.id, 'employment.qualcomm.work.codebuddy', {
    statement: 'Built Code Buddy, an internal developer assistant',
    scope: 'team of 6',
    tools: ['C++', 'Python', 'LLVM'],
    teamRole: 'tech lead'
  }, { issuedAt: iso(now - 1.5 * YEAR) });

  authoritative(marcus.id, 'employment.qualcomm.work.codebuddy', {
    statement: 'Co-signed: led the compiler-integration workstream',
    outcome: 'build time down ~18%'
  }, { issuedAt: iso(now - 1.5 * YEAR), basis: 'attester-estimate' });

  authoritative(davidKim.id, 'employment.amd.work.bustrace', {
    statement: 'Owned the bus-trace analysis pipeline',
    tools: ['SystemVerilog', 'Python'],
    teamRole: 'individual contributor'
  }, { issuedAt: iso(now - 4 * YEAR) });

  authoritative(rohit.id, 'employment.sc.work.scpay', {
    statement: 'Delivered SC Pay merchant onboarding flows',
    tools: ['Java', 'Spring'],
    teamRole: 'engineer'
  }, { issuedAt: iso(now - 6 * YEAR) });

  // corroboration alongside authoritative claims
  corroborate(profChen.id, 'education.nyu.degree', 'advised');
  corroborate(profMehta.id, 'education.bits.degree', 'taught');
  corroborate(priya.id, 'employment.qualcomm.work.codebuddy', 'worked alongside');
  corroborate(sarah.id, 'employment.amd.work.bustrace', 'worked alongside');

  // corroborative-only claims — no accredited signer exists for these
  corroborate(ravi.id, 'achievements.sparq', 'competed together');
  corroborate(neha.id, 'achievements.sparq', 'judged the entry');
  corroborate(samK.id, 'achievements.sparq', 'built it together');
  corroborate(alexD.id, 'achievements.sparq', 'mentored');

  corroborate(profKumar.id, 'coursework.compiler', 'graded it');
  corroborate(rahul.id, 'coursework.compiler', 'paired on it');
  corroborate(divya.id, 'coursework.compiler', 'reviewed it');

  corroborate(aditi.id, 'leadership.arvrlab', 'served with');
  corroborate(karan.id, 'leadership.arvrlab', 'was on the team');
  corroborate(meera.id, 'leadership.arvrlab', 'co-organized');

  // self-asserted — bound to the subject's key, backed by nobody
  selfAssert('projects.cabinai', { name: 'CabinAI', summary: 'In-cabin assistant prototype' });
  selfAssert('projects.myai', { name: 'MyAI', summary: 'Personal assistant' });
  selfAssert('projects.healthsense', { name: 'HealthSense', summary: 'Wearable signal analysis' });
  selfAssert('skills.technical', { skills: ['C++', 'Python', 'TypeScript', 'LLVM', 'SystemVerilog'] });

  // ------------------------------------------------- resume layout for the UI
  // y0/y1 are fractional offsets into resume.png, carried so the visualisation
  // can be fully data-driven rather than hardcoding claim states.
  const resume = [
    { claimPath: 'education.nyu.degree', id: 'nyu', label: 'M.S. NYU Courant', y0: 0.09, y1: 0.109 },
    { claimPath: 'education.bits.degree', id: 'bits', label: 'B.E. BITS-Pilani', y0: 0.114, y1: 0.134 },
    { claimPath: 'employment.qualcomm.work.codebuddy', id: 'qual', label: 'Qualcomm · Code Buddy', y0: 0.165, y1: 0.275 },
    { claimPath: 'employment.amd.work.bustrace', id: 'amd', label: 'AMD · bus-trace pipeline', y0: 0.281, y1: 0.347 },
    { claimPath: 'employment.sc.work.scpay', id: 'sc', label: 'Standard Chartered · SC Pay', y0: 0.353, y1: 0.396 },
    { claimPath: 'achievements.sparq', id: 'ach', label: 'Achievements', y0: 0.427, y1: 0.494 },
    { claimPath: 'projects.cabinai', id: 'cabinai', label: 'CabinAI', y0: 0.525, y1: 0.602 },
    { claimPath: 'projects.myai', id: 'myai', label: 'MyAI', y0: 0.608, y1: 0.686 },
    { claimPath: 'projects.healthsense', id: 'health', label: 'HealthSense', y0: 0.691, y1: 0.778 },
    { claimPath: 'coursework.compiler', id: 'compiler', label: 'Compiler Construction', y0: 0.784, y1: 0.827 },
    { claimPath: 'leadership.arvrlab', id: 'lead', label: 'Leadership · AR/VR Lab', y0: 0.859, y1: 0.879 },
    { claimPath: 'skills.technical', id: 'skills', label: 'Technical Skills', y0: 0.911, y1: 0.961 }
  ];

  return { registry: reg, subject, resume };
}

module.exports = { seed };
