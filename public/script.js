const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));
const API_BASE = '';

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
  const data = await res.json().catch(() => null);
  if (res.status === 401) {
    handleLogout('Session expired. Please sign in again.');
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
    showMessage(err.message);
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
  if (message) alert(message);
}

// Fetchers
async function fetchProfile() {
  const profile = await api('/auth/me');
  state.user = profile.user;
  state.memberId = profile.memberId;
  state.role = profile.user.role;
  renderProfile();
}

async function fetchBooks() {
  state.books = await api('/books');
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
  return `https://via.placeholder.com/240x320/cee8f4/3b4f93?text=${encodeURIComponent(book?.title || 'Book')}`;
}

function renderRecommendations() {
  const list = qs('#recommendations');
  list.innerHTML = '';
  state.books.slice(0, 6).forEach((book) => {
    const card = document.createElement('div');
    card.className = 'book-card';
    card.innerHTML = `
      <img src="${book.cover || placeholderCover(book)}" alt="${book.title}" />
      <h4>${book.title}</h4>
      <p class="muted">${book.authors?.map((a) => a.name).join(', ') || 'Author'}</p>
      <p>${book.category || 'General'}</p>
    `;
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
    <img src="${book.cover || placeholderCover(book)}" alt="${book.title}" />
    <h4>${book.title}</h4>
    <p class="muted">${book.authors?.map((a) => a.name).join(', ') || 'Author'}</p>
    <p>${book.category || 'General'}</p>
    <p class="status ${book.copiesAvailable > 0 ? 'available' : 'pending'}">${book.copiesAvailable > 0 ? 'Available' : 'Not available'}</p>
  `;
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
      <img src="${book?.cover || placeholderCover(book)}" alt="${book?.title || loan.isbn}" />
      <h4>${book?.title || loan.isbn}</h4>
      <p class="muted">${book?.authors?.map((a) => a.name).join(', ') || ''}</p>
      <p class="status ${statusText.toLowerCase()}">${statusText}</p>
      <p class="muted">Borrowed: ${formatDate(loan.borrowDate)}</p>
      <p class="muted">Due: ${formatDate(loan.dueDate)}</p>
    `;
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
      <img src="${book?.cover || placeholderCover(book)}" alt="${book?.title || res.isbn}" />
      <h4>${book?.title || res.isbn}</h4>
      <p class="muted">${book?.authors?.map((a) => a.name).join(', ') || ''}</p>
      <p class="status ${res.status.toLowerCase()}">${res.status}</p>
      <p class="muted">Reserved: ${formatDate(res.reservationDate)}</p>
    `;
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
  state.fines.forEach((fine) => {
    const statusClass = fine.paymentStatus === 'Paid' ? 'ready' : 'overdue';
    if (fine.paymentStatus !== 'Paid') total += Number(fine.fineAmount || 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fine.title || '-'}</td>
      <td>${formatDate(fine.dueDate)}</td>
      <td>${formatDate(fine.returnDate)}</td>
      <td>$${Number(fine.fineAmount || 0).toFixed(2)}</td>
      <td class="status ${statusClass}">${fine.paymentStatus}</td>
      <td></td>
    `;
    const btn = document.createElement('button');
    btn.className = 'secondary-btn';
    btn.textContent = 'Pay';
    btn.disabled = fine.paymentStatus === 'Paid';
    btn.addEventListener('click', () => payFine(fine.fineId));
    tr.lastElementChild.append(btn);
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
  if (finesEl) finesEl.textContent = s.pendingFines ?? state.admin.fines.filter((f) => f.paymentStatus !== 'Paid').length;
}

function renderAdminBooks(list = state.books) {
  const grid = qs('#admin-books-grid');
  if (!grid) return;
  grid.innerHTML = '';
  list.forEach((book) => {
    const card = document.createElement('div');
    card.className = 'book-tile';
    card.innerHTML = `
      <img src="${book.cover || placeholderCover(book)}" alt="${book.title}" />
      <h4>${book.title}</h4>
      <p class="muted">${book.category || 'General'}</p>
      <p>Copies: ${book.copiesAvailable}/${book.totalCopies}</p>
    `;
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const del = document.createElement('button');
    del.className = 'secondary-btn';
    del.textContent = 'Delete';
    del.addEventListener('click', () => deleteBook(book.isbn));
    actions.append(del);
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
    grid.append(card);
  });
}

function renderAdminReservations() {
  const tbody = qs('#admin-reservation-rows');
  tbody.innerHTML = '';
  state.admin.reservations.forEach((res) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${res.title}</td>
      <td>${res.memberName}</td>
      <td>${formatDate(res.reservationDate)}</td>
      <td class="status ${res.status.toLowerCase()}">${res.status}</td>
      <td></td>
    `;
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
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${loan.title || loan.isbn}</td>
      <td>${loan.memberName || loan.memberId}</td>
      <td>${formatDate(loan.borrowDate)}</td>
      <td>${formatDate(loan.dueDate)}</td>
      <td class="status ${status.toLowerCase()}">${status}</td>
      <td></td>
    `;
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
    if (fine.paymentStatus !== 'Paid') {
      total += Number(fine.fineAmount || 0);
      membersWithFines.add(fine.username);
    }
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fine.username}</td>
      <td>${fine.title || '-'}</td>
      <td>$${Number(fine.fineAmount || 0).toFixed(2)}</td>
      <td>${formatDate(fine.fineDate)}</td>
      <td class="status ${fine.paymentStatus.toLowerCase()}">${fine.paymentStatus}</td>
      <td></td>
    `;
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const pay = document.createElement('button');
    pay.className = 'primary-btn';
    pay.textContent = 'Pay';
    pay.addEventListener('click', () => updateFineStatus(fine.fineId, 'Paid'));
    const reduce = document.createElement('button');
    reduce.className = 'secondary-btn';
    reduce.textContent = 'Reduce';
    reduce.addEventListener('click', () => {
      const amt = Number(prompt('Reduce by amount:', '1') || 0);
      if (!Number.isNaN(amt)) reduceFine(fine.fineId, amt);
    });
    actions.append(pay, reduce);
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
  const labels = (stats.categoryDistribution || []).map((c) => c.label || 'Category');
  const values = (stats.categoryDistribution || []).map((c) => Number(c.value || 0));
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
  qs('#modal-cover').style.backgroundImage = `url(${book.cover || placeholderCover(book)})`;
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

async function payFine(fineId) {
  try {
    await api(`/fines/${fineId}/pay`, { method: 'PATCH' });
    await fetchMemberFines();
    showMessage('Fine paid');
  } catch (err) { showMessage(err.message); }
}

async function reduceFine(fineId, amount) {
  try {
    await api(`/fines/${fineId}/reduce`, { method: 'PUT', body: JSON.stringify({ amount }) });
    await fetchAdminFines();
    showMessage('Fine reduced');
  } catch (err) { showMessage(err.message); }
}

async function addBook(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  const payload = {
    title: data.title,
    isbn: data.isbn,
    category: data.category || null,
    publicationDate: data.publicationDate || null,
    copiesAvailable: data.copiesAvailable ? Number(data.copiesAvailable) : undefined,
    totalCopies: data.totalCopies ? Number(data.totalCopies) : undefined,
    cover: data.cover || null,
    description: data.description || null
  };
  try {
    await api('/books', { method: 'POST', body: JSON.stringify(payload) });
    e.target.reset();
    await fetchBooks();
    renderAdminBooks();
    showMessage('Book added');
  } catch (err) { showMessage(err.message); }
}

async function deleteBook(isbn) {
  try {
    await api(`/books/${encodeURIComponent(isbn)}`, { method: 'DELETE' });
    await fetchBooks();
    renderAdminBooks();
    showMessage('Book deleted');
  } catch (err) { showMessage(err.message); }
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
  qs('#admin-member-form').addEventListener('submit', addMember);
  qs('#issue-form').addEventListener('submit', issueBook);
  qs('#return-form').addEventListener('submit', returnFromAdmin);
  qs('#admin-fine-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    if (!data.fineAmount || !data.memberId) { showMessage('Select member and amount'); return; }
    try {
      await api('/fines', { method: 'POST', body: JSON.stringify({
        memberId: Number(data.memberId),
        fineAmount: Number(data.fineAmount),
        loanId: data.loanId ? Number(data.loanId) : undefined
      }) });
      e.target.reset();
      await fetchAdminFines();
      showMessage('Fine added');
    } catch (err) { showMessage(err.message); }
  });
  qs('#fine-pay-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const pending = state.fines.find((f) => f.paymentStatus !== 'Paid');
    if (pending) payFine(pending.fineId);
    else showMessage('No pending fines.');
  });
  qs('#pay-first-fine').addEventListener('click', () => {
    const pending = state.fines.find((f) => f.paymentStatus !== 'Paid');
    if (pending) payFine(pending.fineId);
    else showMessage('No pending fines.');
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
    const memberStats = await fetchMemberStats();
    await Promise.all([fetchBooks(), fetchMemberLoans(), fetchMemberReservations(), fetchMemberFines()]);
    renderBorrowed();
    renderReservations();
    renderMemberFines();
    drawMemberChart(memberStats);
    qs('#stat-borrowed').textContent = memberStats.borrowed || 0;
    qs('#stat-reservations').textContent = memberStats.reservations || 0;
    qs('#stat-fines').textContent = `$${Number(memberStats.finesDue || 0).toFixed(2)}`;
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
