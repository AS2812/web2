const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));
const API_BASE = '';
const COVER_SIZE = 'L';
// Inline SVG placeholder (avoids external blocking)
const PLACEHOLDER =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="100%" height="100%" fill="%23eef2f9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%235b6478" font-family="Montserrat,Arial,sans-serif" font-size="24">No Cover</text></svg>';
const CACHE_KEY = 'coverCache_v1';
const coverCacheMem = new Map();
let coverCacheStorage = {};
try {
  const stored = localStorage.getItem(CACHE_KEY);
  coverCacheStorage = stored ? JSON.parse(stored) : {};
} catch (err) {
  coverCacheStorage = {};
}
const searchCacheMem = new Map();

const state = {
  token: localStorage.getItem('token'),
  user: null,
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
    handleLogout();
    sessionStorage.setItem('auth_msg', 'Session expired. Please sign in again.');
    window.location.href = '/';
    throw new Error('Unauthorized');
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
        password: form.get('password')
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
  try {
    const resp = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: form.get('username').trim(),
        password: form.get('password'),
        name: `${form.get('firstName')} ${form.get('lastName')}`.trim(),
        phone: form.get('phone') || ''
      })
    });
    setToken(resp.token);
    await bootstrapAfterAuth();
  } catch (err) {
    showMessage(err.message);
  }
}

function handleLogout(message) {
  setToken(null);
  state.user = null;
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
}

// Fetchers
async function fetchProfile() {
  const profile = await api('/auth/me');
  state.user = profile.user || {};
  state.memberId = profile.memberId || null;
  state.role = profile.user?.role || null;
  renderProfile();
}

async function fetchBooks() {
  state.books = await api('/books');
  state.bookMap = new Map(state.books.map((b) => [b.isbn, b]));
  renderBooks();
  renderRecommendations();
  renderAdminBooks();
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

async function fetchAdminFines() {
  state.admin.fines = await api('/fines');
  renderAdminFines();
}

// Rendering
function renderProfile() {
  qs('#profile-name').textContent = state.user?.fullName || state.user?.username || 'User';
  qs('#profile-role').textContent = state.role || '';
  qs('#avatar').textContent = (state.user?.username || 'U').slice(0, 2).toUpperCase();
  qs('#welcome-text').textContent = `Welcome ${state.user?.fullName || state.user?.username || ''}!`;
  qs('#welcome-date').textContent = new Date().toLocaleString();
  qs('#admin-welcome').textContent = `Welcome ${state.user?.fullName || ''}!`;
  qs('#admin-date').textContent = new Date().toLocaleString();
}

function placeholderCover(book) {
  return PLACEHOLDER;
}

function sanitizeIsbn(isbn) {
  return (isbn || '').replace(/[-\s]/g, '').trim();
}
function buildOpenLibraryUrl(isbn, size = COVER_SIZE) {
  const clean = sanitizeIsbn(isbn);
  if (!clean) return PLACEHOLDER;
  return `https://covers.openlibrary.org/b/isbn/${clean}-${size}.jpg?default=false`;
}
function getCachedCover(isbn) {
  const clean = sanitizeIsbn(isbn);
  if (!clean) return null;
  if (coverCacheMem.has(clean)) return coverCacheMem.get(clean);
  if (coverCacheStorage[clean]) {
    coverCacheMem.set(clean, coverCacheStorage[clean]);
    return coverCacheStorage[clean];
  }
  return null;
}
function setCachedCover(isbn, url) {
  const clean = sanitizeIsbn(isbn);
  if (!clean) return;
  coverCacheMem.set(clean, url);
  coverCacheStorage[clean] = url;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(coverCacheStorage)); } catch {}
}

async function fetchOpenLibrarySearchCover(book) {
  const key = `${book?.title || ''}|${book?.authors?.map?.((a) => a.name).join(' ') || book?.author || ''}`.trim();
  if (searchCacheMem.has(key)) return searchCacheMem.get(key);
  if (!key) return null;
  try {
    const resp = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(key)}`);
    if (!resp.ok) throw new Error('search failed');
    const data = await resp.json();
    const doc = data?.docs?.find((d) => d.cover_i || (d.isbn && d.isbn.length));
    if (!doc) return null;
    if (doc.cover_i) {
      const url = `https://covers.openlibrary.org/b/id/${doc.cover_i}-${COVER_SIZE}.jpg?default=false`;
      searchCacheMem.set(key, url);
      return url;
    }
    if (doc.isbn && doc.isbn.length) {
      const url = buildOpenLibraryUrl(doc.isbn[0]);
      searchCacheMem.set(key, url);
      return url;
    }
  } catch (err) {
    console.warn('OpenLibrary search failed', err);
  }
  return null;
}
function coverCandidateList(book) {
  const list = [];
  if (book?.cover) list.push(book.cover);
  const isbn13 = book?.isbn13 || book?.isbn;
  const isbn10 = book?.isbn10;
  if (isbn13) list.push(buildOpenLibraryUrl(isbn13));
  if (isbn10) list.push(buildOpenLibraryUrl(isbn10));
  return list;
}
async function setCover(imgEl, book) {
  const title = book?.title || 'Book';
  const isbn13 = book?.isbn13 || book?.isbn;
  const isbn10 = book?.isbn10;
  const cacheKey = sanitizeIsbn(isbn13 || isbn10) || (book?.cover || book?.id || title);
  const candidates = [];
  const cached = cacheKey ? getCachedCover(cacheKey) : null;
  if (cached) candidates.push(cached);
  candidates.push(...coverCandidateList(book));
  // If we still don't have a real candidate, try search by title/author
  if (candidates.length === 0 || (candidates.length === 1 && candidates[0] === PLACEHOLDER)) {
    const searched = await fetchOpenLibrarySearchCover(book);
    if (searched) candidates.unshift(searched);
  }
  candidates.push(PLACEHOLDER); // final fallback data URI

  imgEl.loading = 'lazy';
  imgEl.decoding = 'async';
  imgEl.alt = `Cover of ${title}`;

  let idx = 0;
  const tryNext = () => {
    imgEl.src = candidates[Math.min(idx, candidates.length - 1)];
    idx += 1;
  };
  imgEl.onerror = () => {
    if (idx >= candidates.length) {
      imgEl.src = PLACEHOLDER;
      return;
    }
    tryNext();
  };
  imgEl.onload = () => {
    const cur = imgEl.src;
    if (cur && cur !== PLACEHOLDER && cacheKey) {
      setCachedCover(cacheKey, cur);
    }
  };
  tryNext();
}

function renderRecommendations() {
  const list = qs('#recommendations');
  list.innerHTML = '';
  state.books.slice(0, 6).forEach((book) => {
    const card = document.createElement('div');
    card.className = 'book-card';
    card.innerHTML = `
      <div class="cover"><img /></div>
      <h4>${book.title}</h4>
      <p class="muted">${book.authors?.map((a) => a.name).join(', ') || 'Author'}</p>
      <p>${book.category || 'General'}</p>
    `;
    const img = card.querySelector('img');
    setCover(img, book);
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
    books.forEach((book) => row.appendChild(bookTile(book)));
    block.append(row);
    container.append(block);
  });
}

function bookTile(book) {
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
  setCover(img, book);
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
  state.loans.forEach((loan) => {
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
    setCover(img, book || { isbn: loan.isbn, title: loan.isbn });
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
  state.reservations.forEach((res) => {
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
    setCover(img, book || { isbn: res.isbn, title: res.isbn });
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
  state.fines.forEach((fine) => {
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
    if (thumb) setCover(thumb, book || { isbn: loan?.isbn, title: loan?.isbn });
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
  list.forEach((book) => {
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
    setCover(img, book);
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
  state.admin.reservations.forEach((res) => {
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
    if (thumb) setCover(thumb, book || { isbn: res.isbn, title: res.title });
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
  state.admin.loans.forEach((loan) => {
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
    if (thumb) setCover(thumb, book || { isbn: loan.isbn, title: loan.title || loan.isbn });
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
  state.admin.fines.forEach((fine) => {
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
    if (thumb) setCover(thumb, book || { isbn: loan?.isbn, title: fine.title || loan?.isbn || '-' });
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
  qs('#modal-year').textContent = book.publicationDate || '—';
  qs('#modal-availability').textContent = book.copiesAvailable > 0 ? 'Available' : 'Not available';
  qs('#modal-cover').style.backgroundImage = `url(${coverUrlFor(book)})`;
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
    await Promise.all([fetchMemberFines(), fetchMemberLoans(), fetchAdminFines()]);
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
    await Promise.all([fetchAdminLoans(), fetchBooks(), fetchAdminReservations()]);
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
  const remaining = Number((fine.remainingAmount ?? fine.fineAmount ?? 0));
  if (meta) meta.textContent = `${fine.username || ''} — Remaining $${remaining.toFixed(2)}`;
  if (input) {
    input.value = remaining.toFixed(2);
    input.max = remaining;
  }
  modal?.classList.remove('hidden');
}
function closePayModal() {
  selectedPayFine = null;
  qs('#pay-modal')?.classList.add('hidden');
}
async function confirmPayModal() {
  if (!selectedPayFine) { closePayModal(); return; }
  const input = qs('#pay-amount-input');
  const amt = Number(input?.value || 0);
  if (!amt || amt < 0) { showMessage('Enter amount to pay'); return; }
  await api(`/fines/${selectedPayFine.fineId}/pay`, { method: 'PATCH', body: JSON.stringify({ amount: amt }) });
  await Promise.all([fetchAdminFines(), fetchAdminStats()]);
  closePayModal();
  showMessage('Payment applied');
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
  qs('#signin-form').addEventListener('submit', handleLogin);
  qs('#signup-form').addEventListener('submit', handleRegister);
  qsa('.auth-tab').forEach((tab) => tab.addEventListener('click', () => {
    qsa('.auth-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const isSignIn = tab.id === 'tab-signin';
    qs('#signin-form').classList.toggle('hidden', !isSignIn);
    qs('#signup-form').classList.toggle('hidden', isSignIn);
    showMessage(isSignIn ? 'Sign in' : 'Sign up');
  }));
  qs('#logout-btn').addEventListener('click', () => handleLogout());
  qs('#menu-toggle').addEventListener('click', () => qs('#sidebar').classList.toggle('open'));
  qs('#modal-close').addEventListener('click', closeModal);
  qs('#modal-borrow').addEventListener('click', () => { if (modalBook) borrowBook(modalBook.isbn); closeModal(); });
  qs('#modal-reserve').addEventListener('click', () => { if (modalBook) reserveBook(modalBook.isbn); closeModal(); });
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
    const data = Object.fromEntries(new FormData(e.target).entries());
    const memberId = qs('#admin-member-edit').value;
    if (!memberId) { showMessage('Select member to edit'); return; }
    try {
      await api(`/members/${memberId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: data.name || undefined,
          phone: data.phone || undefined,
          address: data.address || undefined
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

async function bootstrapAfterAuth() {
  syncAuthUI();
  await fetchProfile();
  setRoleUI();
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
