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
DB_NAME=hugatiera_db
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

The health endpoint is available at:

```text
http://localhost:5000/api/health
```

The health endpoint verifies that the backend can reach MySQL.

Authentication endpoints:

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

Authentication uses an HttpOnly JWT cookie. Public registration accepts only
client and gardener roles; administrator accounts must be created through a
protected administrative process.

Profile and dashboard endpoints:

```text
GET  /api/profiles/me
PUT  /api/profiles/me
GET  /api/admin/summary
PATCH /api/admin/users/:userId/status
```

Profile and administrator endpoints require authentication. Administrator
summary and account-management endpoints additionally require the
`administrator` role.

Gardening service and portfolio endpoints:

```text
GET    /api/services
GET    /api/services/:serviceId
GET    /api/services/categories
GET    /api/services/mine
POST   /api/services
PUT    /api/services/:serviceId
DELETE /api/services/:serviceId
GET    /api/portfolios/:portfolioId/image
GET    /api/portfolios/me
POST   /api/portfolios
PUT    /api/portfolios/:portfolioId
DELETE /api/portfolios/:portfolioId
```

Service management and portfolio changes require an authenticated gardener
and are restricted to records owned by that gardener. Portfolio uploads accept
JPEG, PNG, and WebP images up to 5 MB.

Marketplace endpoints:

```text
GET /api/services
GET /api/services/categories
GET /api/services/:serviceId
GET /api/gardeners/:gardenerId
```

`GET /api/services` supports `keyword`, `categoryId`, `serviceArea`, `sort`,
`page`, and `limit` query parameters. Supported sort values are `newest`,
`price_low`, and `price_high`.

Inquiry and quotation endpoints:

```text
GET    /api/inquiries
GET    /api/inquiries/:inquiryId
POST   /api/inquiries
PATCH  /api/inquiries/:inquiryId/status
POST   /api/inquiries/:inquiryId/quotations
PATCH  /api/inquiries/quotations/:quotationId/status
```

Clients create inquiries and accept or decline quotations. Gardeners can view
their assigned inquiries and send indicative quotations. Creating or accepting
a quotation does not create a booking; booking requests remain a separate
workflow.

Messaging and notification endpoints:

```text
GET    /api/conversations
POST   /api/conversations
GET    /api/conversations/:conversationId/messages
POST   /api/conversations/:conversationId/messages
GET    /api/notifications
PATCH  /api/notifications/:notificationId/read
PATCH  /api/notifications/read-all
```

Conversation access is limited to the associated client and gardener.
Messages are stored in MySQL, incoming messages are marked read when their
conversation is opened, and unread notification counts are returned by the
notifications endpoint.

Booking and scheduling endpoints:

```text
GET    /api/bookings
POST   /api/bookings
GET    /api/bookings/:bookingId
PATCH  /api/bookings/:bookingId/status
```

Clients can create bookings only from accepted quotations. Gardeners can accept
or decline pending requests, start accepted services, and mark in-progress
services completed. Clients can cancel pending or accepted bookings. Accepted
schedule overlaps are rejected, and booking status changes create notifications.

Ratings and review endpoints:

```text
GET    /api/reviews/gardeners/:gardenerId
GET    /api/reviews/bookings/:bookingId
POST   /api/reviews
```

Only the client who owns a completed booking can submit its review, and each
booking can be reviewed once. Public gardener profiles display visible reviews.

AI Garden Planning Assistant:

```text
POST /api/ai/garden-plan
```

The endpoint requires authentication, accepts a gardening request up to 3,000
characters, and limits each authenticated user to 10 requests per hour. It
calls Gemini from the backend only. Configure `GEMINI_API_KEY` and optionally
`GEMINI_MODEL` in `.env`; the verified default is `gemini-3.5-flash-lite`.
Never place the key in frontend code. If the key is missing or the provider
quota is unavailable, the API reports an explicit configuration or provider
error instead of silently switching providers.

Administrator endpoints:

```text
GET    /api/admin/summary
PATCH  /api/admin/users/:userId/status
GET    /api/admin/categories
POST   /api/admin/categories
PATCH  /api/admin/categories/:categoryId
GET    /api/admin/services
PATCH  /api/admin/services/:serviceId/status
GET    /api/admin/activity
GET    /api/admin/reports
PATCH  /api/admin/reports/:reportId
```

All administrator endpoints require an authenticated `administrator` account.
They provide account management, category management, service moderation,
platform activity monitoring, and report review using MySQL data.

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

The remaining module folders will be added during their respective development phases.

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