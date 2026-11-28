# HugaTiera — Frontend Application (`frontend/`)

The React 19 + Vite 8 single-page application for **HugaTiera**, providing public service discovery, a 2-card 3-step registration wizard, role-specific Client, Gardener (with built-in Client mode switcher, Schedule Calendar, and **My Clerks** panel), Assigned Clerk (`ClerkDashboard`), and Administrator dashboards, Smart AI recommendations with live category dropdown filtering, a simplified **2-step Case 1 & Case 2 service request flow** with 1-tap yard size presets & auto-priced smart material bundles, a single-view **Gardener Quick Response** quote card with 1-click estimate auto-fill, versioned mutual agreements with 1-tap deposit presets (`0%` / `30%` / `50%` / `100%`), a 2-column sticky booking & payment workspace (PayMongo / Sandbox / manual proof), redesigned messaging & notifications, and the AI Garden Planning Assistant (streaming chat + Cloudflare Visual Garden Preview photo editing).

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
│   │   ├── ErrorBoundary.jsx
│   │   ├── GardenerClerksPanel.jsx
│   │   ├── GardenerScheduleCalendar.jsx
│   │   ├── Modal.jsx
│   │   ├── ProtectedRoute.jsx
│   │   ├── StarRating.jsx
│   │   ├── StructuredAddressFields.jsx
│   │   └── TransientSuccess.jsx
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
│   │   ├── currency.js
│   │   └── zamboangaAddress.js
│   ├── App.css
│   ├── App.jsx
│   ├── ClientGardener.css
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
