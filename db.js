const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'library.db');
const dbDir = path.dirname(DB_PATH);
try {
  fs.mkdirSync(dbDir, { recursive: true });
} catch (_) {
  // ignore mkdir errors; sqlite will throw if path is invalid
}
const db = new sqlite3.Database(DB_PATH);

function normalizeIsbn(isbn) {
  return String(isbn || '').replace(/[^0-9]/g, '');
}

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
  await run('PRAGMA journal_mode = WAL');

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
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_ci ON users(lower(username))`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_ci ON users(lower(email))`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_fullname_ci ON users(lower(fullName))`);

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
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_books_title_ci ON books(lower(title))`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_books_cover_ci ON books(lower(cover))`);

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

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      jti TEXT PRIMARY KEY,
      userId INTEGER NOT NULL,
      expiresAt TEXT NOT NULL,
      lastActive TEXT NOT NULL,
      rememberMe INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS password_resets (
      tokenHash TEXT PRIMARY KEY,
      userId INTEGER NOT NULL,
      expiresAt TEXT NOT NULL,
      usedAt TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
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

  // Books (popular titles with ISBN13 only; covers resolved at runtime via Google Books)
  // Drop existing rows to avoid FK constraint failures on reseed
  await run('DELETE FROM fines');
  await run('DELETE FROM reservations');
  await run('DELETE FROM loans');
  await run('DELETE FROM wrote');
  await run('DELETE FROM books');
  await run('DELETE FROM authors');
  await run('DELETE FROM publishers');
  const realBooks = [
    { title: 'Dune', author: 'Frank Herbert', category: 'Science Fiction', isbn: '9780441172719', publicationDate: '1965-08-01' },
    { title: 'Project Hail Mary', author: 'Andy Weir', category: 'Science Fiction', isbn: '9780593135204', publicationDate: '2021-05-04' },
    { title: 'The Midnight Library', author: 'Matt Haig', category: 'Fiction', isbn: '9780525559474', publicationDate: '2020-09-29' },
    { title: 'Fourth Wing', author: 'Rebecca Yarros', category: 'Fantasy', isbn: '9781649374080', publicationDate: '2023-04-01' },
    { title: 'The Seven Husbands of Evelyn Hugo', author: 'Taylor Jenkins Reid', category: 'Fiction', isbn: '9781501161933', publicationDate: '2017-06-13' },
    { title: 'The Night Circus', author: 'Erin Morgenstern', category: 'Fantasy', isbn: '9780385534635', publicationDate: '2011-09-13' },
    { title: 'The Silent Patient', author: 'Alex Michaelides', category: 'Thriller', isbn: '9781250301697', publicationDate: '2019-02-05' },
    { title: 'Where the Crawdads Sing', author: 'Delia Owens', category: 'Fiction', isbn: '9780735219090', publicationDate: '2018-08-14' },
    { title: 'Pride and Prejudice', author: 'Jane Austen', category: 'Classic', isbn: '9780141439518', publicationDate: '1813-01-28' },
    { title: 'Clean Code', author: 'Robert C. Martin', category: 'Technology', isbn: '9780132350884', publicationDate: '2008-08-11' },
    { title: 'Atomic Habits', author: 'James Clear', category: 'Self Help', isbn: '9780735211292', publicationDate: '2018-10-16' },
    { title: 'The Hobbit', author: 'J.R.R. Tolkien', category: 'Fantasy', isbn: '9780547928227', publicationDate: '1937-09-21' },
    { title: 'The Name of the Wind', author: 'Patrick Rothfuss', category: 'Fantasy', isbn: '9780756404741', publicationDate: '2007-03-27' },
    { title: "Harry Potter and the Sorcerer's Stone", author: 'J.K. Rowling', category: 'Fantasy', isbn: '9780590353427', publicationDate: '1998-09-01' },
    { title: 'The Martian', author: 'Andy Weir', category: 'Science Fiction', isbn: '9780804139021', publicationDate: '2014-02-11' },
    { title: 'A Court of Thorns and Roses', author: 'Sarah J. Maas', category: 'Fantasy', isbn: '9781619635180', publicationDate: '2015-05-05' },
    { title: 'The Book Thief', author: 'Markus Zusak', category: 'Historical Fiction', isbn: '9780375842207', publicationDate: '2005-03-14' },
    { title: '1984', author: 'George Orwell', category: 'Dystopian', isbn: '9780451524935', publicationDate: '1949-06-08' },
    { title: 'The Alchemist', author: 'Paulo Coelho', category: 'Fiction', isbn: '9780061122415', publicationDate: '1993-05-01' },
    { title: 'The Catcher in the Rye', author: 'J.D. Salinger', category: 'Classic', isbn: '9780316769488', publicationDate: '1951-07-16' },
    { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', category: 'Classic', isbn: '9780743273565', publicationDate: '1925-04-10' },
    { title: 'To Kill a Mockingbird', author: 'Harper Lee', category: 'Classic', isbn: '9780061120084', publicationDate: '1960-07-11' },
    { title: 'The Fellowship of the Ring', author: 'J.R.R. Tolkien', category: 'Fantasy', isbn: '9780547928210', publicationDate: '1954-07-29' },
    { title: 'The Hunger Games', author: 'Suzanne Collins', category: 'Young Adult', isbn: '9780439023528', publicationDate: '2008-09-14' },
    { title: 'The Girl on the Train', author: 'Paula Hawkins', category: 'Thriller', isbn: '9781594634024', publicationDate: '2015-01-13' },
    { title: 'Gone Girl', author: 'Gillian Flynn', category: 'Thriller', isbn: '9780307588371', publicationDate: '2012-06-05' },
    { title: 'Educated', author: 'Tara Westover', category: 'Memoir', isbn: '9780399590504', publicationDate: '2018-02-20' },
    { title: 'Becoming', author: 'Michelle Obama', category: 'Memoir', isbn: '9781524763138', publicationDate: '2018-11-13' },
    { title: 'The Road', author: 'Cormac McCarthy', category: 'Post-Apocalyptic', isbn: '9780307387898', publicationDate: '2006-09-26' },
    { title: 'Sapiens', author: 'Yuval Noah Harari', category: 'Nonfiction', isbn: '9780062316110', publicationDate: '2015-02-10' },
    { title: 'A Game of Thrones', author: 'George R.R. Martin', category: 'Fantasy', isbn: '9780553593716', publicationDate: '1996-08-06' },
    { title: 'The Lightning Thief', author: 'Rick Riordan', category: 'Fantasy', isbn: '9780786838653', publicationDate: '2005-06-28' },
    { title: 'The Fault in Our Stars', author: 'John Green', category: 'Young Adult', isbn: '9780525478812', publicationDate: '2012-01-10' },
    { title: 'The Kite Runner', author: 'Khaled Hosseini', category: 'Fiction', isbn: '9781594480003', publicationDate: '2003-05-29' },
    { title: 'The Subtle Art of Not Giving a F*ck', author: 'Mark Manson', category: 'Self Help', isbn: '9780062457714', publicationDate: '2016-09-13' },
    { title: 'Ready Player One', author: 'Ernest Cline', category: 'Science Fiction', isbn: '9780307887443', publicationDate: '2011-08-16' }
  ];
  const publisherNames = ['Penguin Books', 'HarperCollins', 'Random House', 'Hachette', 'Simon & Schuster', 'Bloomsbury'];
  const publisherIds = [];
  for (const [idx, name] of publisherNames.entries()) {
    const res = await run(`INSERT INTO publishers (name, address) VALUES (?, ?)`, [
      name,
      `Address ${idx + 1}`
    ]);
    publisherIds.push(res.id);
  }
  const authorIds = new Map();
  for (const [idx, book] of realBooks.entries()) {
    const normalizedIsbn = normalizeIsbn(book.isbn);
    if (normalizedIsbn.length !== 13) {
      throw new Error(`Invalid ISBN seed for "${book.title}": ${book.isbn}`);
    }
    let authorRow = authorIds.get(book.author);
    if (!authorRow) {
      const res = await run(`INSERT INTO authors (name, bio) VALUES (?, ?)`, [book.author, `${book.author} bio`]);
      authorRow = { id: res.id };
      authorIds.set(book.author, authorRow);
    }
    const publicationDate = book.publicationDate || '2000-01-01';
    const copies = 3 + (Number(normalizedIsbn.slice(-1)) % 3);
    const publisherId = publisherIds[idx % publisherIds.length];
    await run(
      `INSERT INTO books (isbn, title, author, category, publicationDate, copiesAvailable, totalCopies, publisherId, description, cover)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedIsbn,
        book.title,
        book.author,
        book.category,
        publicationDate,
        copies,
        copies,
        publisherId,
        `${book.title} by ${book.author}`,
        null
      ]
    );
    await run(`INSERT INTO wrote (isbn, authorId) VALUES (?, ?)`, [normalizedIsbn, authorRow.id]);
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

}

module.exports = { db, run, get, all, init, seed };
