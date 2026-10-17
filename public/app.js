/* app.js — Mini ATS single-page frontend (vanilla JS + Tailwind). */
'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
const STAGE_LABEL = {
  applied: 'Applied', screening: 'Screening', interview: 'Interview',
  offer: 'Offer', hired: 'Hired', rejected: 'Rejected',
};
const STAGE_BADGE = {
  applied: 'bg-slate-100 text-slate-700',
  screening: 'bg-amber-100 text-amber-800',
  interview: 'bg-sky-100 text-sky-800',
  offer: 'bg-teal-100 text-teal-800',
  hired: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
};
const ACT_STYLE = {
  created: 'bg-emerald-100 text-emerald-700',
  stage_changed: 'bg-sky-100 text-sky-700',
  note_added: 'bg-amber-100 text-amber-700',
  deleted: 'bg-rose-100 text-rose-700',
};
const ACT_ICON = { created: '+', stage_changed: '⇄', note_added: '✎', deleted: '✕' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------- utils ---------- */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `rounded-lg px-4 py-2.5 text-sm text-white shadow-lg ${
    type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtRelative(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(iso);
}

function stars(r) {
  if (!r) return '<span class="text-slate-300">—</span>';
  return `<span class="text-amber-500 tracking-tight">${'★'.repeat(r)}${'☆'.repeat(5 - r)}</span>`;
}

function stageBadge(stage) {
  return `<span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${STAGE_BADGE[stage] || ''}">${esc(STAGE_LABEL[stage] || stage)}</span>`;
}

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- tab navigation ---------- */
let activeTab = 'dashboard';
function switchTab(tab) {
  activeTab = tab;
  $$('.tab-btn').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.className = `tab-btn px-4 py-1.5 rounded-md text-sm font-medium ${on ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'}`;
  });
  ['dashboard', 'candidates', 'pipeline'].forEach((t) => $('#view-' + t).classList.toggle('hidden', t !== tab));
  if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
  refresh();
}
$$('.tab-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.goto)));

function refresh() {
  if (activeTab === 'dashboard') renderDashboard();
  else if (activeTab === 'candidates') renderCandidates();
  else if (activeTab === 'pipeline') renderPipeline();
  if (!$('#drawer-wrap').classList.contains('hidden') && drawerId) renderDrawer(drawerId);
}

/* ---------- dashboard ---------- */
function statCard(label, value, sub) {
  return `<div class="bg-white rounded-xl border border-slate-200 p-5">
    <p class="text-xs font-medium text-slate-500 uppercase">${esc(label)}</p>
    <p class="text-3xl font-bold text-slate-900 mt-1">${esc(String(value))}</p>
    <p class="text-xs text-slate-500 mt-1">${esc(sub)}</p></div>`;
}

async function renderDashboard() {
  $('#stat-cards').innerHTML = '<div class="col-span-full text-sm text-slate-500 p-4">Loading…</div>';
  try {
    const m = await api('GET', '/api/metrics');
    $('#stat-cards').innerHTML =
      statCard('Total candidates', m.total, 'in the system') +
      statCard('In pipeline', m.inPipeline, 'not hired or rejected') +
      statCard('Hired this month', m.hiredThisMonth, 'offers accepted') +
      statCard('Avg days applied → hired', m.avgDaysAppliedToHired, 'per hire');

    const max = Math.max(1, ...['applied', 'screening', 'interview', 'offer', 'hired'].map((s) => m.byStage[s] || 0));
    $('#funnel').innerHTML = ['applied', 'screening', 'interview', 'offer', 'hired'].map((s) => `
      <div>
        <div class="flex justify-between text-xs mb-1">
          <span class="font-medium text-slate-700">${STAGE_LABEL[s]}</span>
          <span class="text-slate-500">${m.byStage[s] || 0} ever reached</span>
        </div>
        <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden">
          <div class="h-full rounded-full bg-emerald-500" style="width:${Math.round(((m.byStage[s] || 0) / max) * 100)}%"></div>
        </div>
      </div>`).join('');

    const conv = m.conversion;
    const convRow = (from, to, pct) => `
      <div class="flex items-center justify-between text-sm">
        <span class="text-slate-600">${STAGE_LABEL[from]} → ${STAGE_LABEL[to]}</span>
        <span class="font-semibold text-slate-900">${pct}%</span>
      </div>`;
    $('#conversion').innerHTML =
      convRow('applied', 'screening', conv.applied_to_screening_pct) +
      convRow('screening', 'interview', conv.screening_to_interview_pct) +
      convRow('interview', 'offer', conv.interview_to_offer_pct) +
      convRow('offer', 'hired', conv.offer_to_hired_pct);

    $('#avg-days').innerHTML = `<table class="w-full text-sm">
      <tbody>${['applied', 'screening', 'interview', 'offer'].map((s) => `
        <tr class="border-t border-slate-100">
          <td class="py-1.5 pr-2 text-slate-600">${STAGE_LABEL[s]}</td>
          <td class="py-1.5 text-right font-medium">${m.avgDaysInStage[s]} days</td>
        </tr>`).join('')}</tbody></table>`;

    $('#hires-by-role').innerHTML = m.hiresByRole.length
      ? m.hiresByRole.map((r) => `
        <div class="flex items-center justify-between text-sm">
          <span class="text-slate-600">${esc(r.role)}</span>
          <span class="font-semibold text-slate-900">${r.count}</span>
        </div>`).join('')
      : '<p class="text-sm text-slate-400">No hires yet.</p>';

    const act = await api('GET', '/api/activity?limit=8');
    $('#activity-feed').innerHTML = act.length ? act.map(activityItem).join('')
      : '<p class="text-sm text-slate-400">No activity yet.</p>';
  } catch (e) {
    $('#stat-cards').innerHTML = `<div class="col-span-full text-sm text-rose-600 p-4">Failed to load dashboard: ${esc(e.message)}</div>`;
  }
}

function activityItem(a) {
  return `<div class="flex gap-3 items-start">
    <div class="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${ACT_STYLE[a.type] || ''}">${ACT_ICON[a.type] || '•'}</div>
    <div class="min-w-0">
      <p class="text-sm text-slate-700">${esc(a.summary)}</p>
      <p class="text-xs text-slate-400">${fmtRelative(a.created_at)}</p>
    </div>
  </div>`;
}

/* ---------- candidates list ---------- */
const filt = { q: '', stage: '', role: '', sort: 'newest', page: 1 };
let rolesCache = [];

async function loadRoles() {
  rolesCache = await api('GET', '/api/roles');
  $('#filter-role').innerHTML = '<option value="">All roles</option>' +
    rolesCache.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
  $('#role-suggestions').innerHTML = rolesCache.map((r) => `<option value="${esc(r)}">`).join('');
}

async function renderCandidates() {
  if (!rolesCache.length) { try { await loadRoles(); } catch (e) { /* non-fatal */ } }
  $('#filter-role').value = filt.role;
  $('#sort-by').value = filt.sort;
  $('#search-q').value = filt.q;

  // stage chips with counts
  try {
    const m = await api('GET', '/api/metrics');
    $('#stage-chips').innerHTML =
      chip('', 'All', m.total) + STAGES.map((s) => chip(s, STAGE_LABEL[s], m.byStage[s] || 0)).join('');
    $$('#stage-chips .chip').forEach((c) => c.addEventListener('click', () => {
      filt.stage = c.dataset.stage; filt.page = 1; renderCandidates();
    }));
  } catch (e) { /* chips stay empty */ }

  $('#candidates-tbody').innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-slate-500">Loading…</td></tr>';
  const params = new URLSearchParams({ page: filt.page, limit: 12, sort: filt.sort });
  if (filt.q) params.set('q', filt.q);
  if (filt.stage) params.set('stage', filt.stage);
  if (filt.role) params.set('role', filt.role);

  try {
    const res = await api('GET', '/api/candidates?' + params.toString());
    $('#candidates-empty').classList.toggle('hidden', res.data.length > 0);
    $('#candidates-tbody').innerHTML = res.data.map((c) => `
      <tr class="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" data-id="${c.id}">
        <td class="px-4 py-3">
          <div class="font-medium text-slate-900">${esc(c.name)}</div>
          <div class="text-xs text-slate-500">${esc(c.email)}</div>
        </td>
        <td class="px-4 py-3 text-slate-600">${esc(c.role)}</td>
        <td class="px-4 py-3">${stageBadge(c.stage)}</td>
        <td class="px-4 py-3">${stars(c.rating)}</td>
        <td class="px-4 py-3 text-slate-500 hidden md:table-cell">${esc(c.source || '—')}</td>
        <td class="px-4 py-3 text-slate-500 hidden lg:table-cell">${fmtDate(c.updated_at)}</td>
      </tr>`).join('');
    $$('#candidates-tbody tr[data-id]').forEach((tr) =>
      tr.addEventListener('click', () => openDrawer(Number(tr.dataset.id))));

    $('#pagination').innerHTML = `
      <span class="text-slate-500">Page ${res.page} of ${res.totalPages} · ${res.total} candidate${res.total === 1 ? '' : 's'}</span>
      <div class="flex gap-2">
        <button id="pg-prev" ${res.page <= 1 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg border border-slate-300 text-sm disabled:opacity-40">← Prev</button>
        <button id="pg-next" ${res.page >= res.totalPages ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg border border-slate-300 text-sm disabled:opacity-40">Next →</button>
      </div>`;
    const prev = $('#pg-prev'), next = $('#pg-next');
    if (prev) prev.addEventListener('click', () => { filt.page--; renderCandidates(); });
    if (next) next.addEventListener('click', () => { filt.page++; renderCandidates(); });
  } catch (e) {
    $('#candidates-tbody').innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-rose-600">Failed to load: ${esc(e.message)}</td></tr>`;
  }
}

function chip(stage, label, count) {
  const on = filt.stage === stage;
  return `<button data-stage="${stage}" class="chip px-3 py-1.5 rounded-full text-xs font-medium border ${
    on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'}">
    ${esc(label)} · ${count}</button>`;
}

$('#search-q').addEventListener('input', debounce((e) => { filt.q = e.target.value.trim(); filt.page = 1; renderCandidates(); }, 300));
$('#filter-role').addEventListener('change', (e) => { filt.role = e.target.value; filt.page = 1; renderCandidates(); });
$('#sort-by').addEventListener('change', (e) => { filt.sort = e.target.value; filt.page = 1; renderCandidates(); });
$('#btn-add').addEventListener('click', () => openCandidateModal());
$('#quick-add').addEventListener('click', () => { switchTab('candidates'); openCandidateModal(); });

/* ---------- candidate form modal ---------- */
function openCandidateModal(candidate) {
  const isEdit = !!candidate;
  $('#modal-candidate-title').textContent = isEdit ? 'Edit candidate' : 'Add candidate';
  $('#form-error').classList.add('hidden');
  const f = $('#form-candidate');
  f.reset();
  $('#f-id').value = candidate ? candidate.id : '';
  if (candidate) {
    $('#f-name').value = candidate.name || '';
    $('#f-email').value = candidate.email || '';
    $('#f-role').value = candidate.role || '';
    $('#f-phone').value = candidate.phone || '';
    $('#f-exp').value = candidate.experience_years ?? '';
    $('#f-rating').value = candidate.rating ?? '';
    $('#f-source').value = candidate.source || '';
    $('#f-skills').value = candidate.skills || '';
    $('#f-resume').value = candidate.resume_url || '';
  }
  $('#modal-candidate').classList.remove('hidden');
  $('#f-name').focus();
}

function closeModal(id) { $(id).classList.add('hidden'); }
$$('[data-close-modal]').forEach((el) =>
  el.addEventListener('click', () => { closeModal('#modal-candidate'); closeModal('#modal-confirm'); }));

$('#form-candidate').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = $('#form-error');
  const body = {
    name: $('#f-name').value.trim(),
    email: $('#f-email').value.trim(),
    role: $('#f-role').value.trim(),
    phone: $('#f-phone').value.trim() || null,
    experience_years: $('#f-exp').value === '' ? null : Number($('#f-exp').value),
    rating: $('#f-rating').value === '' ? null : Number($('#f-rating').value),
    source: $('#f-source').value.trim() || null,
    skills: $('#f-skills').value.trim() || null,
    resume_url: $('#f-resume').value.trim() || null,
  };
  // client-side validation (mirrors server rules)
  const errors = [];
  if (!body.name) errors.push('Name is required.');
  if (!body.email) errors.push('Email is required.');
  else if (!EMAIL_RE.test(body.email)) errors.push('Email must be valid.');
  if (!body.role) errors.push('Role is required.');
  if (body.rating !== null && (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5))
    errors.push('Rating must be a whole number from 1 to 5.');
  if (body.experience_years !== null && (Number.isNaN(body.experience_years) || body.experience_years < 0 || body.experience_years > 60))
    errors.push('Experience must be between 0 and 60 years.');
  if (errors.length) {
    errBox.textContent = errors.join(' ');
    errBox.classList.remove('hidden');
    return;
  }
  errBox.classList.add('hidden');

  const id = $('#f-id').value;
  try {
    if (id) await api('PUT', '/api/candidates/' + id, body);
    else await api('POST', '/api/candidates', body);
    closeModal('#modal-candidate');
    toast(id ? 'Candidate updated' : 'Candidate added');
    rolesCache = [];
    refresh();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('hidden');
  }
});

/* ---------- confirm modal ---------- */
let confirmCb = null;
function askConfirm(message, cb) {
  $('#confirm-msg').textContent = message;
  confirmCb = cb;
  $('#modal-confirm').classList.remove('hidden');
}
$('#btn-confirm-yes').addEventListener('click', () => {
  closeModal('#modal-confirm');
  if (confirmCb) { const cb = confirmCb; confirmCb = null; cb(); }
});

async function deleteCandidate(id, name) {
  askConfirm(`Delete ${name}? This removes their profile, notes and history.`, async () => {
    try {
      await api('DELETE', '/api/candidates/' + id);
      toast('Candidate deleted');
      if (drawerId === id) closeDrawer();
      refresh();
    } catch (e) { toast(e.message, 'error'); }
  });
}

/* ---------- pipeline (kanban) ---------- */
let pipelineCache = [];

async function renderPipeline() {
  $('#kanban').innerHTML = '<p class="col-span-full text-sm text-slate-500 p-4">Loading pipeline…</p>';
  try {
    const res = await api('GET', '/api/candidates?limit=100&sort=oldest');
    pipelineCache = res.data;
    $('#kanban').innerHTML = STAGES.map((s) => {
      const cards = pipelineCache.filter((c) => c.stage === s);
      return `<div class="kanban-col bg-slate-50 rounded-xl border border-slate-200 p-2 min-h-[180px]" data-stage="${s}">
        <div class="flex items-center justify-between px-2 py-1.5">
          <span class="text-xs font-semibold uppercase text-slate-500">${STAGE_LABEL[s]}</span>
          <span class="text-xs font-bold bg-white border border-slate-200 rounded-full px-2 py-0.5">${cards.length}</span>
        </div>
        <div class="space-y-2 kanban-cards">${cards.map(kanbanCard).join('') || '<p class="text-xs text-slate-400 px-2 py-3 text-center">Drop cards here</p>'}</div>
      </div>`;
    }).join('');

    $$('#kanban .kanban-card').forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', card.dataset.id);
        card.classList.add('opacity-40');
      });
      card.addEventListener('dragend', () => card.classList.remove('opacity-40'));
      card.addEventListener('click', () => openDrawer(Number(card.dataset.id)));
    });
    $$('#kanban .kanban-col').forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('ring-2', 'ring-emerald-400'); });
      col.addEventListener('dragleave', () => col.classList.remove('ring-2', 'ring-emerald-400'));
      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('ring-2', 'ring-emerald-400');
        const id = Number(e.dataTransfer.getData('text/plain'));
        const to = col.dataset.stage;
        const cand = pipelineCache.find((c) => c.id === id);
        if (!cand || cand.stage === to) return;
        try {
          await api('PATCH', `/api/candidates/${id}/stage`, { stage: to });
          toast(`${cand.name} → ${STAGE_LABEL[to]}`);
          refresh();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  } catch (e) {
    $('#kanban').innerHTML = `<p class="col-span-full text-sm text-rose-600 p-4">Failed to load pipeline: ${esc(e.message)}</p>`;
  }
}

function kanbanCard(c) {
  return `<div draggable="true" data-id="${c.id}" class="kanban-card bg-white rounded-lg border border-slate-200 p-3 cursor-grab hover:shadow-md transition">
    <p class="font-medium text-sm text-slate-900 truncate">${esc(c.name)}</p>
    <p class="text-xs text-slate-500 truncate">${esc(c.role)}</p>
    <div class="mt-1.5 flex items-center justify-between">
      ${stars(c.rating)}
      ${c.experience_years != null ? `<span class="text-xs text-slate-400">${esc(String(c.experience_years))} yrs</span>` : ''}
    </div>
  </div>`;
}

/* ---------- detail drawer ---------- */
let drawerId = null;

function openDrawer(id) {
  drawerId = id;
  $('#drawer-wrap').classList.remove('hidden');
  renderDrawer(id);
}
function closeDrawer() {
  drawerId = null;
  $('#drawer-wrap').classList.add('hidden');
}
$$('[data-close-drawer]').forEach((el) => el.addEventListener('click', closeDrawer));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeDrawer(); closeModal('#modal-candidate'); closeModal('#modal-confirm'); }
});

async function renderDrawer(id) {
  $('#drawer-body').innerHTML = '<p class="text-sm text-slate-500">Loading…</p>';
  try {
    const c = await api('GET', '/api/candidates/' + id);
    const field = (label, value) => value ? `
      <div><p class="text-xs font-medium text-slate-500 uppercase">${label}</p>
      <p class="text-sm text-slate-800 mt-0.5">${value}</p></div>` : '';

    $('#drawer-body').innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div>
          <h3 class="text-xl font-bold text-slate-900">${esc(c.name)}</h3>
          <p class="text-sm text-slate-500">${esc(c.email)}</p>
        </div>
        ${stageBadge(c.stage)}
      </div>

      <div class="mt-4">
        <label class="text-xs font-medium text-slate-500 uppercase">Change stage</label>
        <select id="d-stage" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
          ${STAGES.map((s) => `<option value="${s}" ${s === c.stage ? 'selected' : ''}>${STAGE_LABEL[s]}</option>`).join('')}
        </select>
      </div>

      <div class="grid grid-cols-2 gap-4 mt-5">
        ${field('Role', esc(c.role))}
        ${field('Phone', esc(c.phone))}
        ${field('Experience', c.experience_years != null ? esc(String(c.experience_years)) + ' yrs' : '')}
        ${field('Rating', stars(c.rating))}
        ${field('Source', esc(c.source))}
        ${field('Applied', fmtDate(c.created_at))}
      </div>
      ${c.skills ? `<div class="mt-4">${field('Skills', esc(c.skills).split(',').map((s) =>
        `<span class="inline-block bg-slate-100 rounded-full px-2.5 py-0.5 text-xs mr-1 mb-1">${s.trim()}</span>`).join(''))}</div>` : ''}
      ${c.resume_url ? `<div class="mt-3"><a href="${esc(c.resume_url)}" target="_blank" rel="noopener" class="text-sm text-emerald-700 hover:underline">View resume ↗</a></div>` : ''}

      <div class="flex gap-2 mt-5">
        <button id="d-edit" class="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium hover:bg-slate-50">Edit</button>
        <button id="d-delete" class="flex-1 px-3 py-2 rounded-lg border border-rose-300 text-rose-600 text-sm font-medium hover:bg-rose-50">Delete</button>
      </div>

      <h4 class="font-semibold text-sm mt-7 mb-3">Notes (${c.notes.length})</h4>
      <div class="space-y-2">
        ${c.notes.length ? c.notes.map((n) => `
          <div class="bg-slate-50 rounded-lg p-3">
            <p class="text-sm text-slate-700 whitespace-pre-wrap">${esc(n.text)}</p>
            <p class="text-xs text-slate-400 mt-1">${fmtRelative(n.created_at)}</p>
          </div>`).join('') : '<p class="text-sm text-slate-400">No notes yet.</p>'}
      </div>
      <form id="d-note-form" class="mt-3 flex gap-2">
        <input id="d-note-text" placeholder="Add a note…" class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button class="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">Add</button>
      </form>

      <h4 class="font-semibold text-sm mt-7 mb-3">Stage history</h4>
      <div class="space-y-0">
        ${c.stage_history.map((h, i) => `
          <div class="flex gap-3">
            <div class="flex flex-col items-center">
              <div class="w-2.5 h-2.5 rounded-full ${i === c.stage_history.length - 1 ? 'bg-emerald-600' : 'bg-slate-300'} mt-1"></div>
              ${i < c.stage_history.length - 1 ? '<div class="w-px flex-1 bg-slate-200"></div>' : ''}
            </div>
            <div class="pb-5">
              <p class="text-sm text-slate-700">${h.from_stage ? `${esc(STAGE_LABEL[h.from_stage] || h.from_stage)} → <b>${esc(STAGE_LABEL[h.to_stage] || h.to_stage)}</b>` : `Applied as <b>${esc(STAGE_LABEL[h.to_stage] || h.to_stage)}</b>`}</p>
              <p class="text-xs text-slate-400">${fmtDate(h.changed_at)} · ${fmtRelative(h.changed_at)}</p>
            </div>
          </div>`).join('')}
      </div>`;

    $('#d-stage').addEventListener('change', async (e) => {
      try {
        await api('PATCH', `/api/candidates/${id}/stage`, { stage: e.target.value });
        toast(`Moved to ${STAGE_LABEL[e.target.value]}`);
        refresh();
      } catch (err) { toast(err.message, 'error'); renderDrawer(id); }
    });
    $('#d-edit').addEventListener('click', () => openCandidateModal(c));
    $('#d-delete').addEventListener('click', () => deleteCandidate(id, c.name));
    $('#d-note-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = $('#d-note-text').value.trim();
      if (!text) return;
      try {
        await api('POST', `/api/candidates/${id}/notes`, { text });
        toast('Note added');
        refresh();
      } catch (err) { toast(err.message, 'error'); }
    });
  } catch (e) {
    $('#drawer-body').innerHTML = `<p class="text-sm text-rose-600">Failed to load candidate: ${esc(e.message)}</p>`;
  }
}

/* ---------- init ---------- */
(function init() {
  const hash = location.hash.replace('#', '');
  switchTab(['dashboard', 'candidates', 'pipeline'].includes(hash) ? hash : 'dashboard');
})();
