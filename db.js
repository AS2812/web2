const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'library.db');
const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function init() {
  await run('PRAGMA foreign_keys = ON');

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('Member','Admin')),
      fullName TEXT,
      phone TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS members (
      memberId INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER UNIQUE NOT NULL,
      name TEXT,
      address TEXT,
      finesOwed REAL DEFAULT 0,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      userId INTEGER PRIMARY KEY,
      staffCode TEXT,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      bio TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS publishers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS books (
      isbn TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      category TEXT,
      publicationDate TEXT,
      copiesAvailable INTEGER DEFAULT 1,
      totalCopies INTEGER DEFAULT 1,
      publisherId INTEGER,
      description TEXT,
      cover TEXT,
      FOREIGN KEY(publisherId) REFERENCES publishers(id)
    )
  `);
  // add author column if missing
  await run(`ALTER TABLE books ADD COLUMN author TEXT`, []).catch(() => {});

  await run(`
    CREATE TABLE IF NOT EXISTS wrote (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      isbn TEXT NOT NULL,
      authorId INTEGER NOT NULL,
      FOREIGN KEY(isbn) REFERENCES books(isbn) ON DELETE CASCADE,
      FOREIGN KEY(authorId) REFERENCES authors(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS loans (
      loanId INTEGER PRIMARY KEY AUTOINCREMENT,
      isbn TEXT NOT NULL,
      memberId INTEGER NOT NULL,
      borrowDate TEXT NOT NULL,
      dueDate TEXT NOT NULL,
      returnDate TEXT,
      FOREIGN KEY(isbn) REFERENCES books(isbn),
      FOREIGN KEY(memberId) REFERENCES members(memberId)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS reservations (
      reservationId INTEGER PRIMARY KEY AUTOINCREMENT,
      isbn TEXT NOT NULL,
      memberId INTEGER NOT NULL,
      reservationDate TEXT NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY(isbn) REFERENCES books(isbn),
      FOREIGN KEY(memberId) REFERENCES members(memberId)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS fines (
      fineId INTEGER PRIMARY KEY AUTOINCREMENT,
      loanId INTEGER NOT NULL,
      memberId INTEGER NOT NULL,
      fineAmount REAL NOT NULL,
      originalAmount REAL,
      remainingAmount REAL,
      bookId TEXT,
      reason TEXT,
      fineDate TEXT NOT NULL,
      paymentStatus TEXT NOT NULL,
      FOREIGN KEY(loanId) REFERENCES loans(loanId),
      FOREIGN KEY(memberId) REFERENCES members(memberId),
      FOREIGN KEY(bookId) REFERENCES books(isbn)
    )
  `);

  // Ensure new columns exist for backward compatibility
  await run(`ALTER TABLE fines ADD COLUMN originalAmount REAL`, []).catch(() => {});
  await run(`ALTER TABLE fines ADD COLUMN remainingAmount REAL`, []).catch(() => {});
  await run(`ALTER TABLE fines ADD COLUMN bookId TEXT`, []).catch(() => {});
  await run(`ALTER TABLE fines ADD COLUMN reason TEXT`, []).catch(() => {});
  // Backfill originalAmount / remainingAmount if missing (keep current fineAmount as remaining)
  await run(`UPDATE fines SET originalAmount = fineAmount WHERE originalAmount IS NULL`);
  await run(`UPDATE fines SET remainingAmount = fineAmount WHERE remainingAmount IS NULL`);
  await run(
    `UPDATE fines SET bookId = (SELECT isbn FROM loans WHERE loans.loanId = fines.loanId) WHERE bookId IS NULL`
  );
  await run(`UPDATE fines SET paymentStatus = 'open' WHERE paymentStatus NOT IN ('paid','waived')`);

  await run(`
    CREATE TABLE IF NOT EXISTS payments (
      paymentId INTEGER PRIMARY KEY AUTOINCREMENT,
      memberId INTEGER NOT NULL,
      amount REAL NOT NULL,
      appliedAt TEXT NOT NULL,
      payerId INTEGER,
      allocations TEXT NOT NULL,
      FOREIGN KEY(memberId) REFERENCES members(memberId)
    )
  `);
}

async function ensureSeedUser({ username, password, role, email, name }) {
  const existing = await get('SELECT * FROM users WHERE username = ? OR email = ?', [username, email]);
  const passwordHash = bcrypt.hashSync(password, 10);
  if (existing) {
    await run('UPDATE users SET passwordHash = ?, role = ?, fullName = ?, email = ? WHERE id = ?', [
      passwordHash,
      role,
      name,
      email,
      existing.id
    ]);
    return existing.id;
  }
  const res = await run(
    `INSERT INTO users (username, email, passwordHash, role, fullName) VALUES (?, ?, ?, ?, ?)`,
    [username, email, passwordHash, role, name]
  );
  return res.id;
}

async function seed() {
  const memberSeeds = [
    { username: 'mohannad', password: 'password1' },
    { username: 'noureen', password: 'password2' },
    { username: 'raneem', password: 'password3' },
    { username: 'habiba', password: 'password4' },
    { username: 'maryam', password: 'password5' },
    { username: 'ethar', password: 'password6' },
    { username: 'forat', password: 'password7' }
  ];

  // Admin
  const adminId = await ensureSeedUser({
    username: 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    role: 'Admin',
    email: process.env.ADMIN_EMAIL || 'admin@example.com',
    name: 'Admin User'
  });
  const adminProfile = await get('SELECT userId FROM admin_users WHERE userId = ?', [adminId]);
  if (!adminProfile) {
    await run(`INSERT INTO admin_users (userId, staffCode) VALUES (?, ?)`, [adminId, 'ADM-001']);
  }

  // Members
  for (const m of memberSeeds) {
    const userId = await ensureSeedUser({
      username: m.username,
      password: m.password,
      role: 'Member',
      email: `${m.username}@example.com`,
      name: m.username
    });
    const memberProfile = await get('SELECT memberId FROM members WHERE userId = ?', [userId]);
    if (!memberProfile) {
      await run(`INSERT INTO members (userId, name, address) VALUES (?, ?, ?)`, [
        userId,
        m.username,
        '123 Library St'
      ]);
    }
  }

  const existingBooks = await get('SELECT COUNT(*) as count FROM books');
  if (existingBooks && existingBooks.count > 0) {
    await ensureBookCovers();
    return;
  }

  // Authors
  const authors = [
    'Jane Austen',
    'Agatha Christie',
    'George Orwell',
    'Isaac Asimov',
    'Virginia Woolf',
    'Haruki Murakami',
    'Gabriel Garcia Marquez',
    'Toni Morrison',
    'J.K. Rowling',
    'Stephen King',
    'Neil Gaiman',
    'Chimamanda Ngozi Adichie'
  ];
  const authorIds = [];
  for (const name of authors) {
    const res = await run(`INSERT INTO authors (name, bio) VALUES (?, ?)`, [name, `${name} bio`]);
    authorIds.push(res.id);
  }

  // Publishers
  const publishers = ['Penguin Books', 'HarperCollins', 'Random House', 'Hachette', 'Simon & Schuster'];
  const publisherIds = [];
  for (const [idx, name] of publishers.entries()) {
    const res = await run(`INSERT INTO publishers (name, address) VALUES (?, ?)`, [
      name,
      `Address ${idx + 1}`
    ]);
    publisherIds.push(res.id);
  }

  // Books
  const categories = ['Romance', 'Mystery', 'Fiction', 'History', 'Science', 'Fantasy', 'Horror', 'Non-Fiction'];
  for (let i = 0; i < 40; i++) {
    const isbn = `978-0000-${(1000 + i).toString().padStart(4, '0')}`;
    const title = `Book Title ${i + 1}`;
    const category = categories[i % categories.length];
    const publicationDate = `20${(10 + (i % 15)).toString().padStart(2, '0')}-01-01`;
    const copies = 1 + (i % 4);
    const publisherId = publisherIds[i % publisherIds.length];
    const seed = (isbn || `book${i}`).replace(/[^0-9a-z]/gi, '') || `book${i}`;
    const cover = `https://picsum.photos/seed/${encodeURIComponent(seed)}/400/600`;

    await run(
      `INSERT INTO books (isbn, title, category, publicationDate, copiesAvailable, totalCopies, publisherId, description, cover)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [isbn, title, category, publicationDate, copies, copies, publisherId, `${title} description`, cover]
    );

    const authorId = authorIds[i % authorIds.length];
    await run(`INSERT INTO wrote (isbn, authorId) VALUES (?, ?)`, [isbn, authorId]);
  }

  // Sample loan, reservation, fine
  const memberOne = await get(`SELECT memberId FROM members LIMIT 1`);
  const sampleBook = await get(`SELECT isbn FROM books LIMIT 2`);
  if (memberOne && sampleBook) {
    const now = new Date();
    const due = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const loanRes = await run(
      `INSERT INTO loans (isbn, memberId, borrowDate, dueDate, returnDate) VALUES (?, ?, ?, ?, NULL)`,
      [sampleBook.isbn, memberOne.memberId, now.toISOString(), due.toISOString()]
    );
    await run(`UPDATE books SET copiesAvailable = copiesAvailable - 1 WHERE isbn = ?`, [sampleBook.isbn]);

    await run(
      `INSERT INTO reservations (isbn, memberId, reservationDate, status) VALUES (?, ?, ?, 'Pending')`,
      [sampleBook.isbn, memberOne.memberId, now.toISOString()]
    );

    await run(
      `INSERT INTO fines (loanId, memberId, bookId, fineAmount, originalAmount, remainingAmount, fineDate, paymentStatus, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 'overdue')`,
      [loanRes.id, memberOne.memberId, sampleBook.isbn, 5, 5, 5, now.toISOString()]
    );
  }

  await ensureBookCovers();
}

async function ensureBookCovers() {
  const rows = await all('SELECT rowid as idx, isbn, cover FROM books');
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const seed = (row.isbn || `book${i}`).replace(/[^0-9a-z]/gi, '') || `book${i}`;
    const cover = `https://picsum.photos/seed/${encodeURIComponent(seed)}/400/600`;
    await run('UPDATE books SET cover = ? WHERE isbn = ?', [cover, row.isbn]);
  }
}

module.exports = { db, run, get, all, init, seed };
