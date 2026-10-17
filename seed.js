// seed.js — idempotent seed: clears all tables and re-inserts 24 realistic
// candidates spread across all 6 stages, with stage history over ~60 days,
// ratings, notes and an activity log so the dashboard looks alive.
// Usage: npm run seed
const db = require('./db');

// Deterministic PRNG so the seed data is reproducible.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261017);
const rint = (a, b) => a + Math.floor(rand() * (b - a + 1));

const NOW = Date.now();
const isoAgo = (days) => new Date(NOW - days * 86400000).toISOString();

// name, role, skills, exp, email, phone, source, rating, stage,
// appliedDaysAgo, stageReachedDaysAgo (when they reached their current stage),
// rejectedFrom (for rejected candidates)
const PEOPLE = [
  // ---- hired (4) ----
  { name: 'Aarav Sharma', role: 'Full Stack Developer', skills: 'React, Node.js, MongoDB, TypeScript', exp: 3.5, email: 'aarav.sharma.dev@gmail.com', phone: '+91 98110 22334', source: 'LinkedIn', rating: 5, stage: 'hired', applied: 58, at: 9 },
  { name: 'Priya Patel', role: 'Frontend Developer', skills: 'React, Vue.js, Tailwind CSS, Figma', exp: 2.5, email: 'priya.patel.ui@gmail.com', phone: '+91 98220 44551', source: 'Referral', rating: 4, stage: 'hired', applied: 50, at: 3 },
  { name: 'Rohan Verma', role: 'Backend Developer', skills: 'Node.js, PostgreSQL, Redis, Docker', exp: 4, email: 'rohan.verma.be@gmail.com', phone: '+91 98330 66772', source: 'Naukri', rating: 5, stage: 'hired', applied: 45, at: 35 },
  { name: 'Sneha Reddy', role: 'QA Engineer', skills: 'Selenium, Cypress, Postman, JMeter', exp: 3, email: 'sneha.reddy.qa@gmail.com', phone: '+91 98440 88993', source: 'Campus Drive', rating: 4, stage: 'hired', applied: 40, at: 27 },
  // ---- offer (3) ----
  { name: 'Arjun Nair', role: 'Full Stack Developer', skills: 'React, Express, MySQL, AWS', exp: 3, email: 'arjun.nair.fs@gmail.com', phone: '+91 98550 11224', source: 'LinkedIn', rating: 4, stage: 'offer', applied: 30, at: 6 },
  { name: 'Kavya Iyer', role: 'Data Analyst', skills: 'Python, SQL, Power BI, Excel', exp: 2, email: 'kavya.iyer.data@gmail.com', phone: '+91 98660 33445', source: 'Referral', rating: 4, stage: 'offer', applied: 26, at: 5 },
  { name: 'Aditya Singh', role: 'DevOps Engineer', skills: 'AWS, Kubernetes, Terraform, Jenkins', exp: 4.5, email: 'aditya.singh.devops@gmail.com', phone: '+91 98770 55666', source: 'Naukri', rating: 5, stage: 'offer', applied: 22, at: 4 },
  // ---- interview (5) ----
  { name: 'Ananya Rao', role: 'Full Stack Developer', skills: 'Angular, Node.js, GraphQL', exp: 2, email: 'ananya.rao.fs@gmail.com', phone: '+91 98880 77887', source: 'Company Website', rating: null, stage: 'interview', applied: 18, at: 7 },
  { name: 'Vikram Mehta', role: 'Backend Developer', skills: 'Java, Spring Boot, Kafka, MySQL', exp: 3.5, email: 'vikram.mehta.be@gmail.com', phone: '+91 98990 99008', source: 'LinkedIn', rating: 4, stage: 'interview', applied: 15, at: 6 },
  { name: 'Divya Menon', role: 'Frontend Developer', skills: 'React, TypeScript, Storybook', exp: 2.5, email: 'divya.menon.fe@gmail.com', phone: '+91 99001 12213', source: 'Referral', rating: 3, stage: 'interview', applied: 12, at: 5 },
  { name: 'Karan Malhotra', role: 'Mobile Developer', skills: 'Flutter, Dart, Firebase', exp: 2, email: 'karan.malhotra.app@gmail.com', phone: '+91 99112 34435', source: 'Naukri', rating: null, stage: 'interview', applied: 10, at: 4 },
  { name: 'Pooja Desai', role: 'UI/UX Designer', skills: 'Figma, Adobe XD, User Research', exp: 3, email: 'pooja.desai.ux@gmail.com', phone: '+91 99223 56657', source: 'Company Website', rating: 4, stage: 'interview', applied: 8, at: 3 },
  // ---- screening (4) ----
  { name: 'Rahul Joshi', role: 'Full Stack Developer', skills: 'React, Django, PostgreSQL', exp: 1.5, email: 'rahul.joshi.fs@gmail.com', phone: '+91 99334 78879', source: 'LinkedIn', rating: null, stage: 'screening', applied: 6, at: 3 },
  { name: 'Neha Kulkarni', role: 'Backend Developer', skills: 'Python, FastAPI, MongoDB', exp: 2, email: 'neha.kulkarni.be@gmail.com', phone: '+91 99445 90001', source: 'Referral', rating: null, stage: 'screening', applied: 5, at: 2 },
  { name: 'Suresh Yadav', role: 'Data Analyst', skills: 'SQL, Tableau, R', exp: 1, email: 'suresh.yadav.data@gmail.com', phone: '+91 99556 12223', source: 'Naukri', rating: null, stage: 'screening', applied: 4, at: 2 },
  { name: 'Ishita Bose', role: 'QA Engineer', skills: 'Playwright, API Testing, SQL', exp: 2.5, email: 'ishita.bose.qa@gmail.com', phone: '+91 99667 34445', source: 'Campus Drive', rating: 3, stage: 'screening', applied: 3, at: 1 },
  // ---- applied (5) ----
  { name: 'Manoj Tiwari', role: 'Full Stack Developer', skills: 'MERN Stack, REST APIs', exp: 1, email: 'manoj.tiwari.fs@gmail.com', phone: '+91 99778 56667', source: 'LinkedIn', rating: null, stage: 'applied', applied: 2, at: 2 },
  { name: 'Riya Kapoor', role: 'Frontend Developer', skills: 'React, JavaScript, CSS', exp: 1.5, email: 'riya.kapoor.fe@gmail.com', phone: '+91 99889 78889', source: 'Referral', rating: null, stage: 'applied', applied: 2, at: 2 },
  { name: 'Nikhil Agarwal', role: 'DevOps Engineer', skills: 'Linux, Docker, GitHub Actions', exp: 1, email: 'nikhil.agarwal.ops@gmail.com', phone: '+91 99990 90001', source: 'Naukri', rating: null, stage: 'applied', applied: 1, at: 1 },
  { name: 'Shreya Kulkarni', role: 'Backend Developer', skills: 'Node.js, Express, SQLite', exp: 1.5, email: 'shreya.k.be@gmail.com', phone: '+91 90001 12233', source: 'Company Website', rating: null, stage: 'applied', applied: 1, at: 1 },
  { name: 'Amit Chauhan', role: 'Data Analyst', skills: 'Excel, SQL, Python', exp: 0.5, email: 'amit.chauhan.data@gmail.com', phone: '+91 91112 34455', source: 'LinkedIn', rating: null, stage: 'applied', applied: 0.4, at: 0.4 },
  // ---- rejected (3) ----
  { name: 'Tanvi Deshmukh', role: 'Full Stack Developer', skills: 'React, Laravel, MySQL', exp: 2, email: 'tanvi.deshmukh.fs@gmail.com', phone: '+91 92223 45566', source: 'LinkedIn', rating: 2, stage: 'rejected', rejectedFrom: 'screening', applied: 25, at: 15 },
  { name: 'Varun Pillai', role: 'Backend Developer', skills: 'Go, gRPC, Cassandra', exp: 5, email: 'varun.pillai.be@gmail.com', phone: '+91 93334 56677', source: 'Naukri', rating: 3, stage: 'rejected', rejectedFrom: 'interview', applied: 35, at: 20 },
  { name: 'Meera Krishnan', role: 'Frontend Developer', skills: 'HTML, CSS, jQuery', exp: 1, email: 'meera.krishnan.fe@gmail.com', phone: '+91 94445 67788', source: 'Referral', rating: 2, stage: 'rejected', rejectedFrom: 'applied', applied: 28, at: 24 },
];

const NOTES = {
  'Aarav Sharma': [
    'Strong system design round — designed a URL shortener end-to-end. Culture fit: excellent.',
    'Negotiated start date: joining 2 Nov. Documents verified.',
  ],
  'Arjun Nair': ['Take-home submitted: clean React code with good tests. Panel is split on backend depth — discuss in hiring sync.'],
  'Kavya Iyer': ['SQL round was outstanding; asked sharp questions about our data pipeline.'],
  'Vikram Mehta': ['DSA round: solved 2/3. Needs a follow-up on concurrency basics before the offer call.'],
  'Divya Menon': ['Portfolio review done — impressive design-system work at her last startup.'],
  'Tanvi Deshmukh': ['Missed the scheduled screening call twice. Moving on.'],
  'Meera Krishnan': ["Portfolio didn't meet the senior bar for this role. Revisit in 6 months."],
  'Rohan Verma': ['Notice period negotiated down to 30 days. Reference check: positive.'],
};

const PATHS = {
  applied: ['applied'],
  screening: ['applied', 'screening'],
  interview: ['applied', 'screening', 'interview'],
  offer: ['applied', 'screening', 'interview', 'offer'],
  hired: ['applied', 'screening', 'interview', 'offer', 'hired'],
};

function pathFor(p) {
  if (p.stage === 'rejected') {
    const from = p.rejectedFrom || 'screening';
    const base = PATHS[from] || PATHS.screening;
    return [...base, 'rejected'];
  }
  return PATHS[p.stage];
}

function main() {
  // Idempotent: wipe everything first.
  db.exec('DELETE FROM activity_log; DELETE FROM notes; DELETE FROM stage_history; DELETE FROM candidates;');
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('candidates','stage_history','notes','activity_log');");

  const insertCand = db.prepare(`INSERT INTO candidates
    (name, email, phone, role, experience_years, skills, resume_url, stage, rating, source, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertHist = db.prepare(`INSERT INTO stage_history (candidate_id, from_stage, to_stage, changed_at) VALUES (?,?,?,?)`);
  const insertNote = db.prepare(`INSERT INTO notes (candidate_id, text, created_at) VALUES (?,?,?)`);
  const insertAct = db.prepare(`INSERT INTO activity_log (type, candidate_id, summary, created_at) VALUES (?,?,?,?)`);

  for (const p of PEOPLE) {
    const path = pathFor(p);
    // Build history backwards from the current stage so stage dates are realistic.
    const stops = []; // [{stage, daysAgo}]
    let t = p.at;
    for (let i = path.length - 1; i >= 0; i--) {
      if (i === 0) stops.unshift({ stage: path[i], daysAgo: p.applied });
      else {
        stops.unshift({ stage: path[i], daysAgo: t });
        t = Math.min(p.applied, t + rint(2, 9));
      }
    }
    const appliedAt = isoAgo(p.applied);
    const r = insertCand.run(
      p.name, p.email, p.phone, p.role, p.exp, p.skills,
      'https://example.com/resumes/' + p.email.split('@')[0] + '.pdf',
      p.stage, p.rating, p.source, appliedAt, isoAgo(stops[stops.length - 1].daysAgo)
    );
    const cid = Number(r.lastInsertRowid);

    let prev = null;
    for (const s of stops) {
      const at = isoAgo(s.daysAgo);
      insertHist.run(cid, prev, s.stage, at);
      insertAct.run(prev === null ? 'created' : 'stage_changed', cid,
        prev === null
          ? `${p.name} applied for ${p.role}`
          : `${p.name} moved from ${prev} to ${s.stage}`,
        at);
      prev = s.stage;
    }

    const notes = NOTES[p.name] || [];
    notes.forEach((text, i) => {
      const at = isoAgo(Math.max(0.3, stops[stops.length - 1].daysAgo - (i + 1) * 0.7));
      insertNote.run(cid, text, at);
      insertAct.run('note_added', cid, `Note added for ${p.name}`, at);
    });
  }

  const total = db.prepare('SELECT COUNT(*) AS c FROM candidates').get().c;
  const stages = db.prepare('SELECT stage, COUNT(*) AS c FROM candidates GROUP BY stage ORDER BY stage').all();
  console.log(`Seeded ${total} candidates.`);
  console.log('By stage:', stages.map((s) => `${s.stage}=${s.c}`).join(', '));
}

main();
