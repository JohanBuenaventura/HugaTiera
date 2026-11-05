==========================================
PHASE 1 : System architecture and database
==========================================

Based on the HugaTiera project requirements, prepare the system architecture and database design.

Do not write application code yet.

Provide:
1. Recommended folder structure.
2. Database ERD.
3. Complete database table list.
4. Table fields, data types, primary keys, and foreign keys.
5. Relationships between clients, gardeners, services, inquiries, quotations, messages, bookings, reviews, and administrators.
6. Explain the purpose of each table.
7. Identify any missing requirements or design conflicts.

Make sure the database supports the complete client-to-gardener inquiry and booking workflow.

Wait for my approval before proceeding to implementation.

========================
PHASE 2: Project Setup
========================

Let's implement Phase 2 of HugaTiera: Project and Database Setup.

I am using Windows, Visual Studio Code, XAMPP, PHP, and MySQL.

Guide me through:
1. Creating the project folder.
2. Organizing the folders and PHP files.
3. Creating the MySQL database.
4. Creating the database tables using SQL.
5. Creating the database connection file.
6. Testing the database connection.
7. Creating reusable header, footer, and navigation components.

Give me the exact file paths and complete code. Explain how to test each step. Do not proceed to authentication until this phase works.


=========================
Phase 3 - Authentication
=========================

Implement HugaTiera's authentication module.

Required features:
- Client registration.
- Gardener registration.
- Login and logout.
- Password hashing.
- PHP sessions.
- Role-based access control.
- Protected dashboard pages.
- Server-side input validation.
- Duplicate email prevention.

Use PHP and MySQL prepared statements.

Make sure clients cannot access gardener or administrator pages without authorization. Do not allow users to register themselves as administrators.

Provide the complete code, file paths, database changes, and testing instructions.

==============================
Phase 4 — Build the dashboards
==============================

Implement the three HugaTiera dashboards: Client, Gardener, and Administrator.

Each dashboard should have navigation and features appropriate to its role.

Use a consistent, modern gardening-inspired design. Make it responsive for mobile and desktop.

Do not create nonfunctional buttons or placeholder features that appear completed. Connect dashboard statistics to actual database data where appropriate.

Show the complete files and explain how to test each role.


==============================================
Phase 5 — Marketplace and gardener portfolios
==============================================

Implement the HugaTiera gardening marketplace.

Gardeners should be able to:
- Create and edit service listings.
- Select gardening service categories.
- Add service descriptions.
- Upload portfolio images.
- Manage their listings.

Clients should be able to:
- Browse gardening services.
- Search for gardeners.
- Filter by category and other available criteria.
- View gardener profiles and portfolios.

Implement secure image uploads, file validation, and ownership checks. Connect everything to the database.

=================================
Phase 6 - Inquiry and Quotation
=================================

Implement the HugaTiera service inquiry and quotation workflow.

A client must be able to submit an inquiry to a gardener without immediately making a booking.

The inquiry should contain the client's gardening needs, description, and relevant details.

The gardener should be able to:
- View incoming inquiries.
- Respond to client questions.
- Provide service information.
- Give an indicative quotation.
- Provide possible schedules.
- Mark an inquiry as accepted, declined, or requiring further discussion.

The client should be able to review the response and decide whether to proceed to booking.

Implement the required database relationships, access controls, and status tracking.

Do not implement payment processing.

============================
Phase 7 - Messaging, booking, reviews
===============================

Implement HugaTiera's messaging, booking, and review modules.

Requirements:
1. Clients and gardeners can communicate regarding their inquiries.
2. Only authorized participants can access their conversations.
3. Clients can submit booking requests after discussing a service.
4. Gardeners can accept or decline booking requests.
5. Both users can see booking status and schedule details.
6. Booking completion must be recorded before a client can submit a review.
7. Clients can rate and review completed services.

Use appropriate database relationships and server-side validation.

Do not add payment functionality.


============================
Phase 8 - Ai Garden Planning Assistant
=============================

Implement the AI Garden Planning Assistant for HugaTiera.

The initial version must be text-based and use an AI API with a verified free tier, if available.

The assistant should help clients with:
- Garden design ideas.
- Suitable plant suggestions.
- Small-space garden planning.
- Terrace and outdoor garden improvement.
- Basic garden maintenance suggestions.

Technical requirements:
1. Connect to the AI provider through the PHP backend.
2. Store the API key in an environment variable or another server-side configuration that is not publicly accessible.
3. Never expose the API key in JavaScript or frontend source code.
4. Add request validation and usage limits.
5. Handle API errors, timeouts, and exhausted quotas.
6. Do not automatically switch to a paid API or model.
7. Display an informative message if the free quota is unavailable.
8. Do not send unnecessary personal information to the AI provider.
9. Clearly explain that suggestions are conceptual and should be reviewed before implementation.
10. Make the AI module independent so the rest of HugaTiera continues working if the AI service is unavailable.

Before coding, compare suitable API options based on free-tier availability, model capabilities, terms, and limitations. Do not assume that image generation is free.


======================================
Phase 9 — Testing and finalization
====================================

Help me perform a complete system testing process for HugaTiera.

Prepare test cases for:
- Client registration and login.
- Gardener registration and login.
- Administrator access.
- Service listing creation and editing.
- Portfolio image uploads.
- Search and filtering.
- Service inquiries and quotations.
- Messaging.
- Booking requests and status changes.
- Completion and reviews.
- AI Garden Planning Assistant.
- Unauthorized access.
- Invalid inputs.
- Mobile responsiveness.
- Database and API errors.

For each test case, provide:
1. Test case ID.
2. Feature being tested.
3. Preconditions.
4. Steps.
5. Expected result.
6. Actual result column.
7. Pass or fail column.

Also identify possible security problems and suggest corrections.