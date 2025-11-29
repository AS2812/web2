# Library Management API

Node.js + TypeScript REST API for a Library Management System backed by SQL Server, Prisma, Express, JWT auth, and Zod validation. Includes Dockerized local setup, Swagger docs, and integration tests.

## Stack
- Node.js 20+, TypeScript, Express
- Prisma ORM (SQL Server)
- JWT + bcrypt for auth
- Zod for input validation
- Jest + Supertest for integration tests
- Swagger UI for docs

## Prerequisites
- Docker + Docker Compose
- Node.js 20+ and npm (for local runs)

## Configuration
1) Copy `.env.example` to `.env` and adjust values (DB URL, JWT secret, bcrypt rounds, admin seed credentials).
2) Ensure `SA_PASSWORD` meets SQL Server complexity rules.

## Run with Docker
```bash
docker compose up --build
```
- `db` service starts SQL Server.
- `db-init` applies `DB.sql` to a `LibraryDB` database automatically.
- `api` service runs the Express server on port 3000.

## Local Development (without Docker)
```bash
npm install
npm run prisma:generate
npm run dev
```
Ensure SQL Server is running and `DATABASE_URL` points to it.

## Seeding an Admin User
Create an admin using env credentials (defaults: admin/AdminPass123!):
```bash
npm run seed:admin
```

## Testing
Integration tests expect a clean database:
```bash
npm test
```

## API Surface (high level)
- Auth: `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- Books: `GET /books`, `GET /books/:isbn`, `POST /books` (Admin), `PATCH /books/:isbn` (Admin), `DELETE /books/:isbn` (Admin)
- Authors/Publishers: CRUD (read for members, write for Admin)
- Loans: `POST /loans/borrow` (Member), `POST /loans/return` (Member/Admin), `GET /loans/me` (Member)
- Reservations: `POST /reservations`, `PATCH /reservations/:id/cancel`, `GET /reservations/me` (Member)
- Fines: `GET /fines/me` (Member), `PATCH /fines/:id/pay` (Member/Admin)
- Admin: `GET /admin/dashboard` (Admin)
- Swagger UI: `GET /docs`

Responses follow `{ success, data, error }` shape.

## Notes
- Borrow sets a 14-day due date; overdue returns create fines at $1/day (configurable in code).
- Inventory updates are transactional to avoid negative stock.
- Validation uses Zod; rate limiting is applied to auth endpoints.

## Database Schema (from DB.sql)
```
-- 1. Table for Authors
CREATE TABLE AUTHOR (
    author_id INT PRIMARY KEY IDENTITY(1,1),
    name NVARCHAR(100) NOT NULL
);
GO

-- 2. Table for Publishers
CREATE TABLE PUBLISHER (
    publisher_id INT PRIMARY KEY IDENTITY(1,1),
    name NVARCHAR(100) NOT NULL,
    address NVARCHAR(255)
);
GO

-- 3. Table for Books (Catalog)
CREATE TABLE BOOK (
    ISBN NVARCHAR(20) PRIMARY KEY,
    title NVARCHAR(255) NOT NULL,
    edition NVARCHAR(50),
    category NVARCHAR(100),
    publication_date DATE,
    publisher_id INT,
    copies_available INT NOT NULL DEFAULT 1,
    total_copies INT NOT NULL DEFAULT 1,
    
    -- Foreign Key Constraint
    CONSTRAINT FK_BOOK_PUBLISHER FOREIGN KEY (publisher_id)
        REFERENCES PUBLISHER(publisher_id)
);
GO

-- 4. Junction Table for the Many-to-Many relationship between AUTHOR and BOOK ("WROTE")
CREATE TABLE WROTE (
    author_id INT,
    ISBN NVARCHAR(20),
    PRIMARY KEY (author_id, ISBN),
    
    CONSTRAINT FK_WROTE_AUTHOR FOREIGN KEY (author_id)
        REFERENCES AUTHOR(author_id),
    
    CONSTRAINT FK_WROTE_BOOK FOREIGN KEY (ISBN)
        REFERENCES BOOK(ISBN)
);
GO

-- 5. Table for General System Users (Member and Admin)
CREATE TABLE [USER] (
    user_id INT PRIMARY KEY IDENTITY(1,1),
    username NVARCHAR(50) UNIQUE NOT NULL,
    password_hash NVARCHAR(255) NOT NULL,
    email NVARCHAR(100) UNIQUE NOT NULL,
    user_role NVARCHAR(50) NOT NULL, 
    
    CONSTRAINT CHK_USER_ROLE CHECK (user_role IN ('Member', 'Admin'))
);
GO

-- 6. Table for Library Members (Specific Member details, linked to USER)
CREATE TABLE MEMBER (
    member_id INT PRIMARY KEY IDENTITY(1,1),
    user_id INT UNIQUE NOT NULL, 
    member_number NVARCHAR(50) UNIQUE,
    name NVARCHAR(100) NOT NULL,
    address NVARCHAR(255),
    membership_expiry_date DATE,
    
    CONSTRAINT FK_MEMBER_USER FOREIGN KEY (user_id)
        REFERENCES [USER](user_id)
);
GO

-- 7. Table for Admin Users (Librarians/Managers)
CREATE TABLE ADMIN_USER (
    admin_id INT PRIMARY KEY IDENTITY(1,1),
    user_id INT UNIQUE NOT NULL, -- Links to the USER table for login/auth
    
    CONSTRAINT FK_ADMIN_USER_USER FOREIGN KEY (user_id)
        REFERENCES [USER](user_id)
);
GO




-- 8. Table for Loan/Borrowing Transactions
CREATE TABLE LOAN (
    loan_id INT PRIMARY KEY IDENTITY(1,1),
    ISBN NVARCHAR(20) NOT NULL,
    member_id INT NOT NULL,
    borrow_date DATE NOT NULL,
    due_date DATE NOT NULL,
    return_date DATE,
    
    CONSTRAINT FK_LOAN_BOOK FOREIGN KEY (ISBN)
        REFERENCES BOOK(ISBN),
        
    CONSTRAINT FK_LOAN_MEMBER FOREIGN KEY (member_id)
        REFERENCES MEMBER(member_id)
);
GO

-- 9. Table for Fine Tracking
CREATE TABLE FINE (
    fine_id INT PRIMARY KEY IDENTITY(1,1),
    loan_id INT UNIQUE NOT NULL,
    member_id INT NOT NULL,
    fine_amount DECIMAL(10, 2) NOT NULL,
    fine_date DATE NOT NULL,
    payment_status NVARCHAR(50) DEFAULT 'Pending',
    
    CONSTRAINT FK_FINE_LOAN FOREIGN KEY (loan_id)
        REFERENCES LOAN(loan_id),
        
    CONSTRAINT FK_FINE_MEMBER FOREIGN KEY (member_id)
        REFERENCES MEMBER(member_id),
        
    CONSTRAINT CHK_FINE_STATUS CHECK (payment_status IN ('Pending', 'Paid', 'Waived'))
);
GO

-- 10. Table for Book Reservations
CREATE TABLE RESERVATION (
    reservation_id INT PRIMARY KEY IDENTITY(1,1),
    ISBN NVARCHAR(20) NOT NULL,
    member_id INT NOT NULL,
    reservation_date DATETIME NOT NULL, -- Using DATETIME for precision
    status NVARCHAR(50) DEFAULT 'Pending',
    
    CONSTRAINT FK_RESERVATION_BOOK FOREIGN KEY (ISBN)
        REFERENCES BOOK(ISBN),
        
    CONSTRAINT FK_RESERVATION_MEMBER FOREIGN KEY (member_id)
        REFERENCES MEMBER(member_id),
        
    -- Constraint to prevent a member from having multiple active reservations for the same book
    CONSTRAINT UC_Active_Reservation UNIQUE (ISBN, member_id),
    
    CONSTRAINT CHK_RESERVATION_STATUS CHECK (status IN ('Pending', 'Ready_for_Pickup', 'Fulfilled', 'Cancelled'))
);
GO
```
