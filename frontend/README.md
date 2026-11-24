# HugaTiera — Frontend Application (`frontend/`)

The React 19 + Vite 8 single-page application for **HugaTiera** (`main`), providing public service discovery, a 2-card 3-step registration wizard, role-specific Client, Gardener (with built-in Client mode switcher, Schedule Calendar, and **My Clerks** panel), Assigned Clerk (`ClerkDashboard`), and Administrator dashboards, Smart AI recommendations with live category dropdown filtering, Case 1 & Case 2 service request wizards with dynamic category specs and itemized price estimation, offer comparison, versioned mutual agreement workspaces, reservation/deposit/PayMongo/Sandbox booking tracking, messaging, notifications, and AI garden planning tools.

---

## 1. Technology Stack

- **React (`^19.3.1`) & React DOM (`^19.3.1`)**
- **Vite (`^8.3.6`)**
- **React Router DOM (`^7.18.5`)**
- **Axios (`^1.21.0`)** with `withCredentials: true` for `HttpOnly` cookie sessions
- **Lucide React (`^1.69.0`)** for icons
- **ESLint (`^10.14.0`)**

---

## 2. Environment Configuration (`frontend/.env`)

Copy [frontend/.env.example](file:///c:/xampp/htdocs/HugaTiera/frontend/.env.example) to `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

> **Important:** Never place backend secrets (`GEMINI_API_KEY`, `JWT_SECRET`, or database credentials) in `frontend/.env`.

---

## 3. Available npm Scripts

| Command | Description |
|---|---|
| `npm install` | Install frontend dependencies |
| `npm run dev` | Start Vite development server (`http://localhost:5173`) |
| `npm run build` | Build production bundle into `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint across `src/` |

---

## 4. Directory Structure

```text
frontend/
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── AiAssistantWidget.jsx
│   │   ├── AppSidebar.jsx
│   │   ├── ClerkDashboard.jsx
│   │   ├── GardenerClerksPanel.jsx
│   │   ├── GardenerScheduleCalendar.jsx
│   │   ├── ProtectedRoute.jsx
│   │   └── StructuredAddressFields.jsx
│   ├── context/
│   │   ├── AuthContext.jsx
│   │   └── auth-context.js
│   ├── hooks/
│   │   └── useAuth.js
│   ├── pages/
│   │   ├── AssistantPage.jsx
│   │   ├── AuthPage.jsx
│   │   ├── BookingPage.jsx
│   │   ├── CommunicationPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── GardenerPage.jsx
│   │   ├── InquiryPage.jsx
│   │   ├── ServiceDetailPage.jsx
│   │   └── ServicesPage.jsx
│   ├── services/
│   │   ├── agreements.js
│   │   ├── ai.js
│   │   ├── api.js
│   │   ├── auth.js
│   │   ├── bookings.js
│   │   ├── categorySpecs.js
│   │   ├── clerk.js
│   │   ├── communication.js
│   │   ├── inquiries.js
│   │   ├── profiles.js
│   │   ├── requestImages.js
│   │   ├── reviews.js
│   │   └── services.js
│   ├── utils/
│   │   └── zamboangaAddress.js
│   ├── App.css
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── .env.example
├── eslint.config.js
├── index.html
├── package.json
├── package-lock.json
├── README.md
└── vite.config.js
```
