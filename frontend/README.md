# HugaTiera – Frontend

The frontend of **HugaTiera**, a Gardening Service Platform, built using React and Vite.

## Tech Stack

- React – UI development
- Vite – Development server and build tool
- JavaScript – Programming language
- ESLint – Code linting
- Axios – API communication
- React Router DOM – Client-side navigation
- Lucide React – Icon library

## Prerequisites

Before installing the project, make sure you have:

1. Node.js (LTS version recommended)
2. npm (included with Node.js)
3. Git
4. Visual Studio Code (recommended)

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

Navigate to the frontend directory:

```bash
cd HugaTiera/frontend
```

### 2. Install Dependencies

Install the project dependencies:

```bash
npm install
```

### 3. Install Additional Packages

If the dependencies are not already included in package.json, install:

```bash
npm install axios react-router-dom lucide-react
```

### 4. Configure Environment Variables

Create a `.env` file in the frontend directory.

Example:

```env
VITE_API_URL=http://localhost:5000/api
```

This will be used when connecting the frontend to the backend API.

**Important:** Only expose public configuration values in frontend environment variables. Never put database passwords, API secrets, or private credentials here.

### 5. Run the Development Server

```bash
npm run dev
```

Open the URL provided by Vite, usually:

```text
http://localhost:5173
```

## Available Commands

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build production files |
| `npm run preview` | Preview production build |
| `npm run lint` | Check code using ESLint |

## Project Structure

```text
frontend/
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   ├── pages/
│   ├── layouts/
│   ├── services/
│   ├── hooks/
│   ├── context/
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── .env
├── .env.example
├── .gitignore
├── eslint.config.js
├── index.html
├── package.json
└── vite.config.js
```

Note: Additional folders will be created as development progresses.

## Important Reminders

- Always run `npm install` after pulling new changes that modify package.json or package-lock.json.
- Do not upload the `node_modules` folder to GitHub.
- Do not commit your `.env` file.
- Follow the existing component and folder structure.
- Run `npm run lint` before committing your changes.
- Coordinate with the backend team when modifying API endpoints.

## Troubleshooting

**Problem: npm install fails**

Try:

```bash
npm cache verify
npm install
```

**Problem: Port 5173 is already in use**

Vite may automatically use another available port. Check the terminal for the correct URL.

**Problem: Backend connection failed**

Check that:
- The backend server is running.
- The API URL in `.env` is correct.
- The backend CORS configuration allows the frontend origin.

---

HugaTiera – Gardening Service Platform  
Frontend Development Team