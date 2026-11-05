# MASTER PROMPT: HUGATIERA SYSTEM DEVELOPMENT

Act as a senior full-stack web developer, software architect, database designer, and technical mentor. Help me develop a complete academic software engineering project called:

**HugaTiera: A Platform for Gardening Services with Generative AI Integration**

## 1. Project Overview

HugaTiera is a responsive, web-based gardening services marketplace initially intended for users in Zamboanga City, Philippines.

The platform connects:
- **Clients:** Homeowners or property managers looking for gardening services.
- **Gardeners:** Freelance gardeners or landscaping service providers who want to showcase their work and receive service inquiries.
- **Administrators:** People responsible for managing platform users, service categories, reports, and other administrative activities.

This must function as a two-sided marketplace, not merely a simple appointment or booking management system.

Clients should be able to discover gardening service providers, explore their portfolios, inquire about services, receive responses or quotations, and decide whether to proceed with a booking.

Gardeners should be able to showcase their services, manage their portfolios, respond to inquiries, and manage their bookings.

## 2. Technology Stack

Use the following technologies:

- HTML
- CSS
- JavaScript
- PHP
- MySQL
- Bootstrap or custom responsive CSS
- XAMPP for local development

Use a straightforward PHP and MySQL architecture that is understandable and maintainable by college students.

Avoid unnecessary frameworks, paid services, and complicated dependencies.

## 3. Main User Roles

### Client
- Register and log in.
- Manage their profile.
- Browse gardening services.
- Search and filter gardeners.
- View gardener profiles and portfolios.
- Submit service inquiries.
- Receive gardener responses and quotations.
- Communicate with gardeners.
- Accept or decline a proposed service.
- Book an agreed service schedule.
- View booking history and status.
- Submit ratings and reviews after completed services.
- Use the AI Garden Planning Assistant.

### Gardener
- Register and log in.
- Manage their profile.
- Create and manage a gardening service listing.
- Upload portfolio images.
- Describe their skills and services.
- Receive and manage client inquiries.
- Respond to inquiries with service details and indicative quotations.
- Communicate with clients.
- Manage booking requests.
- Update booking status.
- View reviews and ratings.

### Administrator
- Access an administrative dashboard.
- Manage client and gardener accounts.
- Manage service categories.
- Review reported users or content.
- Monitor inquiries and bookings.
- View basic platform statistics and reports.

## 4. Main System Modules

Develop these modules:

1. Authentication and account management.
2. Role-based access control.
3. Client dashboard.
4. Gardener dashboard.
5. Administrator dashboard.
6. Gardener profiles and portfolios.
7. Gardening service categories.
8. Search and filtering.
9. Service inquiry and quotation workflow.
10. Client-gardener messaging.
11. Booking and scheduling.
12. Ratings and reviews.
13. AI Garden Planning Assistant.
14. Notifications.
15. Administrative management and reports.

## 5. Important Service Workflow

Do not make booking the only way to interact with gardeners.

The expected process is:

1. Client browses available gardeners.
2. Client views a gardener's profile, portfolio, and services.
3. Client submits an inquiry describing the gardening needs.
4. Gardener receives the inquiry.
5. Gardener responds with questions, service details, availability, or an indicative quotation.
6. Client reviews the response.
7. Client decides whether to proceed.
8. If both parties agree, the client submits or confirms a booking request.
9. Gardener accepts or declines the booking.
10. Both parties can view the booking status.
11. After the service is completed, the client can submit a review.

The platform does not process payments. Payment arrangements such as cash or GCash are handled outside the platform.

## 6. AI Garden Planning Assistant

The system should include a simple Generative AI Garden Planning Assistant.

Its initial implementation should focus on text-based assistance, such as:

- Suggesting suitable plants based on the user's stated environment.
- Providing basic garden layout ideas.
- Recommending possible garden styles.
- Suggesting ways to improve small gardens, terraces, and outdoor spaces.
- Giving basic gardening tips and maintenance suggestions.

Use an AI API with an available free tier, if suitable and available.

Important restrictions:
- Do not assume that an API is permanently free.
- Do not use paid services without explicit approval.
- Do not automatically switch to a paid model when a free quota is exhausted.
- Keep API keys on the PHP backend, never expose them in JavaScript.
- Add request limits and usage controls.
- Explain that AI suggestions are conceptual and may need professional assessment.
- Keep image generation optional unless the group confirms that it can be implemented within the approved budget.

The AI feature should be modular so it can be disabled without breaking the rest of the platform.

## 7. Project Scope Restrictions

Do not implement the following unless I explicitly request a scope revision:

- Direct in-app payments.
- Digital wallets, escrow, refunds, or payment settlement.
- E-commerce for physical gardening products.
- Live GPS tracking.
- Automated gardener dispatch.
- Payroll and employee management.
- Professional CAD or 3D garden modeling.
- Native Android or iOS applications.
- Nationwide deployment.
- Unrelated home services.

## 8. Development Rules

Follow these rules throughout development:

1. Build the system one module at a time.
2. Do not generate the entire system in one response.
3. Before coding, explain the purpose and workflow of the module.
4. Show the required folder structure.
5. Explain the database tables and relationships before creating them.
6. Provide complete code for the files being created or modified.
7. Always identify the exact file path for each code block.
8. When modifying an existing file, preserve working functionality.
9. Do not rename or remove existing files without explaining why.
10. Use prepared statements for database operations.
11. Validate user inputs on the server side.
12. Implement secure password hashing and session management.
13. Apply role-based access control to protected pages.
14. Use reusable PHP components where practical.
15. Make the interface responsive for desktop and mobile.
16. Avoid unnecessary libraries and paid dependencies.
17. Include meaningful error messages and basic logging.
18. Explain how to test each completed feature.
19. Do not claim that a feature works unless it has been tested or its limitations are clearly stated.

## 9. How I Want You to Assist Me

I am a college student developing this as a group Software Engineering project. Explain things clearly without assuming that I am an expert developer.

For every development phase:

- Explain what we are building.
- Explain why it is needed.
- Identify the files involved.
- Explain the database changes.
- Provide the implementation in manageable parts.
- Give the commands or steps needed to run it.
- Provide test cases.
- Help troubleshoot errors based on the actual error messages and code I provide.

Do not move to the next phase until I confirm that the current phase works.

## 10. Starting Instruction

First, do not write the application code yet.

Start by providing:

1. The recommended system architecture.
2. The complete proposed folder structure.
3. The database entity relationship design.
4. The list of database tables and their purposes.
5. The development phases in the correct order.
6. The recommended security practices.
7. The free-tier AI integration strategy.

Keep the architecture appropriate for a college-level project that can realistically be developed, tested, and demonstrated within a limited academic project timeline.