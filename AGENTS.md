# AGENTS.md — HugaTiera

## 1. Purpose of This File

This file contains the working instructions for AI coding agents contributing to HugaTiera.

Use it together with the project's existing documentation. Do not treat this file as a replacement for the README, master prompt, development roadmap, phase prompts, or project progress tracker.

The goal is to help the agent understand the project, preserve approved decisions, make focused changes, and work only on the phase or task requested by the user.

## 2. Documentation and Source of Truth

Before planning or changing code, consult the relevant project documentation.

| File | How to use it |
|---|---|
| `README.md` | Project introduction, installation, configuration, and run instructions. |
| `folder_structure.md` | Current directory and file organization. Follow the actual existing structure. |
| `project_progress.md` | Current phase, completed work, pending work, known issues, and next tasks. |
| `prompt/masterprompt.md` | Main project vision, approved technology direction, roles, workflows, scope limits, and development rules. |
| `prompt/phase.md` | Intended development roadmap. Check it against the master prompt because the supplied version currently contains outdated information. |
| `prompt/prompts.md` | Detailed instructions for development Phases 1–16. Use the prompt for the specific phase the user requests. |
| `prompt/reusable_prompt.md` | Reusable guidance for continuing development and requesting implementation help. |

### Documentation precedence

If project documents disagree, do not silently combine incompatible instructions.

Use this precedence for project direction:

1. Explicit decisions and corrections made by the user in the current conversation.
2. The latest user-approved project decisions recorded in `project_progress.md`.
3. `prompt/masterprompt.md` for the approved project vision, stack, scope, and 16-phase sequence.
4. The relevant phase instructions in `prompt/prompts.md`.
5. `prompt/phase.md`, only after it has been reconciled with the master prompt.
6. `README.md` and `folder_structure.md` as descriptions of the current implementation, not permission to change the approved architecture.

If a conflict affects implementation, explain it and ask for clarification before making a consequential change.

### Known documentation inconsistency

The supplied `prompt/phase.md` appears to be an older 13-phase PHP/XAMPP roadmap. The supplied `prompt/masterprompt.md` and `prompt/prompts.md` describe the newer React + Vite, Node.js + Express.js, and MySQL project with 16 phases.

Until the user updates and approves `prompt/phase.md`:

- Do not use its PHP/XAMPP instructions as the current technology direction.
- Use the 16-phase sequence in `prompt/masterprompt.md`.
- Use the corresponding detailed phase prompt in `prompt/prompts.md`.
- Do not claim that the roadmap documents are fully consistent.
- Recommend reconciling `prompt/phase.md` with the approved 16-phase sequence.

The detailed phase prompts also contain some inconsistent separator headings and labels. Determine a phase by its numbered phase heading and actual goal, cross-checking it against the master prompt's 16-phase sequence. If the intended phase is still ambiguous, ask before implementing.

## 3. Project Overview

HugaTiera is an academic gardening services platform intended initially for Zamboanga City, Philippines.

It connects clients who need gardening, landscaping, and related services with gardeners who offer those services.

The platform should allow users to discover gardeners and their services, explore portfolios, submit general requests or direct inquiries with garden photos, receive AI-assisted help, receive offers and indicative quotations, communicate, reach a mutual agreement, and confirm service arrangements.

HugaTiera is a services marketplace, not an e-commerce store for physical gardening products.

Keep the implementation realistic and manageable for a college Software Engineering project.

## 4. Approved Technology Direction

Follow the current direction in `prompt/masterprompt.md`:

### Frontend
- React.js
- Vite
- JavaScript
- HTML5 and CSS3
- Bootstrap or another styling solution only when consistent with existing project decisions and approved requirements.

### Backend
- Node.js
- Express.js
- JavaScript
- REST API.

### Database
- MySQL.
- Use `mysql2` or another appropriate MySQL driver already selected by the project.

### Tools
- Visual Studio Code
- Git and GitHub
- Postman
- MySQL Workbench or phpMyAdmin, as applicable.

### AI integration
- The AI Garden Planning Assistant must call its provider through the backend.
- Keep provider keys in backend environment variables.
- Verify current provider pricing, free-tier eligibility, quotas, and availability before recommending or implementing a provider.
- Do not assume a consumer ChatGPT or Gemini subscription includes API credits.
- First revised version: **text and uploaded-photo understanding only** (Gemini API). Paid AI image generation/editing is **postponed** and must not be implemented or enabled, and paid API billing must not be enabled, without the user's explicit approval.
- Keep the AI layer extensible (provider abstraction, usage logging, original and generated images stored separately) so image generation can be added later without redesign.
- The AI must never approve requests, select providers, confirm bookings, set final prices, or guarantee outcomes.

Never replace MySQL with MongoDB. Do not describe the project as requiring a traditional MongoDB-based MERN stack. The approved direction is React + Express + Node.js + MySQL.

Do not change the technology stack without the user's explicit approval.

## 5. User Roles and Business Workflow

The platform has three primary roles:

- **Client:** discovers services, manages a profile, submits inquiries, reviews quotations, communicates with gardeners, requests bookings, and reviews eligible completed services.
- **Gardener:** manages a professional profile, service listings and portfolio, responds to inquiries, provides quotations, communicates with clients, and manages booking requests and service progress.
- **Administrator:** manages accounts and categories, monitors platform activity and reports, and accesses administrative dashboards and reports.

### Critical request-to-confirmation rule (revised 2026-11-10)

An inquiry, request, provider interest, offer, response, or client acceptance is **not** a booking.

HugaTiera supports two workflows that share one request engine (extended `inquiries` and `quotations` tables):

**Case 1 – General Service Request:** the client uploads a garden photo and requirements (with AI text/photo assistance), submits an open request, approved providers browse open requests and submit an expression of interest or offer, the client reviews and compares providers and accepts or rejects an offer.

**Case 2 – Direct Service Provider Inquiry:** the client selects a specific provider, uploads a photo and requirements (with AI assistance), submits the inquiry, and the provider evaluates feasibility and accepts, rejects, or suggests modifications; the client reviews the response.

**Both cases then require a mutual agreement** on actual scope of work, price, schedule, and other conditions. A booking (confirmed service arrangement) is created **only** when both the client and the provider have approved the same agreement version. The existing priced-service direct booking is kept but must go through this agreement step.

Offer rules: a provider may revise an offer until the client accepts it (latest offer is active, history preserved). An accepted offer is locked; later changes require mutual agreement.

Never automatically convert an inquiry, offer, or acceptance into a booking. Prevent duplicate confirmations and conflicting states.

After completion, an eligible client may submit a review.

## 6. Scope Boundaries

Do not add the following unless the user and project group/adviser explicitly approve them:

- Online payments, wallets, escrow, refunds, or financial settlement.
- E-commerce for physical gardening products.
- Live GPS tracking or automated gardener dispatch.
- Payroll or employee management.
- Professional CAD or 3D garden modeling.
- Native Android or iOS applications.
- Nationwide rollout.
- Unrelated home services.
- Costly or advanced AI image generation/editing as a required feature. (Postponed for a later phase; do not implement or enable paid billing without explicit approval.)

Do not introduce extra modules, complex architecture, or dependencies merely to make the project appear more advanced.

## 7. Phase-Based Development Rules

The project has 16 phases. Follow the sequence in `prompt/masterprompt.md`:

1. Requirements and System Architecture
2. MySQL Database Design
3. Development Environment Setup
4. Frontend Foundation and UI Design
5. Authentication and Authorization
6. User Profiles and Dashboards
7. Gardening Services and Portfolios
8. Marketplace and Search
9. Service Inquiry and Quotation
10. Messaging and Notifications
11. Booking and Scheduling
12. Ratings and Reviews
13. AI Garden Planning Assistant
14. Administrator Functions
15. System Integration and Testing
16. Deployment and Documentation

Rules:

- Determine the current phase using `project_progress.md` and the user's latest instructions.
- Work only on the phase, feature, or task the user requests.
- Do not automatically start the next phase.
- Do not implement all 16 phases in one task.
- Before implementation, read the matching numbered phase instructions in `prompt/prompts.md`.
- Check prerequisites and whether the required earlier phase has actually been completed and approved.
- If the progress file is missing, outdated, or unclear, ask the user for the current status rather than guessing.
- A phase is not complete merely because code was generated. Completion requires the relevant checks to be run and results to be reported accurately.
- Wait for the user's confirmation before moving to the next phase.

### Revision Track (scope revision approved 2026-11-10)

The revised workflows (Case 1 General Service Request, Case 2 Direct Service Provider Inquiry, mutual agreement, Gemini photo understanding) are implemented as the **Revision Track R0–R7**, defined in `prompt/masterprompt.md` Section 11A and `prompt/prompts.md`. The track sits between Phase 14 and Phase 16 and does not renumber the 16 phases. Phase 15 is completed only after R7.

- Work on one R step at a time and stop for user confirmation after each step.
- Present significant database or architecture changes for review before implementing them.
- Back up the database and get approval before running any schema migration against the local database.
- Do not mark Phase 15 or any R step complete until its tests have actually been run and reported.

## 8. Required Workflow for Coding Tasks

For every requested implementation task:

1. **Understand the request.** Identify the requested phase, feature, expected behavior, and constraints.
2. **Read project context.** Consult this file and the relevant project documentation and phase prompt.
3. **Inspect the actual code.** Examine relevant existing files, imports, routes, components, database schema, configuration, and related tests before editing.
4. **Report the plan.** Briefly identify the files likely to change, implementation approach, dependencies, and any database/API impact.
5. **Check for conflicts.** Do not override approved architecture, business rules, or existing working behavior without approval.
6. **Make focused changes.** Modify only what is needed for the requested task.
7. **Validate.** Run appropriate tests, builds, lint checks, or manual verification when available.
8. **Report results.** List changed files, explain important decisions, provide commands to run/test, and clearly distinguish verified results from unverified expectations.
9. **Track progress.** Update `project_progress.md` only when the work and status have been confirmed. Do not mark work complete based solely on generated code.
10. **Stop at the requested boundary.** Do not continue to another phase without user approval.

For small, clearly scoped fixes, keep the explanation proportionate; do not create unnecessary planning overhead.

## 9. Code Quality and Architecture Rules

- Follow the existing folder structure in `folder_structure.md` unless a change is necessary and approved.
- Keep frontend, backend, and database responsibilities separated.
- Use reusable React components where appropriate.
- Follow the existing naming, formatting, and coding conventions.
- Prefer clear, maintainable code over clever or unnecessarily abstract solutions.
- Avoid duplicated logic and unnecessary dependencies.
- Do not rewrite the entire application to implement a localized feature.
- Do not replace working implementations without a clear technical reason.
- Do not create a second implementation of an existing feature without checking first.
- Do not invent files, functions, API routes, environment variables, or database columns. Inspect the project first.
- If a required file or source is unavailable, state what is missing and ask for it rather than assuming its contents.
- Explain important technical decisions in understandable language suitable for a college student.

## 10. Backend, Database, and Security Rules

- Use MySQL for persistent application data.
- Inspect the existing schema before proposing or applying schema changes.
- Preserve referential integrity and use appropriate primary keys, foreign keys, constraints, and indexes.
- Use parameterized queries; never concatenate untrusted input into SQL.
- Validate input on the backend even when frontend validation exists.
- Enforce authentication and role-based authorization on protected backend endpoints.
- Check resource ownership; a user must not access or modify another user's private records without permission.
- Hash passwords using an appropriate password-hashing library.
- Protect secrets and API keys in environment variables; never commit `.env` files or expose secrets in frontend code.
- Avoid logging passwords, tokens, API keys, or other sensitive values.
- Validate uploaded files, including file type and size, and restrict upload operations to authorized users.
- Handle errors without exposing stack traces, credentials, or internal implementation details to end users.
- Use database transactions when multiple related writes must succeed or fail together.
- Enforce valid state transitions for inquiries, quotations, bookings, and other workflow records.
- Do not add payment functionality or other excluded scope.

## 11. Frontend and UX Rules

- Make the interface responsive for desktop, tablet, and mobile.
- Prioritize usability, accessibility, consistency, and clear feedback.
- Use real backend data when a feature is connected; do not leave fake or hardcoded data presented as live system data.
- Provide appropriate loading, empty, success, and error states.
- Keep role-specific navigation and pages consistent with permissions.
- Do not add excessive animation or visual complexity without a reason.
- Preserve the established visual direction unless the user requests a redesign.

## 12. API and Integration Rules

- Follow the existing REST API conventions.
- Keep business logic and database access in the backend.
- Do not connect the frontend directly to MySQL.
- Validate authorization and ownership on every protected operation.
- Keep API response formats and error handling consistent with the existing implementation.
- Update relevant API documentation when endpoints or request/response behavior change.
- Do not claim frontend/backend/database integration works until it has been tested.

## 13. Testing and Completion Reporting

- Test the affected feature and relevant regression paths.
- Test role permissions with the appropriate user roles when relevant.
- Test validation, empty states, and failure cases where practical.
- Run available test/build commands and report their actual output or result.
- Never claim a test passed if it was not executed.
- Identify tests that could not be run and explain why.
- Do not claim deployment succeeded unless it was actually verified.

When reporting a task, include as appropriate:

- What was implemented.
- Files created or modified.
- Database or environment changes.
- Commands to run.
- Tests actually performed and their results.
- Known limitations or remaining tasks.
- Whether `project_progress.md` was updated.

## 14. Project Progress and Documentation Maintenance

`project_progress.md` is the project continuity record.

When the user confirms a task or phase is complete, update the relevant sections with factual information, such as:

- Current phase and status.
- Completed features.
- Pending tasks.
- Confirmed database structure.
- Implemented API endpoints.
- Important file paths.
- Known bugs and limitations.
- Decisions made and approvals received.
- Next approved task.

Do not erase useful historical decisions. Do not mark unverified work as complete.

Update `folder_structure.md` when the actual project structure changes. Update `README.md` when setup, configuration, or usage instructions change. Keep prompt documents aligned with approved decisions, but do not silently rewrite the user's prompts.

## 15. Git and Environment Safety

- Respect the existing Git repository, branch, and uncommitted user changes.
- Inspect `git status` before potentially destructive Git operations.
- Never discard, reset, overwrite, or clean user changes without explicit permission.
- Do not commit, push, merge, or create branches unless the user requests it.
- Do not modify `.env`, credentials, or deployment secrets unnecessarily.
- Do not run destructive database migrations or delete user data without explicit approval.
- Explain potentially destructive commands before asking the user to run them.

## 16. Communication Style

- Explain technical concepts clearly and directly.
- Use exact paths and commands, especially for Windows and VS Code when relevant.
- Separate confirmed facts from assumptions and recommendations.
- Ask a focused clarification question when a missing decision materially affects implementation.
- Do not repeatedly ask for information already documented and current.
- Do not overwhelm the user with unrelated suggestions.
- Keep the work appropriate for an academic Software Engineering project and its available time and resources.

## 17. Starting a New Task

At the beginning of a new coding task:

1. Read this `AGENTS.md`.
2. Check `project_progress.md` for the current confirmed state.
3. Read `prompt/masterprompt.md` for project-wide requirements when needed.
4. Read the relevant numbered phase from `prompt/prompts.md`.
5. Inspect the actual source files before editing.
6. Follow the user's specific task and stop when that task is complete.

If the user is asking only a question, brainstorming, or documentation clarification, answer that request without automatically changing application code.


## Implementation Plan Reference

- Read `docs/implementation/implementation_plan.md`
  before implementing tasks covered by the plan.
- Treat the implementation plan as the approved technical reference.
- Do not silently change approved database schemas,
  migrations, or architectural decisions.
- Report discrepancies between the plan and existing code
  before proceeding.
- Never modify the original production database during
  migration testing.
- Update `project_progress.md` after completing and
  verifying implementation tasks.
