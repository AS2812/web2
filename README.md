# Library Management Web App (Plain JS + SQLite)

Two-role (Member, Librarian) library system that matches the PDF UX: left sidebar navs, auth overlays, dashboards, charts, catalogs, reservations, fines, and CRUD flows. All code is plain JavaScript + HTML/CSS (no TypeScript, no build tools).

## Quickstart
1. Install deps: `npm install`
2. Run: `npm start`
3. Open: `http://localhost:3000`

## Seeded Credentials
- Librarian: `admin` / `admin123`
- Members: `mohannad`/`password1`, `noureen`/`password2`, `raneem`/`password3`, `habiba`/`password4`, `maryam`/`password5`, `ethar`/`password6`, `forat`/`password7`

## Flows
- **Auth**: Sign up (member), Sign in (member/librarian by email), JWT stored locally. `/auth/logout` is stateless (drop token).
- **Member**:
  - Home dashboard with counts + recommendations and a mini chart.
  - Catalog grouped by category; book modal with Borrow/Reserve.
  - Borrowed: return books.
  - Reserved: cancel; Borrow Now when status Ready/Fulfilled.
  - Fines & Payments: list fines, pay first pending or specific fine.
- **Librarian**:
  - Dashboard KPIs + charts (bar: borrowing trends, pie: categories).
  - Quick actions: add book, register member, issue book (select member+book), return book.
  - Manage Books: list/search, delete; (edit could be added via API PUT).
  - Manage Members: list members.
  - Reservations: approve (Ready), Fulfill (creates loan), Cancel.
  - Fines Management: pay, reduce/waive, status updates; calculator.

## API (JSON, same-origin)
- Auth: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- Books: `GET /books`, `GET /books/:isbn`, `POST /books` (Admin), `PUT /books/:isbn` (Admin), `DELETE /books/:isbn` (Admin)
- Members: `GET /members`, `GET /members/:id`, `POST /members`, `PUT /members/:id`, `DELETE /members/:id` (Admin)
- Loans: `GET /loans` (Admin), `GET /loans/me` (Member), `POST /loans/borrow` (Member or Admin with memberId), `POST /loans/return` (Member/Admin), `PATCH /loans/:id/extend` (Admin)
- Reservations: `GET /reservations` (Admin), `GET /reservations/me` (Member), `POST /reservations` (Member), `PATCH /reservations/:id/cancel` (Member), `PATCH /reservations/:id/status` (Admin Ready/Fulfilled/Cancelled)
- Fines: `GET /fines` (Admin), `GET /fines/me` (Member), `PATCH /fines/:id/pay`, `PATCH /fines/:id/status` (Admin Pending/Paid/Waived), `PUT /fines/:id/reduce` (Admin)
- Stats: `GET /stats/admin` (KPIs + bar/pie data), `GET /stats/member` (member counts + category dataset)

Auth header: `Authorization: Bearer <token>`

## Data Model (SQLite)
- Tables: `users`, `members`, `admin_users`, `authors`, `publishers`, `books`, `wrote`, `loans`, `reservations`, `fines`
- Seed: admin + 7 members, 12 authors, 5 publishers, 40 books with `picsum.photos` covers, sample loan/reservation/fine.

## Assumptions
- Loan duration: 14 days
- Fine: $1/day late (created on return if overdue)
- One active reservation per member/book (Pending/Ready); fulfilling decreases stock and creates a loan.
- Copy counts adjust on borrow/return/fulfill.
