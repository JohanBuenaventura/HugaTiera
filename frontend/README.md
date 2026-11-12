# HugaTiera — Frontend Application (`frontend/`)

The React 19 + Vite 8 single-page application for **HugaTiera**, providing public service discovery, role-specific Client, Gardener, and Administrator dashboards, Case 1 & Case 2 service request wizards, offer comparison, versioned mutual agreement workspaces, booking tracking, messaging, and AI garden planning tools.

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
│   │   ├── hero.png
│   │   ├── react.svg
│   │   └── vite.svg
│   ├── components/
│   │   └── ProtectedRoute.jsx
│   ├── context/
│   │   ├── AuthContext.jsx
│   │   └── auth-context.js
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
│   │   ├── communication.js
│   │   ├── inquiries.js
│   │   ├── profiles.js
│   │   ├── requestImages.js
│   │   └── services.js
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
