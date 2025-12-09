const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));
// Guard for third-party scripts expecting a global profile object (prevents profile undefined errors)
if (!window.profile) window.profile = {};
if (!window.profile.profile) window.profile.profile = {};
const API_BASE = '';
const LOCAL_PLACEHOLDER = '/assets/cover-placeholder.png';
const GOOGLE_BOOKS_ENDPOINT = 'https://www.googleapis.com/books/v1/volumes';
const GOOGLE_FIELDS = 'items(id,volumeInfo/title,volumeInfo/authors,volumeInfo/imageLinks/extraLarge,volumeInfo/imageLinks/large,volumeInfo/imageLinks/medium,volumeInfo/imageLinks/small,volumeInfo/imageLinks/thumbnail,volumeInfo/imageLinks/smallThumbnail)';
const GOOGLE_API_KEY = window.GOOGLE_BOOKS_KEY || '';
const COVER_CACHE_KEY = 'coverCache_v3';
const GOOGLE_CACHE_KEY = 'googleCoverCache_v2';
const coverCacheMem = new Map();
const googleCoverCacheMem = new Map();
const pendingCoverPromises = new Map(); // avoids duplicate cover fetches per key
let coverCacheStorage = loadCache(COVER_CACHE_KEY);
let googleCoverCacheStorage = loadCache(GOOGLE_CACHE_KEY);

function loadCache(key) {
  try {
    const stored = localStorage.getItem(key);
    const parsed = stored ? JSON.parse(stored) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function forceHttps(url) {
  if (!url) return null;
  return url.replace(/^http:/i, 'https:');
}

function sanitizeIsbn(isbn) {
  return (isbn || '').replace(/[-\s]/g, '').trim();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isValidPhoneFront(phone) {
  if (!phone) return true;
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function showAuthForm(mode = 'signin') {
  const signup = qs('#signup-form');
  const signin = qs('#signin-form');
  const forgot = qs('#forgot-form');
  const tabs = qsa('.auth-tab');
  if (mode === 'signup') {
    signup?.classList.remove('hidden');
    signin?.classList.add('hidden');
    forgot?.classList.add('hidden');
    tabs.forEach((t) => t.classList.toggle('active', t.id === 'tab-signup'));
  } else if (mode === 'forgot') {
    signup?.classList.add('hidden');
    signin?.classList.add('hidden');
    forgot?.classList.remove('hidden');
    tabs.forEach((t) => t.classList.remove('active'));
  } else {
    signup?.classList.add('hidden');
    signin?.classList.remove('hidden');
    forgot?.classList.add('hidden');
    tabs.forEach((t) => t.classList.toggle('active', t.id === 'tab-signin'));
  }
}

function getCachedValue(map, storage, key) {
  if (!key) return undefined;
  if (map.has(key)) return map.get(key);
  if (Object.prototype.hasOwnProperty.call(storage, key)) {
    const val = storage[key];
    map.set(key, val);
    return val;
  }
  return undefined;
}

function setCachedValue(map, storage, storageKey, key, value) {
  if (!key) return;
  map.set(key, value);
  storage[key] = value;
  try { localStorage.setItem(storageKey, JSON.stringify(storage)); } catch { /* ignore */ }
}

function coverCacheKey(book, idx = 0) {
  const isbn = sanitizeIsbn(book?.isbn || book?.isbn13 || book?.isbn10);
  const title = (book?.title || '').trim();
  const authorStr = ((book?.authors || []).map((a) => a?.name || a).filter(Boolean).join('|') || book?.author || '').trim();
  return isbn || (title || authorStr ? `${title}|${authorStr}` : String(idx));
}

function getCachedCoverByKey(key) {
  return getCachedValue(coverCacheMem, coverCacheStorage, key);
}

function setCachedCoverByKey(key, url) {
  setCachedValue(coverCacheMem, coverCacheStorage, COVER_CACHE_KEY, key, url ?? null);
}

function pickBestGoogleImage(imageLinks) {
  if (!imageLinks) return null;
  const order = ['extraLarge','large','medium','small','thumbnail','smallThumbnail'];
  for (const key of order) {
    if (imageLinks[key]) return forceHttps(imageLinks[key]);
  }
  return null;
}

async function fetchGoogleCover(book = {}) {
  const cleanIsbn = sanitizeIsbn(book?.isbn || book?.isbn13 || book?.isbn10);
  const title = (book?.title || '').trim();
  const authorList = (book?.authors || []).map((a) => a?.name || a).filter(Boolean);
  const authorStr = (authorList.length ? authorList.join(' ') : (book?.author || '')).trim();
  if (!cleanIsbn && !title) return null;

  const queries = [];
  if (cleanIsbn) queries.push({ key: `isbn:${cleanIsbn}`, q: `isbn:${cleanIsbn}` });
  if (title) {
    const authorClause = authorStr ? `+inauthor:${authorStr}` : '';
    queries.push({ key: `${title}|${authorStr}`, q: `intitle:${title}${authorClause}` });
  }

  for (const { key, q } of queries) {
    const cached = getCachedValue(googleCoverCacheMem, googleCoverCacheStorage, key);
    if (cached !== undefined) {
      if (cached) return cached;
      continue;
    }
    try {
      const url = new URL(GOOGLE_BOOKS_ENDPOINT);
      url.searchParams.set('q', q);
      url.searchParams.set('fields', GOOGLE_FIELDS);
      url.searchParams.set('maxResults', '5');
      url.searchParams.set('printType', 'books');
      if (GOOGLE_API_KEY) url.searchParams.set('key', GOOGLE_API_KEY);
      const resp = await fetch(url.toString());
      if (!resp.ok) {
        setCachedValue(googleCoverCacheMem, googleCoverCacheStorage, GOOGLE_CACHE_KEY, key, null);
        continue;
      }
      const data = await resp.json();
      const volume = data?.items?.find((it) => pickBestGoogleImage(it?.volumeInfo?.imageLinks));
      const best = pickBestGoogleImage(volume?.volumeInfo?.imageLinks);
      const finalUrl = forceHttps(best);
      setCachedValue(googleCoverCacheMem, googleCoverCacheStorage, GOOGLE_CACHE_KEY, key, finalUrl || null);
      if (finalUrl) return finalUrl;
    } catch (err) {
      console.warn('Google Books cover fetch failed', err);
      setCachedValue(googleCoverCacheMem, googleCoverCacheStorage, GOOGLE_CACHE_KEY, key, null);
    }
  }
  return null;
}

const state = {
  token: localStorage.getItem('token'),
  user: { profile: {} },
  memberId: null,
  role: null,
  books: [],
  loans: [],
  reservations: [],
  fines: [],
  admin: {
    stats: null,
    members: [],
    reservations: [],
    loans: [],
    fines: []
  }
};

let adminBarChart = null;
let adminPieChart = null;
let memberChart = null;
let modalBook = null;
let heartbeatTimer = null;

function setToken(token) {
  state.token = token;
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

function syncAuthUI() {
  const overlay = qs('#auth-overlay');
  if (state.token) overlay.classList.add('hidden');
  else overlay.classList.remove('hidden');
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
}

function loanStatus(loan) {
  if (loan.returnDate) return 'Returned';
  const due = new Date(loan.dueDate);
  if (!Number.isNaN(due.getTime()) && Date.now() > due.getTime()) return 'Overdue';
  return 'Borrowed';
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    ...(options.headers || {})
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    // non-JSON response
  }
  if (res.status === 401 || res.status === 403) {
    const msg = data?.error?.message || 'Session expired. Please sign in again.';
    handleLogout(msg);
    sessionStorage.setItem('auth_msg', msg);
    window.location.href = '/';
    throw new Error(msg);
  }
  if (!res.ok || (data && data.success === false)) {
    throw new Error(data?.error?.message || res.statusText || 'Request failed');
  }
  return data?.data ?? data;
}

// Auth handlers
function showMessage(msg) {
  const bar = qs('#status-bar');
  if (!bar) return console.log(msg);
  bar.textContent = msg;
  bar.classList.remove('hidden');
  setTimeout(() => bar.classList.add('hidden'), 3000);
}

async function handleLogin(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    const resp = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: form.get('username').trim(),
        password: form.get('password'),
        remember: form.get('remember') === 'on'
      })
    });
    setToken(resp.token);
    await bootstrapAfterAuth();
  } catch (err) {
    const inline = qs('#signin-error');
    if (inline) {
      inline.textContent = err.message || 'Incorrect username or password.';
      inline.classList.remove('hidden');
    } else {
      showMessage(err.message || 'Incorrect username or password.');
    }
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  if (form.get('password') !== form.get('confirmPassword')) {
    showMessage('Passwords do not match');
    return;
  }
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(form.get('password') || '')) {
    showMessage('Password must be 8+ characters with letters and numbers');
    return;
  }
  const phone = form.get('phone');
  if (phone && !isValidPhoneFront(phone)) {
    showMessage('Phone must be 10-15 digits');
    return;
  }
  try {
    const resp = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: form.get('username').trim(),
        password: form.get('password'),
        email: (form.get('email') || '').trim(),
        name: `${form.get('firstName')} ${form.get('lastName')}`.trim(),
        phone: phone || ''
      })
    });
    setToken(resp.token);
    await bootstrapAfterAuth();
  } catch (err) {
    showMessage(err.message);
  }
}

async function handleForgotSend(e) {
  e.preventDefault();
  const form = qs('#forgot-form');
  const email = form?.elements.email?.value?.trim();
  if (!email) { showMessage('Enter your email'); return; }
  try {
    await api('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) });
    showMessage('Reset link sent. Check your email.');
  } catch (err) { showMessage(err.message); }
}

async function handleForgotSubmit(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const token = form.get('token')?.trim();
  const password = form.get('newPassword');
  if (!token || !password) { showMessage('Token and new password required'); return; }
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) {
    showMessage('Password must be 8+ characters with letters and numbers');
    return;
  }
  try {
    await api('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) });
    showMessage('Password reset. Please sign in.');
    showAuthForm('signin');
  } catch (err) { showMessage(err.message); }
}

function handleLogout(message) {
  setToken(null);
  state.user = { profile: {} };
  state.memberId = null;
  state.role = null;
  state.books = [];
  state.loans = [];
  state.reservations = [];
  state.fines = [];
  state.admin = { stats: null, members: [], reservations: [], loans: [], fines: [] };
  syncAuthUI();
  setRoleUI();
  if (message) sessionStorage.setItem('auth_msg', message);
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// Fetchers
async function fetchProfile() {
  const profile = await api('/auth/me');
  state.user = profile.user || {};
  if (!state.user.profile) state.user.profile = {};
  state.memberId = profile.memberId || null;
  state.role = profile.user?.role || null;
  renderProfile();
}

async function fetchBooks() {
  state.books = await api('/books');
  state.books = state.books.map((b) => {
    const normalizedIsbn = sanitizeIsbn(b.isbn || b.isbn13 || b.isbn10);
    return {
      ...b,
      isbn: normalizedIsbn || b.isbn,
      cover: b.cover && /^https?:\/\//i.test(b.cover) ? forceHttps(b.cover) : null
    };
  });
  state.bookMap = new Map(state.books.map((b) => [b.isbn, b]));
  renderBooks();
  renderRecommendations();
  renderAdminBooks();
  populateIssueBooks();
}

async function fetchMemberLoans() {
  state.loans = await api('/loans/me');
  renderBorrowed();
}

async function fetchMemberReservations() {
  state.reservations = await api('/reservations/me');
  renderReservations();
}

async function fetchMemberFines() {
  state.fines = await api('/fines/me');
  renderMemberFines();
}

async function fetchMemberStats() {
  return api('/stats/member');
}

async function fetchAdminStats() {
  state.admin.stats = await api('/stats/admin');
  renderAdminDashboard();
  drawAdminCharts();
}

async function fetchAdminMembers() {
  state.admin.members = await api('/members');
  renderAdminMembers();
  fillMemberSelects();
}

async function fetchAdminReservations() {
  state.admin.reservations = await api('/reservations');
  renderAdminReservations();
}

async function fetchAdminLoans() {
  state.admin.loans = await api('/loans');
  renderAdminLoans();
  fillLoanSelect();
}

function populateIssueBooks() {
  const sel = qs('#issue-book-select');
  if (!sel) return;
  const available = state.books.filter((b) => Number(b.copiesAvailable || 0) > 0);
  sel.innerHTML = available.length
    ? ['<option value="">Select book</option>', ...available.map((b) => `<option value="${b.isbn}">${b.title} (${b.copiesAvailable} available)</option>`)].join('')
    : '<option value="">No available books</option>';
}

async function fetchAdminFines() {
  state.admin.fines = await api('/fines');
  renderAdminFines();
}

// Rendering
function renderProfile() {
  const user = state.user || {};
  qs('#profile-name').textContent = user.fullName || user.username || 'User';
  qs('#profile-role').textContent = state.role || '';
  qs('#avatar').textContent = (user.username || 'U').slice(0, 2).toUpperCase();
  qs('#welcome-text').textContent = `Welcome ${user.fullName || user.username || ''}!`;
  qs('#welcome-date').textContent = new Date().toLocaleString();
  qs('#admin-welcome').textContent = `Welcome ${user.fullName || ''}!`;
  qs('#admin-date').textContent = new Date().toLocaleString();
}

function getCachedCover(isbnOrKey) {
  const key = sanitizeIsbn(isbnOrKey) || String(isbnOrKey || '').trim();
  if (!key) return undefined;
  return getCachedCoverByKey(key);
}
function setCachedCover(isbnOrKey, url) {
  const key = sanitizeIsbn(isbnOrKey) || String(isbnOrKey || '').trim();
  if (!key) return;
  setCachedCoverByKey(key, url);
}

async function resolveCoverUrl(book, idx = 0) {
  const cacheKey = coverCacheKey(book, idx);
  const cached = cacheKey ? getCachedCoverByKey(cacheKey) : undefined;
  const existingCover =
    book?.cover && /^https?:\/\//i.test(book.cover) ? forceHttps(book.cover) : null;
  if (cached) return cached;
  if (existingCover) {
    if (cacheKey) setCachedCoverByKey(cacheKey, existingCover);
    return existingCover;
  }
  if (cached === null) return LOCAL_PLACEHOLDER;
  if (cacheKey && pendingCoverPromises.has(cacheKey)) return pendingCoverPromises.get(cacheKey);
  const promise = (async () => {
    const gCover = await fetchGoogleCover(book);
    if (gCover) {
      setCachedCoverByKey(cacheKey, gCover);
      if (book) book.cover = gCover;
      return gCover;
    }
    setCachedCoverByKey(cacheKey, null);
    return LOCAL_PLACEHOLDER;
  })().finally(() => {
    if (cacheKey) pendingCoverPromises.delete(cacheKey);
  });
  if (cacheKey) pendingCoverPromises.set(cacheKey, promise);
  return promise;
}

async function setCover(imgEl, book, idx = 0) {
  const title = book?.title || 'Book';
  const cacheKey = coverCacheKey(book, idx);
  const fallbackCover =
    book?.cover && /^https?:\/\//i.test(book.cover) ? forceHttps(book.cover) : null;
  imgEl.loading = 'lazy';
  imgEl.decoding = 'async';
  imgEl.alt = `Cover of ${title}`;
  const cached = cacheKey ? getCachedCoverByKey(cacheKey) : undefined;
  imgEl.src = cached || fallbackCover || LOCAL_PLACEHOLDER;
  const useFallback = () => {
    imgEl.onerror = null;
    imgEl.src = LOCAL_PLACEHOLDER;
    if (cacheKey) setCachedCoverByKey(cacheKey, null);
  };
  imgEl.onerror = useFallback;
  try {
    const resolved = await resolveCoverUrl(book, idx);
    if (resolved && resolved !== imgEl.src) {
      imgEl.onerror = useFallback;
      imgEl.src = resolved;
      if (cacheKey) setCachedCoverByKey(cacheKey, resolved);
    }
  } catch {
    useFallback();
  }
}

function renderRecommendations() {
  const list = qs('#recommendations');
  list.innerHTML = '';
  state.books.slice(0, 6).forEach((book, idx) => {
    const card = document.createElement('div');
    card.className = 'book-card';
    card.innerHTML = `
      <div class="cover"><img /></div>
      <h4>${book.title}</h4>
      <p class="muted">${book.authors?.map((a) => a.name).join(', ') || 'Author'}</p>
      <p>${book.category || 'General'}</p>
    `;
    const img = card.querySelector('img');
    setCover(img, book, idx);
    card.addEventListener('click', () => openModal(book));
    list.append(card);
  });
}

function renderBooks(filtered = state.books) {
  const container = qs('#book-categories');
  container.innerHTML = '';
  const grouped = filtered.reduce((acc, book) => {
    const key = book.category || 'General';
    acc[key] = acc[key] || [];
    acc[key].push(book);
    return acc;
  }, {});
  Object.entries(grouped).forEach(([cat, books]) => {
    const block = document.createElement('div');
    block.className = 'category-group';
    block.innerHTML = `<p class="category-title">${cat}</p>`;
    const row = document.createElement('div');
    row.className = 'card-grid';
    books.forEach((book, idx) => row.appendChild(bookTile(book, idx)));
    block.append(row);
    container.append(block);
  });
}

function bookTile(book, idx = 0) {
  const div = document.createElement('div');
  div.className = 'book-tile';
  div.innerHTML = `
    <div class="cover"><img /></div>
    <h4>${book.title}</h4>
    <p class="muted">${book.authors?.map((a) => a.name).join(', ') || 'Author'}</p>
    <p>${book.category || 'General'}</p>
    <p class="status ${book.copiesAvailable > 0 ? 'available' : 'pending'}">${book.copiesAvailable > 0 ? 'Available' : 'Not available'}</p>
  `;
  const img = div.querySelector('img');
  setCover(img, book, idx);
  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const borrowBtn = document.createElement('button');
  borrowBtn.className = 'primary-btn';
  borrowBtn.textContent = 'Borrow';
  borrowBtn.disabled = state.role !== 'Member' || book.copiesAvailable <= 0;
  borrowBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    borrowBook(book.isbn);
  });
  const reserveBtn = document.createElement('button');
  reserveBtn.className = 'secondary-btn';
  reserveBtn.textContent = 'Reserve';
  reserveBtn.disabled = state.role !== 'Member';
  reserveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    reserveBook(book.isbn);
  });
  actions.append(borrowBtn, reserveBtn);
  div.append(actions);
  div.addEventListener('click', () => openModal(book));
  return div;
}

function renderBorrowed() {
  const grid = qs('#borrowed-grid');
  grid.innerHTML = '';
  state.loans.forEach((loan, idx) => {
    const book = state.books.find((b) => b.isbn === loan.isbn);
    const statusText = loanStatus(loan);
    const card = document.createElement('div');
    card.className = 'book-tile';
    card.innerHTML = `
      <div class="cover"><img /></div>
      <h4>${book?.title || loan.isbn}</h4>
      <p class="muted">${book?.authors?.map((a) => a.name).join(', ') || ''}</p>
      <p class="status ${statusText.toLowerCase()}">${statusText}</p>
      <p class="muted">Borrowed: ${formatDate(loan.borrowDate)}</p>
      <p class="muted">Due: ${formatDate(loan.dueDate)}</p>
    `;
    const img = card.querySelector('img');
    setCover(img, book || { isbn: loan.isbn, title: loan.isbn }, idx);
    if (!loan.returnDate) {
      const btn = document.createElement('button');
      btn.className = 'primary-btn';
      btn.textContent = 'Return';
      btn.addEventListener('click', () => returnLoan(loan.loanId));
      card.append(btn);
    }
    grid.append(card);
  });
  qs('#stat-borrowed').textContent = state.loans.filter((l) => !l.returnDate).length;
}

function renderReservations() {
  const grid = qs('#reserved-grid');
  grid.innerHTML = '';
  state.reservations.forEach((res, idx) => {
    const book = state.books.find((b) => b.isbn === res.isbn);
    const card = document.createElement('div');
    card.className = 'book-tile';
    card.innerHTML = `
      <div class="cover"><img /></div>
      <h4>${book?.title || res.isbn}</h4>
      <p class="muted">${book?.authors?.map((a) => a.name).join(', ') || ''}</p>
      <p class="status ${res.status.toLowerCase()}">${res.status}</p>
      <p class="muted">Reserved: ${formatDate(res.reservationDate)}</p>
    `;
    const img = card.querySelector('img');
    setCover(img, book || { isbn: res.isbn, title: res.isbn }, idx);
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'secondary-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => cancelReservation(res.reservationId));
    actions.append(cancelBtn);
    if (res.status === 'Ready' || res.status === 'Fulfilled') {
      const borrowBtn = document.createElement('button');
      borrowBtn.className = 'primary-btn';
      borrowBtn.textContent = 'Borrow Now';
      borrowBtn.addEventListener('click', () => borrowBook(res.isbn));
      actions.append(borrowBtn);
    }
    card.append(actions);
    grid.append(card);
  });
  qs('#stat-reservations').textContent = state.reservations.length;
}

function renderMemberFines() {
  const tbody = qs('#fine-rows');
  tbody.innerHTML = '';
  let total = 0;
  const fineSelect = qs('#member-fine-select');
  if (fineSelect) fineSelect.innerHTML = '<option value="">Select a fine to pay</option>';
  state.fines.forEach((fine, idx) => {
    const loan = state.loans.find((l) => l.loanId === fine.loanId);
    const book = loan && state.bookMap ? state.bookMap.get(loan.isbn) : null;
    const paid = String(fine.paymentStatus || '').toLowerCase() === 'paid';
    const statusClass = paid ? 'ready' : 'overdue';
    if (!paid) {
      total += Number(fine.remainingAmount ?? fine.fineAmount ?? 0);
      if (fineSelect) {
        const opt = document.createElement('option');
        opt.value = fine.fineId;
        opt.textContent = `${book?.title || loan?.isbn || 'Fine'} - $${Number(fine.remainingAmount ?? fine.fineAmount ?? 0).toFixed(2)}`;
        fineSelect.append(opt);
      }
    }
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <img class="thumb" />
          <span>${book?.title || loan?.isbn || '-'}</span>
        </div>
      </td>
      <td>${formatDate(fine.dueDate)}</td>
      <td>${formatDate(fine.returnDate)}</td>
      <td style="text-align:right;">$${Number((fine.remainingAmount ?? fine.fineAmount ?? 0)).toFixed(2)}</td>
      <td class="status ${statusClass}">${fine.paymentStatus}</td>
    `;
    const thumb = tr.querySelector('.thumb');
    if (thumb) setCover(thumb, book || { isbn: loan?.isbn, title: loan?.isbn }, idx);
    tbody.append(tr);
  });
  qs('#member-fine-total').textContent = `$${total.toFixed(2)}`;
  qs('#stat-fines').textContent = `$${total.toFixed(2)}`;
}

function renderAdminDashboard() {
  if (state.role !== 'Admin') return;
  const s = state.admin.stats || {};
  qs('#dash-total-books').textContent = s.totalBooks ?? state.books.length;
  qs('#dash-total-members').textContent = s.totalMembers ?? state.admin.members.length;
  qs('#dash-active-loans').textContent = s.activeLoans ?? state.admin.loans.filter((l) => !l.returnDate).length;
  qs('#dash-overdue').textContent = s.overdueLoans ?? state.admin.loans.filter((l) => loanStatus(l) === 'Overdue').length;
  const resEl = qs('#dash-reservations');
  if (resEl) resEl.textContent = s.pendingReservations ?? state.admin.reservations.length;
  const finesEl = qs('#dash-fines');
  if (finesEl) finesEl.textContent = s.totalUnpaidFines ?? state.admin.fines.reduce((sum,f)=>sum+Number((f.remainingAmount ?? f.fineAmount ?? 0)),0);
}

function renderAdminBooks(list = state.books) {
  const grid = qs('#admin-books-grid');
  if (!grid) return;
  grid.innerHTML = '';
  list.forEach((book, idx) => {
    const card = document.createElement('div');
    card.className = 'book-tile';
    card.innerHTML = `
      <div class="cover"><img /></div>
      <h4>${book.title}</h4>
      <p class="muted">${book.category || 'General'}</p>
      <p><strong>Total Copies:</strong> ${book.totalCopies} <span class="muted">(owned)</span></p>
      <p><strong>Available Copies:</strong> ${book.copiesAvailable} <span class="muted">(borrowable)</span></p>
    `;
    const img = card.querySelector('img');
    setCover(img, book, idx);
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const copiesInput = document.createElement('input');
    copiesInput.type = 'number';
    copiesInput.min = '0';
    copiesInput.value = book.copiesAvailable;
    copiesInput.style.width = '90px';
    copiesInput.placeholder = 'Available';
    const totalInput = document.createElement('input');
    totalInput.type = 'number';
    totalInput.min = '0';
    totalInput.value = book.totalCopies;
    totalInput.style.width = '90px';
    totalInput.placeholder = 'Total';
    const updateBtn = document.createElement('button');
    updateBtn.className = 'primary-btn';
    updateBtn.textContent = 'Save Copies';
    updateBtn.addEventListener('click', async () => {
      const copiesAvailable = Number(copiesInput.value);
      const totalCopies = Number(totalInput.value);
      const validation = validateCopyInputs(totalCopies, copiesAvailable);
      if (!validation.ok) {
        showMessage(validation.msg);
        return;
      }
      try {
        await api(`/books/${encodeURIComponent(book.isbn)}`, {
          method: 'PUT',
          body: JSON.stringify({ copiesAvailable: validation.avail, totalCopies: validation.total })
        });
        await fetchBooks();
        renderAdminBooks();
        showMessage('Book updated');
      } catch (err) { showMessage(err.message); }
    });
    const del = document.createElement('button');
    del.className = 'secondary-btn';
    del.textContent = 'Delete Title';
    del.addEventListener('click', () => deleteBook(book.isbn));
    actions.append(copiesInput, totalInput, updateBtn, del);
    card.append(actions);
    grid.append(card);
  });
}

function renderAdminMembers() {
  const grid = qs('#admin-members-grid');
  if (!grid) return;
  grid.innerHTML = '';
  state.admin.members.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'book-tile';
    card.innerHTML = `
      <h4>${m.fullName || m.username}</h4>
      <p class="muted">${m.email}</p>
      <p>Member ID: ${m.memberId}</p>
      <p>Phone: ${m.phone || '-'}</p>
      <p>Address: ${m.address || '-'}</p>
    `;
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const del = document.createElement('button');
    del.className = 'secondary-btn';
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      await api(`/members/${m.memberId}`, { method: 'DELETE' });
      await fetchAdminMembers();
      showMessage('Member deleted');
    });
    actions.append(del);
    card.append(actions);
    grid.append(card);
  });
}

function renderAdminReservations() {
  const tbody = qs('#admin-reservation-rows');
  tbody.innerHTML = '';
  state.admin.reservations.forEach((res, idx) => {
    const book = state.books.find((b) => b.isbn === res.isbn);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <img class="thumb" />
          <span>${res.title}</span>
        </div>
      </td>
      <td>${res.memberName}</td>
      <td>${formatDate(res.reservationDate)}</td>
      <td class="status ${res.status.toLowerCase()}">${res.status}</td>
      <td></td>
    `;
    const thumb = tr.querySelector('.thumb');
    if (thumb) setCover(thumb, book || { isbn: res.isbn, title: res.title }, idx);
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    ['Ready', 'Fulfilled', 'Cancelled'].forEach((status) => {
      const btn = document.createElement('button');
      btn.className = status === 'Cancelled' ? 'secondary-btn' : 'primary-btn';
      btn.textContent = status;
      btn.addEventListener('click', () => updateReservationStatus(res.reservationId, status));
      actions.append(btn);
    });
    tr.lastElementChild.append(actions);
    tbody.append(tr);
  });
}

function renderAdminLoans() {
  const tbody = qs('#admin-loan-rows');
  if (!tbody) return;
  tbody.innerHTML = '';
  state.admin.loans.forEach((loan, idx) => {
    const status = loanStatus(loan);
    const book = state.books.find((b) => b.isbn === loan.isbn);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <img class="thumb" />
          <span>${loan.title || loan.isbn}</span>
        </div>
      </td>
      <td>${loan.memberName || loan.memberId}</td>
      <td>${formatDate(loan.borrowDate)}</td>
      <td>${formatDate(loan.dueDate)}</td>
      <td class="status ${status.toLowerCase()}">${status}</td>
      <td></td>
    `;
    const thumb = tr.querySelector('.thumb');
    if (thumb) setCover(thumb, book || { isbn: loan.isbn, title: loan.title || loan.isbn }, idx);
    const btn = document.createElement('button');
    btn.className = 'primary-btn';
    btn.textContent = loan.returnDate ? 'Returned' : 'Mark Returned';
    btn.disabled = Boolean(loan.returnDate);
    btn.addEventListener('click', () => returnLoan(loan.loanId));
    tr.lastElementChild.append(btn);
    tbody.append(tr);
  });
}

function renderAdminFines() {
  const tbody = qs('#admin-fine-rows');
  if (!tbody) return;
  tbody.innerHTML = '';
  let total = 0;
  const membersWithFines = new Set();
  state.admin.fines.forEach((fine, idx) => {
    const paid = String(fine.paymentStatus || '').toLowerCase() === 'paid';
    if (!paid) {
      total += Number((fine.remainingAmount ?? fine.fineAmount ?? 0));
      membersWithFines.add(fine.username);
    }
    const loan = state.admin.loans.find((l) => l.loanId === fine.loanId);
    const book = loan ? state.books.find((b) => b.isbn === loan.isbn) : null;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fine.username}</td>
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <img class="thumb" />
          <span>${fine.title || book?.title || '-'}</span>
        </div>
      </td>
      <td>$${Number((fine.remainingAmount ?? fine.fineAmount ?? 0)).toFixed(2)}</td>
      <td>${formatDate(fine.fineDate)}</td>
      <td class="status ${fine.paymentStatus.toLowerCase()}">${fine.paymentStatus}</td>
      <td></td>
    `;
    const thumb = tr.querySelector('.thumb');
    if (thumb) setCover(thumb, book || { isbn: loan?.isbn, title: fine.title || loan?.isbn || '-' }, idx);
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const pay = document.createElement('button');
    pay.className = 'primary-btn';
    pay.textContent = 'Pay';
    pay.disabled = paid;
    pay.addEventListener('click', () => openPayModal(fine));
    actions.append(pay);
    tr.lastElementChild.append(actions);
    tbody.append(tr);
  });
  qs('#fine-total').textContent = `$${total.toFixed(2)}`;
  qs('#fine-members').textContent = membersWithFines.size;
  qs('#fine-overdue').textContent = state.admin.loans.filter((l) => loanStatus(l) === 'Overdue').length;
}

function drawAdminCharts() {
  if (state.role !== 'Admin' || !state.admin.stats) return;
  if (typeof Chart === 'undefined') return;
  const ctxBar = qs('#admin-bar');
  const ctxPie = qs('#admin-pie');
  const s = state.admin.stats;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const values = months.map((_, idx) => Number(s.borrowByMonth?.[`m${idx+1}`] || 0));
  if (adminBarChart) adminBarChart.destroy();
  adminBarChart = new Chart(ctxBar, {
    type: 'bar',
    data: { labels: months, datasets: [{ label: 'Borrowed', backgroundColor: '#3b4f93', data: values }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
  const pieData = (s.categoryDistribution || []).map((c) => Number(c.value || 0));
  const pieLabels = (s.categoryDistribution || []).map((c) => c.label || 'Other');
  if (adminPieChart) adminPieChart.destroy();
  adminPieChart = new Chart(ctxPie, {
    type: 'pie',
    data: { labels: pieLabels, datasets: [{ data: pieData, backgroundColor: pieLabels.map(() => randomColor()) }] },
    options: { plugins: { legend: { position: 'bottom' } } }
  });
}

function drawMemberChart(stats) {
  if (!stats) return;
  if (typeof Chart === 'undefined') return;
  const ctx = qs('#member-chart');
  const labels = (stats.categoryDistribution && stats.categoryDistribution.length
    ? stats.categoryDistribution
    : [{ label: 'General', value: 1 }]
  ).map((c) => c.label || 'Category');
  const values = (stats.categoryDistribution && stats.categoryDistribution.length
    ? stats.categoryDistribution
    : [{ label: 'General', value: 1 }]
  ).map((c) => Number(c.value || 0));
  if (memberChart) memberChart.destroy();
  memberChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Borrowed by Category', data: values, backgroundColor: '#3b4f93' }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

function randomColor() {
  const colors = ['#3b4f93', '#6aa0f8', '#f2c94c', '#eb5757', '#27ae60', '#9b51e0'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Modal
function openModal(book) {
  modalBook = book;
  qs('#modal-title').textContent = book.title;
  qs('#modal-authors').textContent = book.authors?.map((a) => a.name).join(', ') || 'Unknown author';
  qs('#modal-genre').textContent = book.category || 'General';
  qs('#modal-year').textContent = book.publicationDate || '-';
  qs('#modal-availability').textContent = book.copiesAvailable > 0 ? 'Available' : 'Not available';
  const modalCover = qs('#modal-cover');
  modalCover.style.backgroundImage = '';
  resolveCoverUrl(book).then((url) => {
    modalCover.style.backgroundImage = `url(${url || LOCAL_PLACEHOLDER})`;
  }).catch(() => {
    modalCover.style.backgroundImage = `url(${LOCAL_PLACEHOLDER})`;
  });
  qs('#modal-description').textContent = book.description || 'No description provided.';
  qs('#book-modal').classList.remove('hidden');
}
function closeModal() { qs('#book-modal').classList.add('hidden'); }

// Actions
async function borrowBook(isbn) {
  try {
    await api('/loans/borrow', { method: 'POST', body: JSON.stringify({ isbn }) });
    await Promise.all([fetchMemberLoans(), fetchMemberReservations(), fetchBooks()]);
    showMessage('Borrowed successfully');
  } catch (err) { showMessage(err.message); }
}

async function reserveBook(isbn) {
  try {
    await api('/reservations', { method: 'POST', body: JSON.stringify({ isbn }) });
    await fetchMemberReservations();
    showMessage('Reserved');
  } catch (err) { showMessage(err.message); }
}

async function cancelReservation(id) {
  try {
    await api(`/reservations/${id}/cancel`, { method: 'PATCH' });
    await fetchMemberReservations();
    showMessage('Reservation cancelled');
  } catch (err) { showMessage(err.message); }
}

async function returnLoan(loanId) {
  try {
    await api('/loans/return', { method: 'POST', body: JSON.stringify({ loanId }) });
    if (state.role === 'Admin') {
      await Promise.all([fetchAdminLoans(), fetchAdminFines(), fetchBooks()]);
    } else {
      await Promise.all([fetchMemberLoans(), fetchMemberFines(), fetchBooks()]);
    }
    showMessage('Return processed');
  } catch (err) { showMessage(err.message); }
}

async function payFine(fineId, amount) {
  try {
    if (Number(amount) > 0) {
      await api('/fines/pay', { method: 'POST', body: JSON.stringify({ amount: Number(amount) }) });
    } else if (fineId) {
      await api(`/fines/${fineId}/pay`, { method: 'PATCH', body: JSON.stringify({}) });
    }
    if (state.role === 'Admin') {
      await Promise.all([fetchAdminFines(), fetchAdminStats()]);
    } else {
      await Promise.all([fetchMemberFines(), fetchMemberLoans()]);
    }
    showMessage('Fine payment applied');
  } catch (err) { showMessage(err.message); }
}

async function reduceFine(fineId, amount) {
  try {
    await api(`/fines/${fineId}/reduce`, { method: 'PUT', body: JSON.stringify({ amount }) });
    await fetchAdminFines();
    showMessage('Fine reduced');
  } catch (err) { showMessage(err.message); }
}

let availableTouched = false; // for auto-fill behavior on add form
let confirmCb = null; // confirm modal callback
let selectedPayFine = null;
let isPaying = false;
let payError = '';

function parseIntSafe(val) {
  const n = Number(val);
  return Number.isInteger(n) ? n : NaN;
}

function validateCopyInputs(totalVal, availVal) {
  const total = parseIntSafe(totalVal);
  const avail = parseIntSafe(availVal);
  if (!Number.isFinite(total) || !Number.isFinite(avail)) return { ok: false, msg: 'Copies must be whole numbers.' };
  if (total < 0 || avail < 0) return { ok: false, msg: 'Copies cannot be negative.' };
  if (avail > total) return { ok: false, msg: 'Available copies cannot exceed total copies.' };
  return { ok: true, total, avail };
}
// Test scenario: total=5, available=5; if total changed to 3, available must be <=3 before saving.

async function addBook(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  const validation = validateCopyInputs(data.totalCopies, data.copiesAvailable);
  const errorEl = qs('#copies-error');
  if (!validation.ok) {
    if (errorEl) errorEl.textContent = validation.msg;
    return;
  }
   const today = new Date();
   if (data.publicationDate) {
     const d = new Date(data.publicationDate);
     if (d < new Date(today.toDateString())) {
       showMessage('Publication date cannot be in the past');
       return;
     }
   }
  const normalizedIsbn = sanitizeIsbn(data.isbn);
  const normalizedTitle = (data.title || '').trim().toLowerCase();
  const normalizedCover = (data.cover || '').trim().toLowerCase();
  const dup = state.books.find((b) =>
    sanitizeIsbn(b.isbn) === normalizedIsbn ||
    (b.title || '').trim().toLowerCase() === normalizedTitle ||
    (b.cover || '').trim().toLowerCase() === normalizedCover
  );
  if (dup) {
    showMessage('Duplicate book (ISBN/title/cover)');
    return;
  }
  const payload = {
    title: data.title,
    isbn: data.isbn,
    category: data.category || null,
    publicationDate: data.publicationDate || null,
    copiesAvailable: validation.avail,
    totalCopies: validation.total,
    cover: data.cover || null,
    description: data.description || null
  };
  try {
    await api('/books', { method: 'POST', body: JSON.stringify(payload) });
    e.target.reset();
    availableTouched = false;
    qs('#add-book-submit').disabled = true;
    if (errorEl) errorEl.textContent = '';
    await fetchBooks();
    renderAdminBooks();
    showMessage('Book added');
  } catch (err) { showMessage(err.message); }
}

async function deleteBook(isbn) {
  // Check for active loans/reservations before deletion
  const hasActiveLoan = state.admin.loans?.some((l) => l.isbn === isbn && !l.returnDate);
  const hasActiveRes = state.admin.reservations?.some((r) => r.isbn === isbn && ['Pending','Ready'].includes(r.status));
  const warning = hasActiveLoan || hasActiveRes
    ? 'Cannot delete title: active loans/reservations exist.'
    : 'This will delete the entire title. Continue?';
  if (hasActiveLoan || hasActiveRes) {
    showMessage(warning);
    return;
  }
  openConfirm(warning, async () => {
    try {
      await api(`/books/${encodeURIComponent(isbn)}`, { method: 'DELETE' });
      await fetchBooks();
      renderAdminBooks();
      showMessage('Book deleted');
    } catch (err) { showMessage(err.message); }
  });
}

async function addMember(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  if (data.phone && !isValidPhoneFront(data.phone)) {
    showMessage('Phone must be 10-15 digits');
    return;
  }
  try {
    await api('/members', { method: 'POST', body: JSON.stringify({
      name: data.name,
      username: data.username,
      email: data.email,
      phone: data.phone,
      address: data.address,
      password: data.password
    }) });
    e.target.reset();
    await fetchAdminMembers();
    showMessage('Member created');
  } catch (err) { showMessage(err.message); }
}

async function issueBook(e) {
  e.preventDefault();
  const memberId = qs('#issue-member').value;
  const isbn = qs('#issue-book-select').value;
  if (!memberId || !isbn) { showMessage('Select member and book'); return; }
  try {
    await api('/loans/borrow', { method: 'POST', body: JSON.stringify({ memberId: Number(memberId), isbn }) });
    await Promise.all([fetchAdminLoans(), fetchBooks(), fetchAdminReservations(), fetchAdminStats()]);
    showMessage('Book issued');
  } catch (err) { showMessage(err.message); }
}

async function returnFromAdmin(e) {
  e.preventDefault();
  const loanId = qs('#return-loan').value;
  if (!loanId) { showMessage('Select a loan'); return; }
  await returnLoan(Number(loanId));
}

async function updateReservationStatus(id, status) {
  try {
    await api(`/reservations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await Promise.all([fetchAdminReservations(), fetchAdminLoans(), fetchBooks()]);
    showMessage('Reservation updated');
  } catch (err) { showMessage(err.message); }
}

async function updateFineStatus(id, status) {
  try {
    await api(`/fines/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await fetchAdminFines();
    showMessage('Fine status updated');
  } catch (err) { showMessage(err.message); }
}

function fillMemberSelects() {
  const memberSel = qs('#issue-member');
  const loanSel = qs('#return-loan');
  const fineSel = qs('#fine-member');
  const editMemberSel = qs('#admin-member-edit');
  if (memberSel) {
    memberSel.innerHTML = `<option value="">Select member</option>` + state.admin.members.map((m) =>
      `<option value="${m.memberId}">${m.fullName || m.username} (${m.memberId})</option>`
    ).join('');
  }
  if (loanSel) {
    loanSel.innerHTML = `<option value="">Select loan</option>` + state.admin.loans.filter((l) => !l.returnDate).map((l) =>
      `<option value="${l.loanId}">${l.title || l.isbn} - ${l.memberName || l.memberId}</option>`
    ).join('');
  }
  if (fineSel) {
    fineSel.innerHTML = `<option value="">Select member</option>` + state.admin.members.map((m) =>
      `<option value="${m.memberId}">${m.fullName || m.username} (${m.memberId})</option>`
    ).join('');
    const fineLoan = qs('#fine-loan');
    if (fineLoan) {
      fineLoan.innerHTML = '<option value="">Select Borrowed Book</option>';
    }
  }
  if (editMemberSel) {
    editMemberSel.innerHTML = `<option value="">Select member</option>` + state.admin.members.map((m) =>
      `<option value="${m.memberId}">${m.fullName || m.username} (${m.memberId})</option>`
    ).join('');
  }
}

function fillLoanSelect() {
  fillMemberSelects();
  populateIssueBooks();
}

function setRoleUI() {
  const isAdmin = state.role === 'Admin';
  qs('#member-nav').classList.toggle('hidden', isAdmin);
  qs('#admin-nav').classList.toggle('hidden', !isAdmin);
  qsa('.section').forEach((s) => s.classList.remove('visible'));
  if (isAdmin) {
    qs('#admin-dashboard').classList.add('visible');
    qsa('#admin-nav .nav-item').forEach((btn, idx) => btn.classList.toggle('active', idx === 0));
  } else {
    qs('#member-home').classList.add('visible');
    qsa('#member-nav .nav-item').forEach((btn, idx) => btn.classList.toggle('active', idx === 0));
  }
}

function openPayModal(fine) {
  selectedPayFine = fine;
  const modal = qs('#pay-modal');
  const meta = qs('#pay-meta');
  const input = qs('#pay-amount-input');
  const err = qs('#pay-error');
  if (err) { err.textContent = ''; err.classList.add('hidden'); }
  isPaying = false;
  const remaining = Number((fine.remainingAmount ?? fine.fineAmount ?? 0));
  if (meta) meta.textContent = `${fine.username || ''} — Remaining $${remaining.toFixed(2)}`;
  if (input) {
    input.value = remaining.toFixed(2);
    input.max = remaining;
    input.disabled = false;
  }
  modal?.classList.remove('hidden');
  // allow backdrop click to close when not submitting
  modal.onclick = (e) => {
    if (isPaying) return;
    if (e.target === modal) closePayModal();
  };
  window.onkeydown = (e) => { if (!isPaying && e.key === 'Escape') closePayModal(); };
}
function closePayModal() {
  selectedPayFine = null;
  isPaying = false;
  const err = qs('#pay-error');
  if (err) { err.textContent = ''; err.classList.add('hidden'); }
  qs('#pay-modal')?.classList.add('hidden');
  window.onkeydown = null;
}
async function confirmPayModal() {
  if (isPaying) return;
  if (!selectedPayFine) { closePayModal(); return; }
  const input = qs('#pay-amount-input');
  const err = qs('#pay-error');
  const amt = Number(input?.value || 0);
  const remaining = Number((selectedPayFine.remainingAmount ?? selectedPayFine.fineAmount ?? 0));
  const showErr = (msg) => {
    if (err) { err.textContent = msg; err.classList.remove('hidden'); }
    else showMessage(msg);
  };
  if (!amt || amt <= 0) { showErr('Enter amount greater than 0'); return; }
  if (amt > remaining) { showErr('Amount cannot exceed remaining'); return; }
  try {
    isPaying = true;
    if (input) input.disabled = true;
    if (err) err.classList.add('hidden');
    await api(`/fines/${selectedPayFine.fineId}/pay`, { method: 'PATCH', body: JSON.stringify({ amount: amt }) });
    await Promise.all([fetchAdminFines(), fetchAdminStats()]);
    closePayModal();
    showMessage('Payment applied');
  } catch (e) {
    showErr(e.message || 'Payment failed');
  } finally {
    isPaying = false;
    if (input) input.disabled = false;
  }
}

function handleSearchBooks(e) {
  const term = e.target.value.toLowerCase();
  const filtered = state.books.filter((b) => {
    const authors = (b.authors || []).map((a) => a.name).join(' ').toLowerCase();
    return (
      b.title.toLowerCase().includes(term) ||
      (b.category || '').toLowerCase().includes(term) ||
      authors.includes(term) ||
      (b.publisher?.name || '').toLowerCase().includes(term)
    );
  });
  renderBooks(filtered);
}

function wireEvents() {
  qsa('input[type="date"]').forEach((el) => { el.min = todayIso(); });
  qs('#signin-form').addEventListener('submit', handleLogin);
  qs('#signup-form').addEventListener('submit', handleRegister);
  const forgotLink = qs('#forgot-link');
  const backToLogin = qs('#back-to-login');
  const forgotSend = qs('#forgot-send');
  qs('#forgot-form').addEventListener('submit', handleForgotSubmit);
  if (forgotSend) forgotSend.addEventListener('click', handleForgotSend);
  if (forgotLink) forgotLink.addEventListener('click', (e) => { e.preventDefault(); showAuthForm('forgot'); });
  if (backToLogin) backToLogin.addEventListener('click', (e) => { e.preventDefault(); showAuthForm('signin'); });
  qsa('.auth-tab').forEach((tab) => tab.addEventListener('click', () => {
    const isSignIn = tab.id === 'tab-signin';
    showAuthForm(isSignIn ? 'signin' : 'signup');
    showMessage(isSignIn ? 'Sign in' : 'Sign up');
  }));
  qs('#logout-btn').addEventListener('click', () => handleLogout());
  qs('#menu-toggle').addEventListener('click', () => qs('#sidebar').classList.toggle('open'));
  qs('#modal-close').addEventListener('click', closeModal);
  qs('#modal-borrow').addEventListener('click', () => { if (modalBook) borrowBook(modalBook.isbn); closeModal(); });
  qs('#modal-reserve').addEventListener('click', () => { if (modalBook) reserveBook(modalBook.isbn); closeModal(); });
  // Pay modal buttons (avoid inline handlers)
  qs('#pay-close-btn')?.addEventListener('click', closePayModal);
  qs('#pay-cancel-btn')?.addEventListener('click', closePayModal);
  qs('#pay-apply-btn')?.addEventListener('click', (e) => { e.preventDefault(); confirmPayModal(); });
  qs('#books-search').addEventListener('input', handleSearchBooks);
  qsa('.nav-item').forEach((btn) => btn.addEventListener('click', () => {
    const section = btn.dataset.section;
    const parent = btn.closest('.nav-group');
    qsa(`#${parent.id} .nav-item`).forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    qsa('.section').forEach((s) => s.classList.remove('visible'));
    qs(`#${section}`).classList.add('visible');
  }));
  qsa('.tab').forEach((tab) => tab.addEventListener('click', () => {
    qsa('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    qsa('.tab-panel').forEach((p) => p.classList.add('hidden'));
    qs(`.tab-panel[data-panel="${target}"]`).classList.remove('hidden');
  }));
  qs('#admin-book-form').addEventListener('submit', addBook);
  const totalInput = qs('#total-copies');
  const availInput = qs('#available-copies');
  const copiesError = qs('#copies-error');
  const addSubmit = qs('#add-book-submit');
  const syncBtn = qs('#sync-available');

  function validateAddForm() {
    if (!totalInput || !availInput || !addSubmit) return;
    const validation = validateCopyInputs(totalInput.value, availInput.value);
    if (!validation.ok) {
      if (copiesError) copiesError.textContent = validation.msg;
      addSubmit.disabled = true;
    } else {
      if (copiesError) copiesError.textContent = '';
      addSubmit.disabled = false;
    }
  }

  if (totalInput && availInput) {
    totalInput.addEventListener('input', () => {
      if (!availableTouched) {
        availInput.value = totalInput.value;
      }
      validateAddForm();
    });
    availInput.addEventListener('input', () => {
      availableTouched = true;
      validateAddForm();
    });
  }
  if (syncBtn && totalInput && availInput) {
    syncBtn.addEventListener('click', () => {
      availInput.value = totalInput.value;
      availableTouched = true;
      validateAddForm();
    });
  }
  validateAddForm();
  qs('#admin-member-form').addEventListener('submit', addMember);
  qs('#admin-member-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.target).entries());
    const data = {
      name: raw.name?.trim() || undefined,
      username: raw.username?.trim() || undefined,
      email: raw.email?.trim() || undefined,
      phone: raw.phone?.trim() || undefined,
      address: raw.address?.trim() || undefined
    };
    const memberId = qs('#admin-member-edit').value;
    if (!memberId) { showMessage('Select member to edit'); return; }
    if (data.phone && !isValidPhoneFront(data.phone)) {
      showMessage('Phone must be 10-15 digits');
      return;
    }
    try {
      await api(`/members/${memberId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: data.name,
          username: data.username,
          email: data.email,
          phone: data.phone,
          address: data.address
        })
      });
      e.target.reset();
      await fetchAdminMembers();
      showMessage('Member updated');
    } catch (err) { showMessage(err.message); }
  });
  qs('#issue-form').addEventListener('submit', issueBook);
  qs('#return-form').addEventListener('submit', returnFromAdmin);
  const fineMemberSelect = qs('#fine-member');
  const fineLoanSelect = qs('#fine-loan');
  const fineSubmit = qs('#fine-submit');
  const fineHint = qs('#fine-form-hint');
  if (fineSubmit) fineSubmit.disabled = true;

  async function loadFineLoans(memberId) {
    if (!fineLoanSelect) return;
    fineLoanSelect.innerHTML = '<option value=\"\">Select Borrowed Book</option>';
    if (!memberId) { if (fineSubmit) fineSubmit.disabled = true; return; }
    const loans = await api(`/members/${memberId}/loans?status=active`);
    if (!loans.length) {
      if (fineHint) fineHint.textContent = 'This member has no borrowed books. You cannot add a fine.';
      if (fineSubmit) fineSubmit.disabled = true;
      return;
    }
    loans.forEach((l) => {
      const opt = document.createElement('option');
      opt.value = l.loanId;
      opt.textContent = `${l.title || l.isbn} (due ${formatDate(l.dueDate)})`;
      fineLoanSelect.append(opt);
    });
    if (fineHint) fineHint.textContent = '';
    if (fineSubmit) fineSubmit.disabled = false;
  }

  fineMemberSelect?.addEventListener('change', async (e) => {
    const memberId = e.target.value;
    await loadFineLoans(memberId);
  });

  qs('#admin-fine-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    if (!data.fineAmount || !data.memberId || !data.loanId) { showMessage('Member, loan, and amount are required'); return; }
    try {
      await api('/fines', { method: 'POST', body: JSON.stringify({
        memberId: Number(data.memberId),
        fineAmount: Number(data.fineAmount),
        loanId: Number(data.loanId),
        reason: data.reason || 'overdue'
      }) });
      e.target.reset();
      await Promise.all([fetchAdminFines(), fetchAdminStats()]);
      showMessage('Fine added');
    } catch (err) { showMessage(err.message); }
  });
  qs('#fine-pay-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const amt = Number(qs('#fine-pay-amount').value || 0);
    const fineId = qs('#member-fine-select')?.value;
    if (!fineId) { showMessage('Select a fine to pay.'); return; }
    if (amt <= 0) { showMessage('Enter an amount to pay.'); return; }
    payFine(Number(fineId), amt);
    e.target.reset();
  });
  qs('#confirm-cancel')?.addEventListener('click', closeConfirm);
  qs('#confirm-ok')?.addEventListener('click', () => {
    const cb = confirmCb;
    closeConfirm();
    cb && cb();
  });
  qsa('.view-more').forEach((link) => link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = link.dataset.target;
    if (target) {
      qsa('.section').forEach((s) => s.classList.remove('visible'));
      qs(`#${target}`).classList.add('visible');
      const navBtn = qsa('.nav-item').find((b) => b.dataset.section === target);
      if (navBtn) {
        qsa('.nav-item').forEach((b) => b.classList.remove('active'));
        navBtn.classList.add('active');
      }
    }
  }));
  qs('#admin-books-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = state.books.filter((b) =>
      b.title.toLowerCase().includes(term) ||
      (b.category || '').toLowerCase().includes(term) ||
      (b.isbn || '').toLowerCase().includes(term)
    );
    renderAdminBooks(filtered);
  });
  qs('#calc-days').addEventListener('input', (e) => {
    const days = Number(e.target.value || 0);
    qs('#calc-result').value = (days * 10).toFixed(2);
  });
}

function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (!state.token) return;
  const ping = async () => {
    try {
      await api('/auth/me');
    } catch (err) {
      // api will handle logout and redirect
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    }
  };
  heartbeatTimer = setInterval(ping, 5000);
  // also ping immediately on regain focus for faster invalidation
  document.addEventListener('visibilitychange', () => {
    if (!state.token) return;
    if (!document.hidden) ping();
  });
}

async function bootstrapAfterAuth() {
  syncAuthUI();
  await fetchProfile();
  setRoleUI();
  startHeartbeat();
  if (state.role === 'Admin') {
    await Promise.all([
      fetchBooks(),
      fetchAdminStats(),
      fetchAdminMembers(),
      fetchAdminReservations(),
      fetchAdminLoans(),
      fetchAdminFines()
    ]);
    renderAdminBooks();
    renderAdminMembers();
    renderAdminReservations();
    renderAdminLoans();
    renderAdminFines();
    drawAdminCharts();
  } else {
    const memberStats = await fetchMemberStats().catch(() => null);
    await Promise.all([fetchBooks(), fetchMemberLoans(), fetchMemberReservations(), fetchMemberFines()]);
    renderBorrowed();
    renderReservations();
    renderMemberFines();
    const fallbackStats = (() => {
      const catCounts = {};
      state.loans.forEach((l) => {
        const b = state.bookMap?.get(l.isbn);
        const cat = b?.category || 'General';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      });
      return {
        borrowed: state.loans.filter((l) => !l.returnDate).length,
        reservations: state.reservations.length,
        finesDue: state.fines.filter((f) => String(f.paymentStatus || '').toLowerCase() !== 'paid').reduce((s,f)=>s+Number((f.remainingAmount ?? f.fineAmount ?? 0)),0),
        categoryDistribution: Object.entries(catCounts).map(([label,value])=>({label,value}))
      };
    })();
    const stats = memberStats || fallbackStats;
    drawMemberChart(stats);
    qs('#stat-borrowed').textContent = stats.borrowed || 0;
    qs('#stat-reservations').textContent = stats.reservations || 0;
    qs('#stat-fines').textContent = `$${Number(stats.finesDue || 0).toFixed(2)}`;
  }
}

async function init() {
  wireEvents();
  syncAuthUI();
  if (state.token) {
    try { await bootstrapAfterAuth(); } catch (err) { console.error(err); handleLogout(); }
  }
}

document.addEventListener('DOMContentLoaded', init);

// Confirm modal helpers
function openConfirm(message, onConfirm) {
  const modal = qs('#confirm-modal');
  if (!modal) return onConfirm?.();
  qs('#confirm-message').textContent = message;
  modal.classList.remove('hidden');
  confirmCb = onConfirm;
}
function closeConfirm() {
  const modal = qs('#confirm-modal');
  if (modal) modal.classList.add('hidden');
  confirmCb = null;
}
