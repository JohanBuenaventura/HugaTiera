# HugaTiera — Teammate & AI Agent Guide for Gen AI Setup (Gemini + Cloudflare Workers AI)

This guide explains how to configure HugaTiera's two free-tier AI integrations on a teammate's local machine:

1. **Google Gemini API** — powers the AI Garden Planning Assistant (streaming chat), Requirements Assistant + Smart Add-On Suggestions, Uploaded Photo Analysis, and the strict gardening-only prompt guardrail.
2. **Cloudflare Workers AI (`@cf/black-forest-labs/flux-2-klein-4b`)** — powers optional **Visual Garden Preview** (instruction-based photo editing on uploaded garden photos) on Cloudflare's free tier (`10,000 Neurons/day`).

> **Security Rule (Never Violate):** Never commit `backend/.env` or paste real `GEMINI_API_KEY`, `CF_ACCOUNT_ID`, or `CF_API_TOKEN` values into Git, Pull Requests, screenshots, or `.md` files. If sharing a demo key with teammates, send it privately (Messenger/Discord) or have each teammate generate their own free key below (recommended so each person gets their own free quota).

---

## 1. Quick Copy-Paste Prompt for Your AI Coding Agent

If you are using an AI coding agent (**Antigravity, Cursor, GitHub Copilot Agent Mode, Codex, Claude Code**), paste this prompt so your agent walks you through setup without editing application code:

```text
Read ONLY docs/ai-setup-guide.md and backend/.env.example (do NOT edit application source code). Help me set up Gemini and Cloudflare Workers AI locally:
1. Check whether Migration 014 (ai_usage_log.feature ENUM including 'image_generation') is already applied to hugatiera_db (and hugatiera_db_migration_test if it exists). If missing, ask my approval before backing up and running database/migrations/014_ai_image_generation_log.sql.
2. Check which AI keys are missing or blank in my local backend/.env (without printing or logging my existing secrets).
3. Guide me step-by-step on where to get my free Google Gemini API key and Cloudflare Account ID + Workers AI API Token (or tell me exactly which lines to fill in if my teammate shared demo keys with me).
4. Once I confirm backend/.env is filled in, restart the backend server, verify GET http://localhost:5000/api/health, and run backend/tests/aiImagePreview.test.js and backend/tests/r6.aiAssistance.test.js against hugatiera_db_migration_test.
```

---

## 2. Database Prerequisite (Migration `014`)

Before testing AI photo editing, your local MySQL database must have **`database/migrations/014_ai_image_generation_log.sql`** applied (adds `'image_generation'` to `ai_usage_log.feature`).

### Check if Migration `014` is already applied
```powershell
c:\xampp\mysql\bin\mysql.exe -u root -e "SHOW COLUMNS FROM hugatiera_db.ai_usage_log LIKE 'feature';"
```
- If the `Type` column shows `'image_generation'`, Migration `014` is already applied — skip to Section 3.
- If `'image_generation'` is missing, back up `hugatiera_db` first, then apply it:
  ```powershell
  $stamp = Get-Date -Format 'yyyyMMdd_HHmm'
  c:\xampp\mysql\bin\mysqldump.exe -u root --routines --triggers hugatiera_db > "database/backups/hugatiera_db_pre_migration014_$stamp.sql"
  c:\xampp\mysql\bin\mysql.exe -u root hugatiera_db -e "SOURCE database/migrations/014_ai_image_generation_log.sql;"
  ```
- If you also run automated backend tests, apply Migration `014` to `hugatiera_db_migration_test` as well.

---

## 3. Getting Your Free API Keys (~2 Minutes, No Credit Card)

### Part A — Google Gemini API Key (Required for AI Chat, Photo Analysis & Prompt Guardrail)
1. Go to [Google AI Studio — API Keys](https://aistudio.google.com/apikey) and sign in with a Google account.
2. Click **Create API key** (select or create a free Google Cloud project if prompted).
3. Copy the generated key (`AIza...`) — this goes into `GEMINI_API_KEY` in `backend/.env`.
4. **Do NOT enable paid billing** unless explicitly approved by your team/adviser. The free tier works with `GEMINI_MODEL=gemini-3.5-flash-lite` and `GEMINI_FALLBACK_MODEL=gemini-3.8-flash`.

### Part B — Cloudflare Account ID & Workers AI API Token (Optional — Required Only for Photo Concept Previews)
1. Create or sign in to a free account at [Cloudflare Dashboard](https://dash.cloudflare.com/) (free tier includes **10,000 Neurons/day**, no credit card required).
2. **Get your `CF_ACCOUNT_ID`:**
   - In the left sidebar, open **Compute & AI → Workers & Pages** (or **AI → Workers AI**).
   - Look at the right-hand panel (or the dashboard URL `https://dash.cloudflare.com/<ACCOUNT_ID>/...`) and copy the 32-character **Account ID**.
3. **Create your `CF_API_TOKEN`:**
   - Click your profile icon (top right) → **Profile** → **API Tokens** → **Create Token**.
   - Either choose the **Workers AI** template, OR click **Create Custom Token** and grant:
     - **Account** → **Workers AI** → **Read**
     - **Account** → **Workers AI** → **Edit**
   - Under **Account Resources**, select **Include → Your Account**.
   - Click **Continue to summary → Create Token** and copy the token immediately (Cloudflare only shows it once).

> **Note:** If you do **not** need photo concept previews while working on another feature, leave `AI_IMAGE_GEN_ENABLED=false` and leave `CF_ACCOUNT_ID` / `CF_API_TOKEN` blank. The rest of HugaTiera (and Gemini text/photo analysis) continues working normally.

---

## 4. Configuring `backend/.env`

Open `backend/.env` (copy from `backend/.env.example` if it does not exist yet) and set these lines:

```env
# --- Google Gemini API (Text Chat, Requirements, Photo Analysis, Prompt Guardrail) ---
GEMINI_API_KEY=paste-your-google-ai-studio-key-here
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_FALLBACK_MODEL=gemini-3.8-flash
GEMINI_THINKING_LEVEL=low
AI_HOURLY_LIMIT=10

# --- Cloudflare Workers AI (Optional Visual Garden Preview Photo Editing) ---
# Set to false to disable photo generation completely.
AI_IMAGE_GEN_ENABLED=true
CF_ACCOUNT_ID=paste-your-32-char-cloudflare-account-id-here
CF_API_TOKEN=paste-your-cloudflare-workers-ai-token-here
CF_IMAGE_TO_IMAGE_MODEL=@cf/black-forest-labs/flux-2-klein-4b
AI_IMAGE_DAILY_LIMIT=3
```

**Important:** Restart your backend server (`npm --prefix backend run dev`) after editing `backend/.env` — Node.js reads `.env` only on startup.

---

## 5. How to Verify Everything Works

1. **Backend health check:** Open `http://localhost:5000/api/health` → expect `{"status":"ok","database":"connected"}`.
2. **Test Gemini AI Chat & Guardrail (in browser):**
   - Sign in as a Client or Gardener → open **AI Assistant** (`/assistant`).
   - Ask a gardening question (e.g., *"What low-maintenance shade plants grow well in Zamboanga City?"*) → text should stream smoothly in ~1–2 seconds.
   - Ask an off-topic question (e.g., *"Write me a Python script for a binary search tree"*) → the assistant should politely decline and redirect to gardening topics.
3. **Test Cloudflare Visual Garden Preview (if `AI_IMAGE_GEN_ENABLED=true`):**
   - On **AI Assistant**, switch to the **Visual Garden Preview** tab (or upload a photo on **Post General Request** `/inquiries/new` and click **Preview changes with AI**).
   - Upload a real garden/yard photo (JPEG/PNG/WebP), enter a landscaping edit (e.g., *"Clear the weeds, add trimmed Bermuda grass and colorful bougainvillea along the fence"*), and generate.
   - Expect a Before/After concept preview in ~5–8 seconds, tagged `AI Concept Preview` (advisory only — original photo is preserved separately in `backend/uploads/request-images/originals/` and generated preview in `generated/`).
4. **Run automated AI backend tests (zero live API credits used — mocked in tests):**
   ```powershell
   Remove-Item Env:DB_NAME -ErrorAction SilentlyContinue
   node --test backend/tests/r6.aiAssistance.test.js

   $env:DB_NAME='hugatiera_db_migration_test'
   node --test backend/tests/aiImagePreview.test.js
   ```

---

## 6. Troubleshooting Common Issues

| Symptom / Error | Cause | Fix |
|---|---|---|
| `501 IMAGE_GENERATION_POSTPONED` | `AI_IMAGE_GEN_ENABLED` is `false` (or server wasn't restarted after changing `.env`). | Set `AI_IMAGE_GEN_ENABLED=true` in `backend/.env` and restart the backend server. |
| `503` — *"Cloudflare Workers AI credentials are not configured"* | `CF_ACCOUNT_ID` or `CF_API_TOKEN` is blank in `backend/.env`. | Paste both values from Section 3 Part B and restart the backend. |
| Cloudflare `401` / `403` authentication error | API Token is missing **Account → Workers AI → Read/Edit** permission, or wrong `CF_ACCOUNT_ID`. | Re-check your Account ID and recreate the token with **Workers AI** Read & Edit permissions. |
| `400 OFF_TOPIC_EDIT` when generating a photo | Prompt was not related to gardening/landscaping (blocked by Gemini guardrail). | Use a gardening/landscaping edit instruction (plants, grass, pathways, cleanup, borders). |
| `Data truncated for column 'feature'` (`500`) | Migration `014` was not applied to `hugatiera_db`. | Follow Section 2 to back up and apply `database/migrations/014_ai_image_generation_log.sql`. |
| `429` daily or hourly AI limit reached | Local test user hit `AI_HOURLY_LIMIT` (`10`/hr) or `AI_IMAGE_DAILY_LIMIT` (`3`/24h). | Wait for the window or temporarily raise the limit in your local `backend/.env` during testing (keep production defaults conservative). |
| Gemini `429` / slow response | Primary Gemini model hit free-tier RPM or is busy. | HugaTiera automatically falls back from `GEMINI_MODEL` to `GEMINI_FALLBACK_MODEL`. Ensure `GEMINI_MODEL=gemini-3.5-flash-lite` and `GEMINI_FALLBACK_MODEL=gemini-3.8-flash`. |
