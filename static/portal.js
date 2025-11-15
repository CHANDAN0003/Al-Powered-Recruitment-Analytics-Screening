// portal.js - UI interactions for AI Recruitment Portal
// Vanilla JS only: handles theme, auth modal, OTP, dashboards, modals, toasts, chatbot.

(function () {
  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function getCSRFToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.content) return meta.content;
    // Fallback: read from cookie 'csrf'
    try {
      const cookies = document.cookie ? document.cookie.split(';') : [];
      for (const c of cookies) {
        const [k, v] = c.split('=');
        if (k && k.trim() === 'csrf') {
          return decodeURIComponent(v || '');
        }
      }
    } catch (e) {}
    return '';
  }

  function csrfHeaders() {
    const token = getCSRFToken();
    return token ? { 'X-CSRF-Token': token } : {};
  }

  function createToast(msg, type = 'info') {
    const root = $('#toast-root') || document.body;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    if (type === 'error') el.style.background = '#b91c1c';
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 200);
    }, 2800);
  }

  // Modal helpers
  function showBackdrop(backdrop) {
    if (!backdrop) return;
    backdrop.classList.add('show');
    const modal = backdrop.querySelector('.modal');
    if (modal) {
      modal.classList.add('show');
    }
  }

  function hideBackdrop(backdrop) {
    if (!backdrop) return;
    const modal = backdrop.querySelector('.modal');
    if (modal) modal.classList.remove('show');
    setTimeout(() => backdrop.classList.remove('show'), 180);
  }

  function bindBackdropClose(backdrop) {
    if (!backdrop) return;
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) hideBackdrop(backdrop);
    });
    backdrop.addEventListener('requestClose', () => hideBackdrop(backdrop));
  }

  // Global state
  let intentRole = 'candidate';    // From landing buttons
  let authMode = 'login';          // 'login' or 'signup'
  let jobsCache = [];              // For candidate job list
  let recruiterJobsCache = [];     // For recruiter "My Jobs"

  // ---------- Theme Toggle ----------
  function initTheme() {
    const btn = $('#theme-toggle');
    if (!btn) return;

    // Set aria-pressed based on current theme.
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    btn.setAttribute('aria-pressed', current === 'dark');

    btn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'light';
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem('portal-theme', next);
      } catch (e) {}
      btn.setAttribute('aria-pressed', next === 'dark');
    });
  }

  // ---------- Auth Modal / Landing ----------
  function initAuthModal() {
    const backdrop = $('#auth-backdrop');
    const tabIn = $('#tab-in');
    const tabUp = $('#tab-up');
    const panelIn = $('#panel-in');
    const panelUp = $('#panel-up');

    if (!backdrop || !tabIn || !tabUp || !panelIn || !panelUp) return;

    bindBackdropClose(backdrop);

    const btnRecruiter = $('#btn-recruiter');
    const btnCandidate = $('#btn-candidate');
    const openAuth = $('#open-auth');

    function openModalForRole(role) {
      intentRole = role || 'candidate';
      showBackdrop(backdrop);
      setActiveTab('login');
      // Set default role chip
      setPanelRole(panelIn, intentRole);
      setPanelRole(panelUp, intentRole);
    }

    btnRecruiter && btnRecruiter.addEventListener('click', () => openModalForRole('recruiter'));
    btnCandidate && btnCandidate.addEventListener('click', () => openModalForRole('candidate'));
    openAuth && openAuth.addEventListener('click', () => openModalForRole(intentRole));

    function setActiveTab(mode) {
      authMode = mode === 'signup' ? 'signup' : 'login';
      if (authMode === 'login') {
        tabIn.classList.add('active');
        tabUp.classList.remove('active');
        panelIn.style.display = 'block';
        panelUp.style.display = 'none';
        panelIn.setAttribute('aria-hidden', 'false');
        panelUp.setAttribute('aria-hidden', 'true');
      } else {
        tabUp.classList.add('active');
        tabIn.classList.remove('active');
        panelUp.style.display = 'block';
        panelIn.style.display = 'none';
        panelUp.setAttribute('aria-hidden', 'false');
        panelIn.setAttribute('aria-hidden', 'true');
      }
    }

    tabIn.addEventListener('click', () => setActiveTab('login'));
    tabUp.addEventListener('click', () => setActiveTab('signup'));

    // Switch text links
    $('#switch-to-signup')?.addEventListener('click', () => setActiveTab('signup'));
    $('#switch-to-signin')?.addEventListener('click', () => setActiveTab('login'));

    // Role chips
    function setPanelRole(panel, role) {
      if (!panel) return;
      const chips = $$('.chip', panel);
      chips.forEach((chip) => {
        const active = chip.dataset.role === role;
        chip.classList.toggle('active', active);
        chip.setAttribute('aria-pressed', active);
      });
      panel.dataset.role = role;
    }

    function initRoleToggle(panel) {
      if (!panel) return;
      const chips = $$('.chip', panel);
      chips.forEach((chip) =>
        chip.addEventListener('click', () => {
          setPanelRole(panel, chip.dataset.role);
        })
      );
    }

    initRoleToggle(panelIn);
    initRoleToggle(panelUp);
    setPanelRole(panelIn, 'candidate');
    setPanelRole(panelUp, 'candidate');

    // OTP flow
    const sendOtpBtn = $('#send-otp');
    const verifyOtpBtn = $('#verify-otp');
    const resendOtpBtn = $('#resend-otp');
    const otpWrap = $('#otp-wrap');
    const otpInputs = $$('#otp-inputs input');

    function setupOtpInputs() {
      otpInputs.forEach((input, idx) => {
        input.value = '';
        input.addEventListener('input', () => {
          if (input.value && idx < otpInputs.length - 1) {
            otpInputs[idx + 1].focus();
          }
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !input.value && idx > 0) {
            otpInputs[idx - 1].focus();
          }
        });
      });
    }

    function getOtpCode() {
      return otpInputs.map((i) => i.value).join('');
    }

    sendOtpBtn &&
      sendOtpBtn.addEventListener('click', async () => {
        const email = $('#login-email')?.value.trim();
        const password = $('#login-pass')?.value.trim();
        const role = panelIn.dataset.role || intentRole;

        if (!email || !password) {
          createToast('Enter email and password to send OTP', 'error');
          return;
        }

        const form = new FormData();
        form.append('mode', 'login');
        form.append('role', role);
        form.append('email', email);
        form.append('password', password);

        try {
          const resp = await fetch('/api/auth/start', {
            method: 'POST',
            headers: csrfHeaders(),
            body: form,
          });
          const data = await resp.json();
          if (!data.ok) {
            createToast(data.error || 'Failed to send OTP', 'error');
            return;
          }
          authMode = 'login';
          otpWrap.style.display = 'block';
          setupOtpInputs();
          otpInputs[0]?.focus();
          createToast('OTP sent to your email');
        } catch (e) {
          createToast('Network error while sending OTP', 'error');
        }
      });

    verifyOtpBtn &&
      verifyOtpBtn.addEventListener('click', async () => {
        const code = getOtpCode();
        if (code.length !== 6) {
          createToast('Enter full 6-digit OTP', 'error');
          return;
        }
        const email = $('#login-email')?.value.trim();
        const password = $('#login-pass')?.value.trim();
        const role = panelIn.dataset.role || intentRole;

        const form = new FormData();
        form.append('mode', authMode); // 'login' or 'signup'
        form.append('role', role);
        form.append('email', email);
        form.append('password', password);
        form.append('code', code);

        try {
          const resp = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: csrfHeaders(),
            body: form,
          });
          const data = await resp.json();
          if (!data.ok) {
            createToast(data.error || 'OTP verification failed', 'error');
            return;
          }

          const dest = data.role === 'recruiter' ? '/recruiter/dashboard' : '/candidate/dashboard';
          createToast('OTP verified. Redirecting…');
          window.location.assign(dest);
        } catch (e) {
          createToast('Network error while verifying OTP', 'error');
        }
      });

    resendOtpBtn &&
      resendOtpBtn.addEventListener('click', async () => {
        const email = $('#login-email')?.value.trim();
        const password = $('#login-pass')?.value.trim();
        const role = panelIn.dataset.role || intentRole;

        if (!email || !password) {
          createToast('Enter email and password first', 'error');
          return;
        }

        const form = new FormData();
        form.append('mode', authMode);
        form.append('role', role);
        form.append('email', email);
        form.append('password', password);

        try {
          const resp = await fetch('/api/auth/start', {
            method: 'POST',
            headers: csrfHeaders(),
            body: form,
          });
          const data = await resp.json();
          if (!data.ok) {
            createToast(data.error || 'Failed to resend OTP', 'error');
            return;
          }
          otpWrap.style.display = 'block';
          setupOtpInputs();
          otpInputs[0]?.focus();
          createToast('OTP resent');
        } catch (e) {
          createToast('Network error while resending OTP', 'error');
        }
      });

    // Signup
    const createAccountBtn = $('#create-account');
    createAccountBtn &&
      createAccountBtn.addEventListener('click', async () => {
        const name = $('#su-name')?.value.trim();
        const email = $('#su-email')?.value.trim();
        const pass = $('#su-pass')?.value.trim();
        const pass2 = $('#su-pass2')?.value.trim();
        const role = panelUp.dataset.role || 'candidate';

        if (!name || !email || !pass) {
          createToast('Fill all signup fields', 'error');
          return;
        }
        if (pass !== pass2) {
          createToast("Passwords don't match", 'error');
          return;
        }

        const form = new FormData();
        form.append('mode', 'signup');
        form.append('role', role);
        form.append('email', email);
        form.append('password', pass);
        form.append('name', name);

        try {
          const resp = await fetch('/api/auth/start', {
            method: 'POST',
            headers: csrfHeaders(),
            body: form,
          });
          const data = await resp.json();
          if (!data.ok) {
            createToast(data.error || 'Signup failed', 'error');
            return;
          }
          // Move to login + show OTP inputs with email prefilled
          setActiveTab('login');
          $('#login-email').value = email;
          $('#login-pass').value = pass;
          otpWrap.style.display = 'block';
          authMode = 'signup';
          setupOtpInputs();
          otpInputs[0]?.focus();
          createToast('Account created. OTP sent for verification.');
        } catch (e) {
          createToast('Network error during signup', 'error');
        }
      });

    // "Sign in with password" is not wired yet (UI-only for now)
    $('#sign-in-password')?.addEventListener('click', () => {
      createToast('Password-only login is not configured. Please use OTP flow.', 'info');
    });
  }

  // ---------- Chatbot Ask (global) ----------
  async function chatbotAsk() {
    const input = $('#chat_prompt');
    if (!input) return;
    const prompt = input.value.trim();
    if (!prompt) return;

    const box = $('#chat_box');
    if (box) {
      const you = document.createElement('div');
      you.className = 'msg';
      you.innerHTML = `<strong>You:</strong> ${prompt}`;
      box.appendChild(you);
      box.scrollTop = box.scrollHeight;
    }

    try {
      const resp = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ prompt }),
      });
      const data = await resp.json();
      if (box) {
        const bot = document.createElement('div');
        bot.className = 'msg bot';
        bot.innerHTML = `<strong>Bot:</strong> ${data.answer || 'No answer.'}`;
        box.appendChild(bot);
        box.scrollTop = box.scrollHeight;
      }
    } catch (e) {
      createToast('Chat error. Check server /chat endpoint.', 'error');
    }

    input.value = '';
  }

  // expose globally
  window.chatbotAsk = chatbotAsk;

  // ---------- Candidate Dashboard ----------
  function applyJobFilters(jobs) {
    const q = ($('#job-search')?.value || '').toLowerCase();
    const loc = ($('#job-location')?.value || '').toLowerCase();

    const wantRemote = $('#flt-remote')?.checked;
    const wantOnsite = $('#flt-onsite')?.checked;
    const wantHybrid = $('#flt-hybrid')?.checked;

    return jobs.filter((j) => {
      const text = `${j.title || ''} ${j.description || ''} ${j.skills || ''}`.toLowerCase();
      if (q && !text.includes(q)) return false;
      const jloc = (j.location || '').toLowerCase();
      if (loc && loc !== '' && !jloc.includes(loc)) return false;
      // basic location checkboxes
      if (wantRemote && !jloc.includes('remote')) return false;
      if (wantOnsite && !(jloc.includes('on-site') || jloc.includes('onsite'))) return false;
      if (wantHybrid && !jloc.includes('hybrid')) return false;
      return true;
    });
  }

  function renderCandidateStatus() {
    const cont = $('#status-cards');
    if (!cont) return;

    const apps = JSON.parse(localStorage.getItem('applications') || '[]');
    const total = apps.length;
    const short = apps.filter((a) => a.status === 'shortlisted').length;
    const interview = apps.filter((a) => a.status === 'interview').length;
    const rejected = apps.filter((a) => a.status === 'rejected').length;
    const offer = apps.filter((a) => a.status === 'offer').length;

    const cardHTML = (label, num) =>
      `<div class="card"><div class="helper">${label}</div><div style="font-size:26px;font-weight:800">${num}</div></div>`;

    cont.innerHTML =
      cardHTML('Applied', total) +
      cardHTML('Shortlisted', short) +
      cardHTML('Interviews', interview) +
      cardHTML('Rejected', rejected) +
      cardHTML('Offers', offer);
  }

  async function renderCandidateJobs() {
    const list = $('#jobs-list');
    const empty = $('#jobs-empty');
    if (!list || !empty) return;

    list.innerHTML = '';
    empty.style.display = 'block';
    list.style.display = 'none';

    try {
      const resp = await fetch('/api/jobs');
      const data = await resp.json();
      jobsCache = data.ok ? data.jobs || [] : [];
    } catch (e) {
      jobsCache = [];
      createToast('Failed to load jobs (check /api/jobs)', 'error');
    }

    const jobs = applyJobFilters(jobsCache);

    if (!jobs.length) {
      empty.style.display = 'block';
      list.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    list.style.display = 'flex';

    jobs.forEach((j, index) => {
      const card = document.createElement('div');
      card.className = 'job-card';
      const company = (j.recruiter_name || 'Company').split(' ')[0];
      const initials = company.substring(0,2).toUpperCase();
      const skills = (j.skills || '').split(',').map(s=>s.trim()).filter(Boolean);
      
      // Create job tags based on available data
      const tags = [];
      if (j.category || skills[0]) tags.push(`<span class="job-tag category">📁 ${j.category || skills[0] || 'General'}</span>`);
      if (j.type) tags.push(`<span class="job-tag type">🕒 ${j.type}</span>`);
      else tags.push(`<span class="job-tag type">🕒 Full Time</span>`);
      if (j.salary) tags.push(`<span class="job-tag salary">💰 ${j.salary}</span>`);
      else tags.push(`<span class="job-tag salary">💰 30,000-40,000</span>`);
      if (j.location) tags.push(`<span class="job-tag location">📍 ${j.location}</span>`);
      else tags.push(`<span class="job-tag location">📍 Goa, India</span>`);

      const timeAgo = `${Math.floor(Math.random() * 30) + 1} min ago`;

      card.innerHTML = `
        <div class="job-avatar">${initials}</div>
        <div class="job-info">
          <h3>${j.title || 'Untitled Role'}</h3>
          <div class="job-company">${company}</div>
          <div class="job-time">${timeAgo}</div>
          <div class="job-tags">${tags.join('')}</div>
        </div>
        <div class="job-actions">
          <button class="job-bookmark" title="Bookmark">
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z"/>
            </svg>
          </button>
          <button class="job-details-btn apply-now" data-job-id="${j.id}">Job Details</button>
        </div>
      `;
      list.appendChild(card);
    });

    $$('.apply-now', list).forEach((btn) =>
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-job-id');
        const input = $('#apply-job-id');
        if (input) input.value = id;
        const backdrop = $('#apply-backdrop');
        showBackdrop(backdrop);
      })
    );

    // Add bookmark functionality
    $$('.job-bookmark', list).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.classList.toggle('bookmarked');
        const jobCard = btn.closest('.job-card');
        const jobTitle = jobCard.querySelector('h3').textContent;
        if (btn.classList.contains('bookmarked')) {
          createToast(`Bookmarked "${jobTitle}"`, 'success');
          btn.style.color = '#4F46E5';
        } else {
          createToast(`Removed bookmark for "${jobTitle}"`, 'info');
          btn.style.color = '';
        }
      });
    });
  }

  function initCandidateDashboard() {
    const path = window.location.pathname;
    if (!path.includes('/candidate/dashboard')) return;

    const applyBackdrop = $('#apply-backdrop');
    bindBackdropClose(applyBackdrop);

    $('#apply-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formEl = $('#apply-form');
      const formData = new FormData(formEl);

      const file = $('#apply-resume')?.files?.[0];
      if (!file) {
        createToast('Please attach a resume (.pdf or .doc/.docx)', 'error');
        return;
      }

      // Ensure job_id present
      const jobId = $('#apply-job-id')?.value;
      formData.set('job_id', jobId);

      try {
        const resp = await fetch('/api/candidate/apply', {
          method: 'POST',
          headers: csrfHeaders(),
          body: formData,
        });
        const data = await resp.json();
        if (!data.ok) {
          createToast(data.error || 'Failed to submit application', 'error');
          return;
        }

        const apps = JSON.parse(localStorage.getItem('applications') || '[]');
        apps.push({ id: data.application_id || Date.now(), status: 'applied' });
        localStorage.setItem('applications', JSON.stringify(apps));

        createToast('Application submitted');
        hideBackdrop(applyBackdrop);
        renderCandidateStatus();
      } catch (e) {
        createToast('Network error while applying', 'error');
      }
    });

    // Initialize jobs listing
    renderCandidateJobs();
    renderCandidateStatus();
  }

  // ---------- Recruiter Dashboard ----------
  async function loadRecruiterJobs() {
    const list = $('#jobs-list');
    const empty = $('#jobs-empty');
    if (!list || !empty) return;

    list.innerHTML = '';
    empty.style.display = 'block';
    list.style.display = 'none';

    try {
      const resp = await fetch('/api/recruiter/jobs');
      const data = await resp.json();
      recruiterJobsCache = data.ok ? data.jobs || [] : [];
    } catch (e) {
      recruiterJobsCache = [];
      createToast('Failed to load recruiter jobs (check /api/recruiter/jobs)', 'error');
    }

    if (!recruiterJobsCache.length) {
      empty.style.display = 'block';
      list.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    list.style.display = 'flex';

    recruiterJobsCache.forEach((j) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
          <div>
            <div style="font-weight:700">${j.title || 'Untitled Role'}</div>
            <div class="helper">${j.location || ''}</div>
            <div class="helper" style="margin-top:4px">${j.skills || ''}</div>
            <div class="helper" style="margin-top:4px">${j.description || ''}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
            <button class="btn btn-ghost btn-edit-job" data-job-id="${j.id}">Edit</button>
            <button class="btn btn-ghost btn-delete-job" data-job-id="${j.id}">Delete</button>
          </div>
        </div>
      `;
      list.appendChild(card);
    });

    // Buttons
    $$('.btn-edit-job', list).forEach((btn) =>
      btn.addEventListener('click', () => openEditJobModal(btn.getAttribute('data-job-id')))
    );
    $$('.btn-delete-job', list).forEach((btn) =>
      btn.addEventListener('click', () => deleteJob(btn.getAttribute('data-job-id')))
    );
  }

  function openEditJobModal(id) {
    const job = recruiterJobsCache.find((j) => String(j.id) === String(id));
    if (!job) {
      createToast('Could not find job details', 'error');
      return;
    }

    $('#edit-job-id').value = job.id;
    $('#edit-job-title').value = job.title || '';
    $('#edit-job-location').value = job.location || '';
    $('#edit-job-desc').value = job.description || '';
    $('#edit-job-skills').value = job.skills || '';
    $('#edit-job-salary').value = job.salary || '';
    $('#edit-job-exp').value = job.experience || '';

    const backdrop = $('#edit-job-backdrop');
    showBackdrop(backdrop);
  }

  async function deleteJob(id) {
    if (!confirm('Are you sure you want to delete this job?')) return;

    try {
      const resp = await fetch(`/api/recruiter/jobs/${id}`, {
        method: 'DELETE',
        headers: csrfHeaders(),
      });
      const data = await resp.json();
      if (!data.ok) {
        createToast(data.error || 'Failed to delete job', 'error');
        return;
      }
      createToast('Job deleted');
      await loadRecruiterJobs();
    } catch (e) {
      createToast('Network error while deleting job', 'error');
    }
  }

  async function loadRanking() {
    const table = $('#ranked-candidates-table');
    const empty = $('#ranked-candidates-empty');
    const tbody = $('#ranked-candidates-body');

    if (!table || !empty || !tbody) return;

    tbody.innerHTML = '';
    empty.style.display = 'block';
    table.style.display = 'none';

    try {
      const resp = await fetch('/api/recruiter/ranking');
      const data = await resp.json();
      const list = data.ok ? data.candidates || [] : [];

      if (!list.length) {
        empty.textContent = 'No candidates ranked yet.';
        empty.style.display = 'block';
        return;
      }

      empty.style.display = 'none';
      table.style.display = 'table';

      const bestScore = Math.max(...list.map((c) => c.score || 0));

      list.forEach((c) => {
        const tr = document.createElement('tr');
        const highlight = c.score === bestScore ? 'font-weight:700;color:#16a34a;' : '';
        tr.innerHTML = `
          <td>${c.name || 'Candidate'}</td>
          <td><span style="${highlight}">${c.score != null ? c.score + '%' : 'N/A'}</span></td>
          <td>
            <button class="btn btn-ghost btn-view-resume" data-app-id="${c.id}">View</button>
            <button class="btn btn-primary btn-select-candidate" data-app-id="${c.id}">Select</button>
          </td>
        `;
        tbody.appendChild(tr);
      });

      $$('.btn-select-candidate', tbody).forEach((btn) =>
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-app-id');
          // You can hook this to backend confirmation-mail endpoint
          createToast('Confirmation mail sent for application ' + id);
        })
      );
    } catch (e) {
      empty.textContent = 'ML ranking will appear once your ML API is connected.';
      empty.style.display = 'block';
    }
  }

  function initRecruiterDashboard() {
    const path = window.location.pathname;
    if (!path.includes('/recruiter/dashboard')) return;

    // Initialize tab switching
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const tab = btn.getAttribute('data-tab');
        if (tab === 'candidates') {
          populatePeopleTable('candidates');
        } else {
          populatePeopleTable('team');
        }
      });
    });

    // Initialize filters
    $('#team-filter, #location-filter, #groups-filter, #filter-dropdown').forEach(filter => {
      filter?.addEventListener('change', () => {
        const activeTab = $('.tab-btn.active')?.getAttribute('data-tab') || 'team';
        populatePeopleTable(activeTab);
      });
    });

    // Initialize search
    $('#name-search')?.addEventListener('input', () => {
      const activeTab = $('.tab-btn.active')?.getAttribute('data-tab') || 'team';
      populatePeopleTable(activeTab);
    });

    // Initialize invite button
    $('.invite-btn')?.addEventListener('click', () => {
      createToast('Invite functionality would open a modal here', 'info');
    });

    // Initialize export button
    $('.export-btn')?.addEventListener('click', () => {
      createToast('Export functionality would download data here', 'info');
    });

    // Load initial data
    populatePeopleTable('team');
  }

  function populatePeopleTable(type = 'team') {
    const tbody = $('#people-table-body');
    const empty = $('#people-empty');
    
    if (!tbody || !empty) return;

    // Sample data based on the reference image
    const sampleData = [
      {
        name: 'Marvin Wiseman', phone: '912-238-3672', location: 'Tacoma, Florida', 
        role: 'Marketing Manager', type: 'Full Time', lastEngaged: 'Nov 15, 2023', 
        engagement: 'low', avatar: 'MW'
      },
      {
        name: 'Susan Curtis', phone: '914-547-2968', location: '→ 4 more', 
        role: 'Product Manager', type: 'Full Time', lastEngaged: 'Nov 15, 2023', 
        engagement: 'high', avatar: 'SC'
      },
      {
        name: 'Patrick Harris', phone: '929-433-913', location: 'New York, California', 
        role: 'Developer', type: 'Full Time', lastEngaged: 'Nov 15, 2023', 
        engagement: 'medium', avatar: 'PH'
      },
      {
        name: 'Juanita Lewis', phone: '703-907-916', location: 'Utah', 
        role: 'Designer', type: 'Full Time', lastEngaged: 'Nov 13, 2023', 
        engagement: 'high', avatar: 'JL'
      },
      {
        name: 'Wilson Benjamin', phone: '581-538-238', location: 'Utah', 
        role: 'Accountant', type: 'Full Time', lastEngaged: 'Nov 14, 2023', 
        engagement: 'low', avatar: 'WB'
      },
      {
        name: 'Marilyn Stephanie', phone: '914-283-731', location: 'Utah', 
        role: 'Manager', type: 'Full Time', lastEngaged: 'Nov 15, 2023', 
        engagement: 'none', avatar: 'MS'
      },
      {
        name: 'Katya Wiseman', phone: '904-623-684', location: 'New York', 
        role: 'HR Specialist', type: 'Full Time', lastEngaged: 'Nov 13, 2023', 
        engagement: 'low', avatar: 'KW'
      },
      {
        name: 'Lydia Daniels', phone: '935-785-3673', location: 'San Jose', 
        role: 'PHP Developer', type: 'Full Time', lastEngaged: 'Nov 15, 2023', 
        engagement: 'none', avatar: 'LD'
      }
    ];

    // Apply filters and search
    let filteredData = sampleData;
    const searchTerm = $('#name-search')?.value.toLowerCase() || '';
    const teamFilter = $('#team-filter')?.value || 'All Teams';
    const locationFilter = $('#location-filter')?.value || 'Location';

    if (searchTerm) {
      filteredData = filteredData.filter(person => 
        person.name.toLowerCase().includes(searchTerm)
      );
    }

    if (teamFilter !== 'All Teams') {
      filteredData = filteredData.filter(person => 
        person.role.toLowerCase().includes(teamFilter.toLowerCase())
      );
    }

    if (locationFilter !== 'Location') {
      filteredData = filteredData.filter(person => 
        person.location.toLowerCase().includes(locationFilter.toLowerCase())
      );
    }

    if (!filteredData.length) {
      empty.style.display = 'block';
      tbody.innerHTML = '';
      return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = filteredData.map(person => `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: #4F46E5; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px;">
              ${person.avatar}
            </div>
            <span class="person-name">${person.name}</span>
          </div>
        </td>
        <td>${person.phone}</td>
        <td>${person.location}</td>
        <td>${person.role}</td>
        <td>${person.type}</td>
        <td>${person.lastEngaged}</td>
        <td>
          <span class="engagement-badge engagement-${person.engagement}">
            ${person.engagement === 'none' ? 'None' : 
              person.engagement === 'low' ? 'Low' : 
              person.engagement === 'medium' ? 'Medium' : 'High'}
          </span>
        </td>
        <td>
          <div class="action-menu">
            <button class="action-btn" title="More actions">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    // Add action button listeners
    $$('.action-btn', tbody).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('tr');
        const name = row.querySelector('.person-name').textContent;
        createToast(`Actions for ${name} would show here`, 'info');
      });
    });
  }

  // ---------- Sidebar active states ----------
  function initSidebar() {
    const items = $$('.side-item');
    if (!items.length) return;
    items.forEach((item) =>
      item.addEventListener('click', () => {
        items.forEach((i) => i.classList.remove('active'));
        item.classList.add('active');
      })
    );
  }

  // ---------- Init ----------
  function init() {
    initTheme();
    initAuthModal();
    initCandidateDashboard();
    initRecruiterDashboard();
    initSidebar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
