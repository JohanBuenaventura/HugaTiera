# 🌱 HugaTiera

### A Platform for Gardening Services with Generative AI Integration

HugaTiera is a web-based gardening services marketplace designed to connect clients with freelance gardeners and landscaping service providers.

The platform provides a centralized space where clients can discover gardening services, explore provider portfolios, submit service inquiries, communicate with gardeners, receive indicative quotations, and arrange service bookings.

HugaTiera also aims to integrate a Generative AI Garden Planning Assistant to help users explore gardening ideas, plant recommendations, and possible improvements for their outdoor spaces.

---

## 📌 Project Information

| Information | Details |
|---|---|
| Project Name | HugaTiera |
| Project Title | A Platform for Gardening Services with Generative AI Integration |
| Project Type | Web-Based Marketplace Platform |
| Project Category | Academic Software Engineering Project |
| Initial Target Location | Zamboanga City, Philippines |
| Development Status | In Development |

---

## 🎯 Project Objectives

- Connect clients with freelance gardeners and landscaping service providers.
- Provide gardeners with a platform to showcase their services, skills, and portfolios.
- Help clients discover and compare available gardening services.
- Support service inquiries and communication between clients and gardeners.
- Provide a booking and scheduling process after both parties agree.
- Integrate Generative AI to assist users with basic garden planning ideas and recommendations.

---

## ✨ Key Features

### 👤 Client

- Account registration and login.
- Profile management.
- Browse gardening services.
- Search and filter gardeners.
- View gardener profiles and portfolios.
- Submit service inquiries.
- Receive gardener responses and indicative quotations.
- Communicate with gardening service providers.
- Request and manage bookings.
- View booking history and statuses.
- Submit ratings and reviews after completed services.
- Access the AI Garden Planning Assistant.

### 🌿 Gardener

- Gardener registration and login.
- Profile management.
- Create and manage gardening service listings.
- Select gardening service categories.
- Upload portfolio images.
- Showcase skills and experience.
- Receive and manage client inquiries.
- Respond to inquiries with service information and indicative quotations.
- Communicate with clients.
- Accept or decline booking requests.
- Manage service schedules and booking statuses.
- View ratings and reviews.

### 🛠️ Administrator

- Administrative dashboard.
- Manage client and gardener accounts.
- Manage gardening service categories.
- Monitor platform activities.
- Review reported users or content.
- Monitor inquiries and bookings.
- View basic platform statistics and reports.

### 🤖 AI Garden Planning Assistant

The planned AI assistant will help users explore gardening concepts and recommendations.

Expected capabilities:

- Suggest suitable plants based on user-provided conditions.
- Provide basic garden layout ideas.
- Recommend possible garden styles.
- Suggest improvements for small gardens and terraces.
- Provide general gardening and maintenance tips.

**AI Integration Strategy:**

- Prioritize text-based AI assistance.
- Investigate APIs with available free-tier access.
- Protect API credentials using backend environment variables.
- Apply usage limits to control API consumption.
- Avoid automatic switching to paid models.
- Keep image generation optional and subject to technical feasibility and budget.

AI-generated suggestions are conceptual and should be reviewed before actual implementation.

---

## 🔄 Main Platform Workflow

```text
                  CLIENT
                    |
                    v
          Browse Gardening Services
                    |
                    v
       View Gardener Profile and Portfolio
                    |
                    v
             Submit Inquiry
                    |
                    v
             GARDENER
                    |
                    v
       Respond with Service Information
          and Indicative Quotation
                    |
                    v
             CLIENT REVIEWS
                    |
                    v
            Proceed to Booking?
               /       \
             No         Yes
             |           |
             v           v
        End Inquiry   Submit Booking
                         |
                         v
                  Gardener Accepts
                    or Declines
                         |
                         v
                  Service Completion
                         |
                         v
                   Client Review
```

---

## 🧰 Technology Stack

HugaTiera uses a JavaScript-based full-stack architecture with MySQL as its relational database.

| Component | Technology | Purpose |
|---|---|---|
| Frontend | React.js | User interface and interactive components |
| Backend | Node.js | Server-side runtime |
| Backend Framework | Express.js | REST API and application logic |
| Database | MySQL | Relational data storage |
| Styling | CSS / Bootstrap / Tailwind CSS | Responsive user interface |
| Development Server | Vite | Frontend development and build tooling |
| API Testing | Postman | API testing and debugging |
| Version Control | Git | Source code management |
| Repository Hosting | GitHub | Project collaboration and version control |
| AI Integration | Generative AI API | Garden planning assistance |

**Architecture:** React + Express.js + Node.js + MySQL.

*Note: This is a customized MERN-style architecture using MySQL instead of MongoDB. The project's selected database is MySQL.*

---

## 🏗️ System Architecture

```text
+----------------------------------+
|          React Frontend          |
|                                  |
| Client | Gardener | Administrator|
+----------------+-----------------+
                 |
                 | HTTP / REST API
                 v
+----------------------------------+
|        Express.js Backend        |
|                                  |
| Authentication and Authorization|
| User and Profile Management      |
| Services and Portfolios          |
| Inquiries and Quotations         |
| Messaging and Bookings           |
| Reviews and Notifications        |
| AI Integration                   |
+----------------+-----------------+
                 |
          +------+------+
          |             |
          v             v
+----------------+  +----------------+
|   MySQL DB     |  | External AI API|
|                |  |                |
| Application    |  | Garden Planning|
| Data           |  | Assistance     |
+----------------+  +----------------+
```

---

## 📂 Proposed Project Structure

```text
HugaTiera/
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── pages/
│   │   │   ├── client/
│   │   │   ├── gardener/
│   │   │   └── admin/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── context/
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
│
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── uploads/
│   ├── app.js
│   ├── server.js
│   ├── .env.example
│   └── package.json
│
├── database/
│   └── hugatiera.sql
│
├── .gitignore
└── README.md
```

*The folder structure is a proposed organization and may evolve during development.*

---

## ⚙️ Installation and Setup

### Prerequisites

Install the following development tools:

- [Node.js](https://nodejs.org/)
- [Visual Studio Code](https://code.visualstudio.com/)
- [Git](https://git-scm.com/)
- [MySQL Community Server](https://dev.mysql.com/downloads/mysql/)

Optional database management tools:

- [MySQL Workbench](https://dev.mysql.com/downloads/workbench/)
- phpMyAdmin

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR-USERNAME/HugaTiera.git
```

Navigate to the project:

```bash
cd HugaTiera
```

### 2. Set Up the MySQL Database

1. Start your MySQL server.
2. Open MySQL Workbench or phpMyAdmin.
3. Create the project database.
4. Import the provided SQL file when available.

Example:

```sql
CREATE DATABASE hugatiera_db;
```

The database name and schema should match the backend configuration.

### 3. Configure the Backend

Navigate to the backend folder:

```bash
cd backend
```

Install dependencies:

```bash
npm install
```

Create a `.env` file based on `.env.example`.

Example configuration:

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=hugatiera_db

JWT_SECRET=your_secure_secret

GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash-lite
```

Do not upload your actual `.env` file or API keys to GitHub.

Start the backend using the available development script:

```bash
npm run dev
```

*The exact command depends on the final backend package configuration.*

### 4. Configure the Frontend

Open another terminal and navigate to the frontend folder:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the React development server:

```bash
npm run dev
```

### 5. Access the Application

Open the local development address displayed by Vite in your terminal.

The backend API will run on the configured Node.js server port.

---

## 🔐 Security Considerations

The project aims to follow basic web application security practices:

- Secure password hashing.
- Parameterized MySQL queries.
- Server-side input validation.
- Authentication and role-based authorization.
- Secure session or token management.
- Protected API routes.
- File upload validation.
- Environment variables for sensitive credentials.
- API request limits.
- Proper error handling.
- Protection against unauthorized data access.

---

## 💳 Project Scope and Limitations

The initial version focuses on connecting clients with gardening service providers.

The following are outside the initial project scope:

- Direct in-app payment processing.
- Digital wallets and escrow services.
- Refunds and payment settlements.
- E-commerce for physical gardening supplies.
- Live GPS tracking.
- Automated gardener dispatch.
- Payroll and employee management.
- Professional CAD or 3D garden modeling.
- Native Android and iOS applications.
- Nationwide deployment.
- Unrelated home services.

Payment arrangements, such as cash or GCash, will be handled directly between clients and gardeners outside the platform.

---

## 🚀 Development Roadmap

The project follows the 16-phase roadmap in
[`prompt/phase.md`](prompt/phase.md) and the detailed requirements in
[`prompt/prompts.md`](prompt/prompts.md).

- [x] Phases 1–14: requirements through administrator functions
- [ ] Phase 15: system integration and testing (in progress)
- [ ] Phase 16: deployment and documentation

Current confirmed status and remaining work are tracked in
[`project_progress.md`](project_progress.md).

---

## 👥 Target Users

| User | Description |
|---|---|
| Clients | Homeowners and property managers looking for gardening services. |
| Gardeners | Freelance gardeners and landscaping service providers. |
| Administrators | Users responsible for managing and monitoring the platform. |

---

## 📍 Project Scope

The initial implementation focuses on Zamboanga City, Philippines.

HugaTiera will be developed as a responsive web application accessible through desktop and mobile browsers.

Its primary purpose is to establish a centralized marketplace for discovering gardening services and connecting clients with independent gardening service providers.

---

## 📄 License

This project is developed for academic purposes. Licensing and permissions for reuse or redistribution will be determined by the project team.

---

<p align="center">
  🌱 <strong>HugaTiera</strong>
  <br>
  Connecting People, Gardeners, and Greener Spaces.
</p>