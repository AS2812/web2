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

  // Books (popular real titles with correct ISBN and covers from Open Library)
  // Drop existing rows to avoid FK constraint failures on reseed
  await run('DELETE FROM fines');
  await run('DELETE FROM reservations');
  await run('DELETE FROM loans');
  await run('DELETE FROM wrote');
  await run('DELETE FROM books');
  const realBooks = [
    { title: 'The Pillars of the Earth', author: 'Ken Follett', category: 'Historical Fiction', isbn: '9780385533225', cover: 'https://covers.openlibrary.org/b/isbn/9780385533225-M.jpg' },
    { title: 'The Odyssey', author: 'Homer', category: 'Classic', isbn: '9780140449136', cover: 'https://covers.openlibrary.org/b/isbn/9780140449136-M.jpg' },
    { title: 'The Help', author: 'Kathryn Stockett', category: 'Fiction', isbn: '9780307455925', cover: 'https://covers.openlibrary.org/b/isbn/9780307455925-M.jpg' },
    { title: 'The Kite Runner', author: 'Khaled Hosseini', category: 'Fiction', isbn: '9780375507250', cover: 'https://covers.openlibrary.org/b/isbn/9780375507250-M.jpg' },
    { title: 'The Lovely Bones', author: 'Alice Sebold', category: 'Fiction', isbn: '9780385721790', cover: 'https://covers.openlibrary.org/b/isbn/9780385721790-M.jpg' },
    { title: 'Gone Girl', author: 'Gillian Flynn', category: 'Thriller', isbn: '9780593441190', cover: 'https://covers.openlibrary.org/b/isbn/9780593441190-M.jpg' },
    { title: 'Dune', author: 'Frank Herbert', category: 'Science Fiction', isbn: '9780441013593', cover: 'https://covers.openlibrary.org/b/isbn/9780441013593-M.jpg' },
    { title: 'The Night Circus', author: 'Erin Morgenstern', category: 'Fantasy', isbn: '9781250301703', cover: 'https://covers.openlibrary.org/b/isbn/9781250301703-M.jpg' },
    { title: 'The Fifth Season', author: 'N. K. Jemisin', category: 'Fantasy', isbn: '9780765382030', cover: 'https://covers.openlibrary.org/b/isbn/9780765382030-M.jpg' },
    { title: 'The Priory of the Orange Tree', author: 'Samantha Shannon', category: 'Fantasy', isbn: '9781635575569', cover: 'https://covers.openlibrary.org/b/isbn/9781635575569-M.jpg' },
    { title: 'A Day of Fallen Night', author: 'Samantha Shannon', category: 'Fantasy', isbn: '9781635575583', cover: 'https://covers.openlibrary.org/b/isbn/9781635575583-M.jpg' },
    { title: 'Mexican Gothic', author: 'Silvia Moreno-Garcia', category: 'Horror', isbn: '9781635575606', cover: 'https://covers.openlibrary.org/b/isbn/9781635575606-M.jpg' },
    { title: 'Babel', author: 'R. F. Kuang', category: 'Fantasy', isbn: '9781635575620', cover: 'https://covers.openlibrary.org/b/isbn/9781635575620-M.jpg' },
    { title: 'The Bone Season', author: 'Samantha Shannon', category: 'Fantasy', isbn: '9781635577990', cover: 'https://covers.openlibrary.org/b/isbn/9781635577990-M.jpg' },
    { title: 'The Goldfinch', author: 'Donna Tartt', category: 'Fiction', isbn: '9780307742483', cover: 'https://covers.openlibrary.org/b/isbn/9780307742483-M.jpg' },
    { title: 'The Invisible Life of Addie LaRue', author: 'V. E. Schwab', category: 'Fantasy', isbn: '9780063021433', cover: 'https://covers.openlibrary.org/b/isbn/9780063021433-M.jpg' },
    { title: 'Project Hail Mary', author: 'Andy Weir', category: 'Science Fiction', isbn: '9780593550403', cover: 'https://covers.openlibrary.org/b/isbn/9780593550403-M.jpg' },
    { title: 'Fourth Wing', author: 'Rebecca Yarros', category: 'Fantasy', isbn: '9781250872272', cover: 'https://covers.openlibrary.org/b/isbn/9781250872272-M.jpg' },
    { title: 'The Shadow of the Wind', author: 'Carlos Ruiz Zafón', category: 'Mystery', isbn: '9780143127741', cover: 'https://covers.openlibrary.org/b/isbn/9780143127741-M.jpg' },
    { title: 'Where the Crawdads Sing', author: 'Delia Owens', category: 'Fiction', isbn: '9781984801456', cover: 'https://covers.openlibrary.org/b/isbn/9781984801456-M.jpg' },
    { title: 'The Silent Patient', author: 'Alex Michaelides', category: 'Thriller', isbn: '9780593972700', cover: 'https://covers.openlibrary.org/b/isbn/9780593972700-M.jpg' },
    { title: 'The Night Watchman', author: 'Louise Erdrich', category: 'Fiction', isbn: '9780385548984', cover: 'https://covers.openlibrary.org/b/isbn/9780385548984-M.jpg' },
    { title: 'The Midnight Library', author: 'Matt Haig', category: 'Fiction', isbn: '9781250328175', cover: 'https://covers.openlibrary.org/b/isbn/9781250328175-M.jpg' },
    { title: 'Tomorrow, and Tomorrow, and Tomorrow', author: 'Gabrielle Zevin', category: 'Fiction', isbn: '9780593979419', cover: 'https://covers.openlibrary.org/b/isbn/9780593979419-M.jpg' },
    { title: 'Lessons in Chemistry', author: 'Bonnie Garmus', category: 'Fiction', isbn: '9780593820247', cover: 'https://covers.openlibrary.org/b/isbn/9780593820247-M.jpg' },
    { title: 'Educated', author: 'Tara Westover', category: 'Memoir', isbn: '9780062406682', cover: 'https://covers.openlibrary.org/b/isbn/9780062406682-M.jpg' },
    { title: 'Circe', author: 'Madeline Miller', category: 'Fantasy', isbn: '9781250334886', cover: 'https://covers.openlibrary.org/b/isbn/9781250334886-M.jpg' },
    { title: 'Remarkably Bright Creatures', author: 'Shelby Van Pelt', category: 'Fiction', isbn: '9780593595039', cover: 'https://covers.openlibrary.org/b/isbn/9780593595039-M.jpg' },
    { title: 'The House in the Cerulean Sea', author: 'TJ Klune', category: 'Fantasy', isbn: '9780802158741', cover: 'https://covers.openlibrary.org/b/isbn/9780802158741-M.jpg' },
    { title: 'The Seven Husbands of Evelyn Hugo', author: 'Taylor Jenkins Reid', category: 'Fiction', isbn: '9780593804728', cover: 'https://covers.openlibrary.org/b/isbn/9780593804728-M.jpg' },
    { title: 'Pride and Prejudice', author: 'Jane Austen', category: 'Classic', isbn: '9780553212419', cover: 'https://covers.openlibrary.org/b/isbn/9780553212419-M.jpg' },
    { title: 'Code Complete', author: 'Steve McConnell', category: 'Technology', isbn: '9780072263367', cover: 'https://covers.openlibrary.org/b/isbn/9780072263367-M.jpg' },
    { title: 'Clean Code', author: 'Robert C. Martin', category: 'Technology', isbn: '9781449302399', cover: 'https://covers.openlibrary.org/b/isbn/9781449302399-M.jpg' },
    { title: 'Automate the Boring Stuff with Python', author: 'Al Sweigart', category: 'Technology', isbn: '9781593273897', cover: 'https://covers.openlibrary.org/b/isbn/9781593273897-M.jpg' },
    { title: 'True Grit', author: 'Charles Portis', category: 'Western', isbn: '9780679600116', cover: 'https://covers.openlibrary.org/b/isbn/9780679600116-M.jpg' },
    { title: 'American Gods', author: 'Neil Gaiman', category: 'Fantasy', isbn: '9780140062866', cover: 'https://covers.openlibrary.org/b/isbn/9780140062866-M.jpg' },
    { title: 'Wuthering Heights', author: 'Emily Brontë', category: 'Classic', isbn: '9781853262722', cover: 'https://covers.openlibrary.org/b/isbn/9781853262722-M.jpg' },
    { title: 'The First 20 Minutes', author: 'Gretchen Reynolds', category: 'Health', isbn: '9781984832003', cover: 'https://covers.openlibrary.org/b/isbn/9781984832003-M.jpg' },
    { title: 'Walden', author: 'Henry David Thoreau', category: 'Classic', isbn: '9780143037743', cover: 'https://covers.openlibrary.org/b/isbn/9780143037743-M.jpg' },
    { title: 'The Girl on the Train', author: 'Paula Hawkins', category: 'Thriller', isbn: '9780804172448', cover: 'https://covers.openlibrary.org/b/isbn/9780804172448-M.jpg' }
  ];
  for (let i = 0; i < realBooks.length; i++) {
    const b = realBooks[i];
    const publicationDate = `20${(10 + (i % 15)).toString().padStart(2, '0')}-01-01`;
    const copies = 3 + (i % 3);
    const publisherId = publisherIds[i % publisherIds.length];
    await run(
      `INSERT INTO books (isbn, title, author, category, publicationDate, copiesAvailable, totalCopies, publisherId, description, cover)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.isbn, b.title, b.author, b.category, publicationDate, copies, copies, publisherId, `${b.title} description`, b.cover]
    );
    // ensure author exists in authors table
    let authorRow = await get(`SELECT id FROM authors WHERE name = ?`, [b.author]);
    if (!authorRow) {
      const res = await run(`INSERT INTO authors (name, bio) VALUES (?, ?)`, [b.author, `${b.author} bio`]);
      authorRow = { id: res.id };
    }
    await run(`INSERT INTO wrote (isbn, authorId) VALUES (?, ?)`, [b.isbn, authorRow.id]);
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
    const cleanIsbn = (row.isbn || '').replace(/[-\s]/g, '');
    const cover = cleanIsbn ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(cleanIsbn)}-M.jpg` : null;
    if (cover) {
      await run('UPDATE books SET cover = ? WHERE isbn = ?', [cover, row.isbn]);
    }
  }
}

module.exports = { db, run, get, all, init, seed };
