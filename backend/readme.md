# HugaTiera – Backend

The backend of **HugaTiera**, a Gardening Service Platform, built using Node.js, Express, and MySQL.

The backend handles API requests, authentication, business logic, and database operations.

## Tech Stack

- Node.js – JavaScript runtime
- Express.js – Backend framework
- MySQL – Relational database
- MySQL2 – MySQL database driver
- CORS – Cross-origin resource sharing
- dotenv – Environment variable management
- Nodemon – Automatic server restarting during development

## Prerequisites

Before installing the project, make sure you have:

1. Node.js (LTS version recommended)
2. npm (included with Node.js)
3. Git
4. XAMPP (for local MySQL database)
5. Visual Studio Code (recommended)

Verify your installation:

```bash
node -v
npm -v
git --version
```

## Installation Guide

### 1. Clone the Repository

```bash
git clone <repository-url>
```

Navigate to the backend directory:

```bash
cd HugaTiera/backend
```

### 2. Install Dependencies

Run:

```bash
npm install
```

This installs the packages defined in package.json.

If you are setting up the project from scratch and the dependencies have not yet been installed, use:

```bash
npm install express mysql2 cors dotenv
npm install -D nodemon
```

### 3. Configure Environment Variables

Create a `.env` file inside the backend directory.

Example:

```env
PORT=5000

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=hugati era_db
DB_PORT=3306
```

Replace the database name with the actual database name used by the team.

**Important:** Do not commit `.env` to GitHub. Use `.env.example` to share the required variable names without exposing credentials.

### 4. Set Up MySQL Using XAMPP

1. Open XAMPP Control Panel.
2. Start Apache (if using phpMyAdmin).
3. Start MySQL.
4. Open your browser.
5. Navigate to:

```text
http://localhost/phpmyadmin
```

6. Create the project database using the agreed database name.
7. Import the database SQL file if one is provided by the team.

Note: The backend connects directly to MySQL using the MySQL2 package. PHP is not required for the Node.js API.

### 5. Run the Backend Server

Start the development server:

```bash
npm run dev
```

For normal execution:

```bash
npm start
```

The backend will eventually be accessible at:

```text
http://localhost:5000
```

API endpoints will use:

```text
http://localhost:5000/api
```

Note: These commands require the backend server.js entry point to be implemented.

## Available Commands

| Command | Description |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start development server with Nodemon |
| `npm start` | Start server normally |

## Project Structure

```text
backend/
├── config/
│   └── database.js
├── controllers/
├── middleware/
├── models/
├── routes/
├── services/
├── utils/
├── uploads/
├── app.js
├── server.js
├── .env
├── .env.example
├── .gitignore
├── package.json
└── package-lock.json
```

Note: These folders and files represent the planned architecture and will be added during development.

## Important Reminders

- Always run `npm install` after pulling new dependency changes.
- Do not upload `node_modules` to GitHub.
- Never commit `.env`.
- Do not hardcode database credentials.
- Keep database queries and business logic organized.
- Validate incoming API requests.
- Use the existing API routes and naming conventions.
- Coordinate with the frontend team before changing API response formats.

## Troubleshooting

**Problem: Database connection failed**

Check:
- MySQL is running in XAMPP.
- Database name is correct.
- Username and password are correct.
- MySQL port is correct.

**Problem: Cannot find module**

Run:

```bash
npm install
```

**Problem: npm run dev cannot find server.js**

The backend entry point has not yet been created. Make sure the backend setup files are available before starting the server.

---

HugaTiera – Gardening Service Platform  
Backend Development Team