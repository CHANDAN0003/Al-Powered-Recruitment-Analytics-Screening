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
      console.log('Opening modal for role:', intentRole);
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
      console.log('Setting panel role to:', role);
      const chips = $$('.chip', panel);
      chips.forEach((chip) => {
        const active = chip.dataset.role === role;
        chip.classList.toggle('active', active);
        chip.setAttribute('aria-pressed', active);
      });
      panel.dataset.role = role;
      console.log('Panel dataset role set to:', panel.dataset.role);
    }

    function initRoleToggle(panel) {
      if (!panel) return;
      const chips = $$('.chip', panel);
      chips.forEach((chip) =>
        chip.addEventListener('click', () => {
          console.log('Role chip clicked:', chip.dataset.role);
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
        console.log('Sending OTP for role:', role, 'panelIn.dataset.role:', panelIn.dataset.role, 'intentRole:', intentRole);

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
        console.log('Verifying OTP for role:', role, 'panelIn.dataset.role:', panelIn.dataset.role, 'intentRole:', intentRole);

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
          console.log('Auth response:', data);
          if (!data.ok) {
            createToast(data.error || 'OTP verification failed', 'error');
            return;
          }

          const dest = data.role === 'recruiter' ? '/recruiter/dashboard' : '/candidate/dashboard';
          console.log('Redirecting to:', dest, 'based on server role:', data.role);
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
        console.log('Creating account for role:', role, 'panelUp.dataset.role:', panelUp.dataset.role);

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
          // Preserve the role when switching from signup to login
          setPanelRole(panelIn, role);
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

  // Initialize chat UI controls (send button, enter key, toggle)
  function initChatUI() {
    const sendBtn = $('#chat_send');
    const input = $('#chat_prompt');
    const chatBox = $('#chat_box');
    const toggle = $('#chat-toggle');
    const chatWrap = $('#candidate-chat');

    if (!sendBtn || !input || !chatBox) return;

    sendBtn.addEventListener('click', () => {
      // reuse existing chatbotAsk which appends messages and performs fetch
      chatbotAsk();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatbotAsk();
      }
    });

    if (toggle && chatWrap) {
      toggle.addEventListener('click', () => {
        const isHidden = chatWrap.style.display === 'none' || chatWrap.getAttribute('aria-hidden') === 'true';
        if (isHidden) {
          chatWrap.style.display = 'flex';
          chatWrap.setAttribute('aria-hidden', 'false');
        } else {
          chatWrap.style.display = 'none';
          chatWrap.setAttribute('aria-hidden', 'true');
        }
      });
    }
  }

  // Expose lightweight helpers and commonly-used functions to global scope so
  // templates that use inline handlers (e.g. onclick="hideBackdrop($('#id')") )
  // continue to work. This avoids runtime errors when `$`/`hideBackdrop` are
  // referenced from HTML before the IIFE scope is available.
  window.$ = (sel, root = document) => root.querySelector(sel);
  window.$$ = (sel, root = document) => Array.from((root || document).querySelectorAll(sel));
  window.showBackdrop = showBackdrop;
  window.hideBackdrop = hideBackdrop;
  // Expose recruiter related functions which templates may call directly
  window.showApplicationDetails = showApplicationDetails;
  window.showEmailModal = showEmailModal;
  window.sendConfirmationEmail = sendConfirmationEmail;
  window.loadRecruiterJobs = loadRecruiterJobs;
  window.loadApplications = loadApplications;
  window.submitJobPost = submitJobPost;

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
    const container = $('#jobs-list');
    const empty = $('#jobs-empty');
    if (!container || !empty) return;

    container.innerHTML = '';
    empty.style.display = 'block';
    container.style.display = 'none';

    try {
      const resp = await fetch('/api/jobs');
      const data = await resp.json();
      jobsCache = data.ok ? data.jobs || [] : [];
    } catch (e) {
      jobsCache = [];
      createToast('Failed to load jobs', 'error');
    }

    const jobs = applyJobFilters(jobsCache);

    if (!jobs.length) {
      empty.style.display = 'block';
      container.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    container.style.display = 'flex';

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
          <div class="job-company">${j.company_name || company}</div>
          <div class="job-time">${timeAgo}</div>
          <div class="job-tags">${tags.join('')}</div>
        </div>
        <div class="job-actions">
          <button class="job-bookmark" title="Bookmark">
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z"/>
            </svg>
          </button>
          <button class="job-details-btn apply-now" data-job-id="${j.id}" data-job-title="${j.title || 'Untitled Role'}" data-company-name="${j.company_name || company}">Apply Now</button>
        </div>
      `;
      container.appendChild(card);
    });

    $$('.apply-now', container).forEach((btn) =>
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-job-id');
        const title = btn.getAttribute('data-job-title');
        const company = btn.getAttribute('data-company-name');
        
        // Set job info in modal
        const input = $('#apply-job-id');
        const jobTitle = $('#apply-job-title');
        const companyName = $('#apply-company-name');
        
        if (input) input.value = id;
        if (jobTitle) jobTitle.textContent = title;
        if (companyName) companyName.textContent = company;
        
        const backdrop = $('#apply-backdrop');
        showBackdrop(backdrop);
      })
    );

    // Add bookmark functionality
    $$('.job-bookmark', container).forEach((btn) => {
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

    // Add close button handlers
    $('#close-apply-modal')?.addEventListener('click', () => {
      hideBackdrop(applyBackdrop);
    });

    $('#cancel-application')?.addEventListener('click', () => {
      hideBackdrop(applyBackdrop);
    });


    $('#apply-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formEl = $('#apply-form');
      const formData = new FormData();

      // Collect all fields
      const jobId = $('#apply-job-id')?.value;
      const fullName = $('#apply-name')?.value?.trim();
      const email = $('#apply-email')?.value?.trim();
      const phone = $('#apply-phone')?.value?.trim();
      const experience = $('#apply-exp')?.value?.trim();
      const skills = $('#apply-skills')?.value?.trim();
      const salary = $('#apply-salary')?.value?.trim();
      const coverLetter = $('#cover-letter')?.value?.trim();
      const file = $('#apply-resume')?.files?.[0];

      if (!file) {
        createToast('Please attach a resume (.pdf or .doc/.docx)', 'error');
        return;
      }
      if (!fullName || !email) {
        createToast('Full name and email are required', 'error');
        return;
      }

      formData.append('job_id', jobId);
      formData.append('full_name', fullName);
      formData.append('email', email);
      formData.append('phone', phone || '');
      formData.append('experience', experience || '');
      formData.append('skills', skills || '');
      formData.append('expected_salary', salary || '');
      formData.append('cover_letter', coverLetter || '');
      formData.append('resume', file);

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
        
        // Hide all content sections
        $$('.content-section').forEach(section => section.classList.remove('active'));
        
        const tab = btn.getAttribute('data-tab');
        const contentSection = $(`#${tab}-content`);
        if (contentSection) {
          contentSection.classList.add('active');
        }
        
        // Load appropriate data
        if (tab === 'jobs') {
          loadRecruiterJobs();
        } else if (tab === 'applicants') {
          loadApplications();
        }
      });
    });

    // Initialize post job buttons
    const quickPostBtn = $('#quick-post-job');
    const createFirstBtn = $('#create-first-job');
    
    [quickPostBtn, createFirstBtn].forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => {
          $$('.tab-btn').forEach(b => b.classList.remove('active'));
          $('[data-tab="post"]')?.classList.add('active');
          $$('.content-section').forEach(section => section.classList.remove('active'));
          $('#post-content')?.classList.add('active');
        });
      }
    });

    // Initialize job post form
    $('#job-post-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await submitJobPost();
    });

    // Initialize refresh button
    $('#refresh-jobs')?.addEventListener('click', loadRecruiterJobs);

    // Initialize job filter
    $('#job-filter')?.addEventListener('change', loadApplications);

    // Initialize modal handlers
    initApplicationModal();
    initEmailModal();

    // Load initial data
    loadRecruiterJobs();
    loadApplications();
    updateOverviewStats();
  }

  async function submitJobPost() {
    const form = $('#job-post-form');
    const formData = new FormData();
    
    formData.append('company_name', $('#company-name')?.value.trim());
    formData.append('title', $('#job-title')?.value.trim());
    formData.append('type', $('#job-type')?.value);
    formData.append('location', $('#job-location')?.value.trim());
    formData.append('salary', $('#job-salary')?.value.trim());
    formData.append('description', $('#job-description')?.value.trim());
    formData.append('skills', $('#job-skills')?.value.trim());
    formData.append('experience', $('#job-experience')?.value.trim());
    formData.append('category', $('#job-category')?.value);

    if (!formData.get('company_name') || !formData.get('title') || !formData.get('description')) {
      createToast('Company name, job title and description are required', 'error');
      return;
    }

    try {
      const response = await fetch('/api/recruiter/jobs', {
        method: 'POST',
        headers: csrfHeaders(),
        body: formData
      });

      const data = await response.json();
      if (data.ok) {
        createToast('Job posted successfully!', 'success');
        form.reset();
        
        // Switch to jobs tab
        $$('.tab-btn').forEach(b => b.classList.remove('active'));
        $('[data-tab="jobs"]')?.classList.add('active');
        $$('.content-section').forEach(section => section.classList.remove('active'));
        $('#jobs-content')?.classList.add('active');
        
        loadRecruiterJobs();
        updateOverviewStats();
      } else {
        createToast(data.error || 'Failed to post job', 'error');
      }
    } catch (error) {
      createToast('Error posting job. Please try again.', 'error');
    }
  }

  async function loadRecruiterJobs() {
    const jobsList = $('#jobs-list');
    const jobsEmpty = $('#jobs-empty');
    const jobFilter = $('#job-filter');
    
    if (!jobsList || !jobsEmpty) return;

    try {
      const response = await fetch('/api/recruiter/jobs');
      const data = await response.json();
      if (data.ok && data.jobs && data.jobs.length > 0) {
        jobsEmpty.style.display = 'none';
        jobsList.style.display = 'grid';
        jobsList.innerHTML = data.jobs.map(job => {
          const skills = (job.skills || '').split(',').map(s => s.trim()).filter(Boolean);
          return `
            <div class="job-card" data-job-id="${job.id}">
              <div class="job-card-header">
                <h3 class="job-card-title">${job.title || 'Untitled Job'}</h3>
                <div class="job-card-company">${job.company_name || 'Company'}</div>
              </div>
              <div class="job-card-body">
                <div class="job-card-description">${(job.description || '').substring(0, 150)}${(job.description || '').length > 150 ? '...' : ''}</div>
                <div class="job-card-details">
                  <span class="job-tag">${job.type || 'Full Time'}</span>
                  <span class="job-tag">${job.location || 'Remote'}</span>
                  ${job.salary ? `<span class="job-tag">${job.salary}</span>` : ''}
                </div>
                ${skills.length ? `<div class="job-skills">${skills.slice(0, 3).map(skill => `<span class="skill-chip">${skill}</span>`).join('')}</div>` : ''}
              </div>
              <div class="applications-count">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
                </svg>
                ${job.application_count || 0} Applications
              </div>
              <div class="job-card-actions">
                <button class="btn btn-secondary btn-sm view-applications" data-job-id="${job.id}">View Applications</button>
                <button class="btn btn-primary btn-sm edit-job" data-job-id="${job.id}">Edit</button>
                <button class="btn btn-danger btn-sm delete-job" data-job-id="${job.id}">Delete</button>
              </div>
            </div>
          `;
        }).join('');

        // Populate job filter dropdown
        if (jobFilter) {
          jobFilter.innerHTML = '<option value="">All Jobs</option>' + 
            data.jobs.map(job => `<option value="${job.id}">${job.title}</option>`).join('');
        }

        // Add event listeners
        $$('.view-applications').forEach(btn => {
          btn.addEventListener('click', () => {
            const jobId = btn.getAttribute('data-job-id');
            showApplicationsForJob(jobId);
          });
        });
        $$('.edit-job').forEach(btn => {
          btn.addEventListener('click', () => {
            window.editJob(btn.getAttribute('data-job-id'));
          });
        });
        $$('.delete-job').forEach(btn => {
          btn.addEventListener('click', () => {
            window.deleteJob(btn.getAttribute('data-job-id'));
          });
        });
      } else {
        jobsEmpty.style.display = 'block';
        jobsList.style.display = 'none';
      }
    } catch (error) {
      createToast('Error loading jobs', 'error');
    }
  }

  async function loadApplications() {
    const applicantsList = $('#applicants-list');
    const applicantsEmpty = $('#applicants-empty');
    const jobFilter = $('#job-filter');
    
    if (!applicantsList || !applicantsEmpty) return;

    const jobId = jobFilter?.value || '';
    const url = jobId ? `/api/recruiter/applications?job_id=${jobId}` : '/api/recruiter/applications';

    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.ok && data.applications && data.applications.length > 0) {
        applicantsEmpty.style.display = 'none';
        applicantsList.style.display = 'block';
        applicantsList.innerHTML = data.applications.map(app => {
          const initials = app.candidate_name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'NA';
          // Show match percent, robustly handle fraction (0-1) or percent (0-100)
          let rawScore = Number(app.similarity_score);
          if (!isFinite(rawScore) || isNaN(rawScore)) rawScore = 0;
          let matchPercent = 0;
          if (rawScore > 1) {
            // assume already percent (e.g., 85)
            matchPercent = Math.round(rawScore);
          } else {
            // fraction between 0 and 1
            matchPercent = Math.round(rawScore * 100);
          }
          // Clamp to 0-100
          matchPercent = Math.max(0, Math.min(100, matchPercent));
          return `
            <div class="application-card" data-application-id="${app.id}">
              <div class="application-header">
                <div class="applicant-info">
                  <div class="applicant-avatar">${initials}</div>
                  <div class="applicant-details">
                    <h4>${app.candidate_name}</h4>
                    <p>${app.candidate_email}</p>
                    <p>Applied for: ${app.job_title}</p>
                  </div>
                </div>
                <div class="similarity-badge">
                  ${matchPercent}% Match
                </div>
              </div>
              <div class="application-meta">
                <span>Applied: ${new Date(app.created_at).toLocaleDateString()}</span>
                <span>Experience: ${app.experience || 'Not specified'}</span>
                <span>Expected Salary: ${app.expected_salary || 'Not specified'}</span>
              </div>
              <div class="application-actions">
                  <button class="btn btn-primary view-details" data-application-id="${app.id}" data-resume-path="${app.resume_path || ''}">View Details</button>
                  <button class="btn btn-success quick-accept" data-application-id="${app.id}">Accept</button>
              </div>
            </div>
          `;
        }).join('');

        // Delegate click handling for view-details and accept buttons (more reliable)
        applicantsList.addEventListener('click', async (ev) => {
          const viewBtn = ev.target.closest('.view-details');
          if (viewBtn) {
            const appId = viewBtn.getAttribute('data-application-id');
            if (appId) showApplicationDetails(appId);
            return;
          }
          const acceptBtn = ev.target.closest('.quick-accept');
          if (acceptBtn) {
            const appId = acceptBtn.getAttribute('data-application-id');
            if (!appId) return;
            // Call backend to send email
            const formData = new FormData();
            formData.append('application_id', appId);
            formData.append('email_type', 'accept');
            formData.append('subject', 'Congratulations! Your application has been accepted');
            formData.append('message', 'We are pleased to inform you that your application has been accepted. Welcome to the team!');
            try {
              const resp = await fetch('/api/recruiter/send-email', {
                method: 'POST',
                headers: csrfHeaders(),
                body: formData
              });
              const data = await resp.json();
              if (data.ok) {
                createToast('Confirmation email sent!', 'success');
                // Optionally reload applications to reflect status
                loadApplications();
                loadRecruiterJobs();
              } else {
                createToast(data.error || 'Failed to send email', 'error');
              }
            } catch (e) {
              createToast('Network error while sending email', 'error');
            }
          }
        });

        // ...existing code...
      } else {
        applicantsEmpty.style.display = 'block';
        applicantsList.style.display = 'none';
      }
    } catch (error) {
      createToast('Error loading applications', 'error');
    }
  }

  async function updateOverviewStats() {
    try {
      const response = await fetch('/api/recruiter/stats');
      const data = await response.json();
      
      if (data.ok) {
        $('#active-jobs-count').textContent = data.active_jobs || 0;
        $('#total-applications-count').textContent = data.total_applications || 0;
        $('#pending-reviews-count').textContent = data.pending_reviews || 0;
        $('#hired-candidates-count').textContent = data.hired_candidates || 0;
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  function showApplicationsForJob(jobId) {
    // Switch to applications tab and filter by job
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    $('[data-tab="applicants"]')?.classList.add('active');
    $$('.content-section').forEach(section => section.classList.remove('active'));
    $('#applicants-content')?.classList.add('active');
    
    const jobFilter = $('#job-filter');
    if (jobFilter) {
      jobFilter.value = jobId;
    }
    
    loadApplications();
  }

  function initApplicationModal() {
    const backdrop = $('#application-details-backdrop');
    if (backdrop) {
      bindBackdropClose(backdrop);
    }
  }

  function initEmailModal() {
    const backdrop = $('#email-confirmation-backdrop');
    if (backdrop) {
      bindBackdropClose(backdrop);
      
      $('#email-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await sendConfirmationEmail();
      });
      
      $('#cancel-email')?.addEventListener('click', () => {
        hideBackdrop(backdrop);
      });
    }
  }

  async function showApplicationDetails(applicationId) {
    try {
      const response = await fetch(`/api/recruiter/applications/${applicationId}`);
      const data = await response.json();
      
      if (data.ok && data.application) {
        const app = data.application;
        const initials = app.candidate_name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'NA';
        
        // Populate modal with application details
        $('#candidate-avatar').textContent = initials;
        $('#candidate-name').textContent = app.candidate_name;
        $('#candidate-email').textContent = app.candidate_email;
        // Experience can be a string or number
        $('#candidate-experience').textContent = app.experience ? (typeof app.experience === 'string' ? app.experience : `${app.experience} years experience`) : 'Not specified';
        // similarity_score may be a fraction (0-1) or already percent (0-100)
        const rawScore = Number(app.similarity_score) || 0;
        const matchPercent = rawScore > 1 ? Math.round(rawScore) : Math.round(rawScore * 100);
        $('#similarity-percentage').textContent = `${matchPercent}%`;
        $('#candidate-salary').textContent = app.expected_salary || app.salary_expectation || 'Not specified';
        
        // Populate skills
        const skillsContainer = $('#candidate-skills');
        if (app.skills) {
          skillsContainer.innerHTML = app.skills.split(',')
            .map(skill => `<span class="skill-tag">${skill.trim()}</span>`)
            .join('');
        }
        
        // Set up resume link
        // Support resume_url or resume_path from backend
        const resumePath = app.resume_url || app.resume_path || app.resume;
        if (resumePath) {
          // If resumePath looks like a filesystem path, extract filename
          let fileName = resumePath.split('::')[0].split('/').pop();
          // Create download url
          $('#resume-link').href = `/static/../uploads/${fileName}`;
          $('#resume-link').style.display = 'inline-flex';
        } else {
          $('#resume-link').style.display = 'none';
        }
        
        // Add action button listeners
        $('#send-accept-email').onclick = () => showEmailModal('accept', applicationId);
        $('#send-interview-email').onclick = () => showEmailModal('interview', applicationId);
        
        showBackdrop($('#application-details-backdrop'));
      }
    } catch (error) {
      createToast('Error loading application details', 'error');
    }
  }

  function showEmailModal(type, applicationId) {
    const backdrop = $('#email-confirmation-backdrop');
    const titleMap = {
      'accept': 'Send Acceptance Email',
      'interview': 'Schedule Interview Email'
    };
    
    const subjectMap = {
      'accept': 'Congratulations! Your application has been accepted',
      'interview': 'Interview Invitation'
    };
    
    const messageMap = {
      'accept': 'We are pleased to inform you that your application has been accepted. Welcome to the team!',
      'interview': 'We would like to invite you for an interview. Please let us know your availability.'
    };
    
    $('#email-modal-title').textContent = titleMap[type];
    $('#email-subject').value = subjectMap[type];
    $('#email-message').value = messageMap[type];
    $('#email-application-id').value = applicationId;
    $('#email-type').value = type;
    
    showBackdrop(backdrop);
  }

  async function sendConfirmationEmail() {
    const formData = new FormData();
    formData.append('application_id', $('#email-application-id').value);
    formData.append('type', $('#email-type').value);
    formData.append('subject', $('#email-subject').value);
    formData.append('message', $('#email-message').value);
    
    try {
      const response = await fetch('/api/recruiter/send-email', {
        method: 'POST',
        headers: csrfHeaders(),
        body: formData
      });
      
      const data = await response.json();
      if (data.ok) {
        createToast('Email sent successfully!', 'success');
        hideBackdrop($('#email-confirmation-backdrop'));
        hideBackdrop($('#application-details-backdrop'));
        loadApplications(); // Refresh applications list
      } else {
        createToast(data.error || 'Failed to send email', 'error');
      }
    } catch (error) {
      createToast('Error sending email', 'error');
    }
  }

  // ---------- Quick Job Post Functionality ----------
  function initQuickJobPost() {
    const quickPostBtn = $('#quick-post-job');
    const quickPostBackdrop = $('#quick-post-backdrop');
    const quickJobForm = $('#quick-job-form');
    const quickJobCancel = $('#quick-job-cancel');

    if (!quickPostBtn || !quickPostBackdrop || !quickJobForm) return;

    // Show quick post modal
    quickPostBtn.addEventListener('click', () => {
      quickPostBackdrop.style.display = 'flex';
      quickPostBackdrop.classList.add('show');
    });

    // Hide quick post modal
    if (quickJobCancel) {
      quickJobCancel.addEventListener('click', () => {
        quickPostBackdrop.style.display = 'none';
        quickPostBackdrop.classList.remove('show');
      });
    }

    // Submit quick job form
    quickJobForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const title = $('#quick-job-title')?.value.trim();
      const desc = $('#quick-job-description')?.value.trim();
      const company = $('#quick-company-name')?.value.trim();

      if (!title || !desc) {
        createToast('Enter title & description', 'error');
        return;
      }

      const formData = new FormData();
      formData.append('title', title);
      formData.append('description', desc);
      formData.append('company_name', company || 'Company');
      formData.append('location', 'Remote');
      formData.append('type', 'Full Time');
      formData.append('skills', '');
      formData.append('experience', '');
      formData.append('category', '');
      formData.append('salary', '');

      try {
        const response = await fetch('/api/recruiter/jobs', {
          method: 'POST',
          headers: csrfHeaders(),
          body: formData
        });

        const data = await response.json();
        if (data.ok) {
          createToast('Job posted successfully!', 'success');
          quickPostBackdrop.style.display = 'none';
          quickPostBackdrop.classList.remove('show');
          
          // Clear form
          $('#quick-job-title').value = '';
          $('#quick-job-description').value = '';
          if ($('#quick-company-name')) $('#quick-company-name').value = '';
          
          // Refresh jobs list and switch to jobs tab
          loadRecruiterJobs();
          
          // Switch to jobs tab
          $$('.tab-btn').forEach(b => b.classList.remove('active'));
          $('[data-tab="jobs"]')?.classList.add('active');
          $$('.content-section').forEach(section => section.classList.remove('active'));
          $('#jobs-content')?.classList.add('active');
        } else {
          createToast(data.error || 'Failed to post job', 'error');
        }
      } catch (error) {
        createToast('Network error', 'error');
      }
    });

    // Close modal when clicking backdrop
    quickPostBackdrop.addEventListener('click', (e) => {
      if (e.target === quickPostBackdrop) {
        quickPostBackdrop.style.display = 'none';
        quickPostBackdrop.classList.remove('show');
      }
    });
  }

  // ---------- Job Management Functions ----------
  window.editJob = function(jobId) {
    createToast('Edit functionality coming soon!', 'info');
  };

  window.deleteJob = async function(jobId) {
    if (!confirm('Are you sure you want to delete this job?')) return;

    try {
      const response = await fetch(`/api/recruiter/jobs/${jobId}`, {
        method: 'DELETE',
        headers: csrfHeaders()
      });

      const data = await response.json();
      if (data.ok) {
        createToast('Job deleted successfully!', 'success');
        loadRecruiterJobs();
        updateOverviewStats();
      } else {
        createToast(data.error || 'Failed to delete job', 'error');
      }
    } catch (error) {
      createToast('Error deleting job', 'error');
    }
  };

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
    initQuickJobPost();
    initSidebar();
    // Chat UI should be initialized after candidate dashboard markup is available
    initChatUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
