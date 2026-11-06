# 🌱 HugaTiera
### A Platform for Gardening Services with Generative AI Integration

**HugaTiera** is a web-based gardening services platform designed to connect clients with freelance gardeners and landscaping service providers. It aims to make gardening services more accessible by providing a centralized platform where users can discover gardeners, explore service portfolios, submit inquiries, discuss quotations, and arrange gardening services.

The platform also aims to provide AI-powered garden planning assistance to help users explore gardening ideas and possible improvements for their outdoor spaces.

> **Project Status:** In Development  
> **Project Type:** Academic Software Engineering Project  
> **Initial Target Location:** Zamboanga City, Philippines

---

## 📌 Project Overview

Finding reliable gardening service providers and planning outdoor spaces can be challenging for homeowners and property managers. At the same time, freelance gardeners may have difficulty showcasing their work and reaching potential clients.

HugaTiera addresses these challenges by providing a digital marketplace where clients and gardening service providers can connect.

Unlike a traditional booking management system, HugaTiera focuses on the complete service discovery and inquiry process. Clients can explore gardening services, communicate with providers, receive service information or indicative quotations, and decide whether to proceed with a booking.

## 🎯 Project Objectives

- Connect clients with freelance gardeners and landscaping service providers.
- Provide gardeners with a platform to showcase their services, skills, and portfolios.
- Allow clients to discover and compare available gardening services.
- Support service inquiries and communication between clients and gardeners.
- Provide a booking and scheduling process after both parties agree.
- Integrate a Generative AI Garden Planning Assistant for basic gardening ideas and recommendations.

## ✨ Key Features

### 👤 Client Features
- Account registration and login.
- Profile management.
- Browse available gardeners and gardening services.
- Search and filter service providers.
- View gardener profiles and portfolios.
- Submit service inquiries.
- Receive responses and indicative quotations.
- Communicate with gardeners.
- Request and manage bookings.
- View booking history and status.
- Submit ratings and reviews after completed services.
- Access the AI Garden Planning Assistant.

### 🌿 Gardener Features
- Gardener registration and login.
- Profile management.
- Create and manage gardening service listings.
- Upload portfolio images.
- Showcase gardening skills and experience.
- Receive and respond to client inquiries.
- Provide service information and indicative quotations.
- Communicate with clients.
- Accept or decline booking requests.
- Manage service schedules and booking statuses.

### 🛠️ Administrator Features
- Administrative dashboard.
- Manage client and gardener accounts.
- Manage gardening service categories.
- Monitor platform activities.
- Review reported users or content.
- View basic platform statistics and reports.

### 🤖 AI Garden Planning Assistant
The platform plans to integrate a Generative AI assistant to help users explore basic gardening concepts.

Expected capabilities include:
- Suggesting suitable plants based on user-provided conditions.
- Providing basic garden layout ideas.
- Recommending garden styles.
- Suggesting improvements for small gardens and terraces.
- Providing general gardening and maintenance tips.

**AI Integration Approach:**
- Prioritize text-based AI assistance.
- Investigate AI APIs with available free-tier access.
- Keep API credentials on the server side.
- Apply usage limits to control API consumption.
- Avoid automatic switching to paid models.
- Keep image generation optional and subject to available resources and budget.

AI-generated suggestions are conceptual and should be reviewed before actual implementation.

---

## 🔄 Main Platform Workflow

```text
Client
  |
  v
Browse Gardening Services
  |
  v
View Gardener Profile and Portfolio
  |
  v
Submit Service Inquiry
  |
  v
Gardener Receives Inquiry
  |
  v
Gardener Responds with Details
and Indicative Quotation
  |
  v
Client Reviews the Response
  |
  v
Proceed with Booking?
  |
  +---- No ----> End Inquiry
  |
  +---- Yes ---> Submit Booking Request
                    |
                    v
              Gardener Accepts
              or Declines
                    |
                    v
              Service Completion
                    |
                    v
              Client Submits Review
```

---

## 🧰 Technology Stack

The proposed development technologies are:

| Category | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| UI Framework | Bootstrap / Custom CSS |
| Backend | PHP |
| Database | MySQL |
| Local Development | XAMPP |
| Code Editor | Visual Studio Code |
| Version Control | Git and GitHub |
| AI Integration | Generative AI API with suitable free-tier availability |

*The final implementation may be adjusted based on project requirements and technical feasibility.*

---

## 📂 Project Structure

The following is the proposed project organization. The actual structure may change during development.

```text
HugaTiera/
│
├── assets/
│   ├── css/
│   ├── js/
│   └── images/
│
├── config/
│   └── database.php
│
├── includes/
│   ├── header.php
│   ├── footer.php
│   └── functions.php
│
├── admin/
│
├── client/
│
├── gardener/
│
├── ai/
│
├── uploads/
│
├── database/
│   └── hugatiera.sql
│
├── index.php
├── login.php
├── register.php
├── logout.php
├── README.md
└── .gitignore
```

---

## ⚙️ Installation and Setup

Follow these steps to run the project locally once the application and database files are available.

### Prerequisites

Install the following:

- [XAMPP](https://www.apachefriends.org/)
- [Visual Studio Code](https://code.visualstudio.com/)
- [Git](https://git-scm.com/)

### 1. Clone the Repository

Open your terminal and execute:

```bash
git clone https://github.com/YOUR-USERNAME/HugaTiera.git
```

Navigate to the project directory:

```bash
cd HugaTiera
```

### 2. Move the Project to XAMPP

Place the project folder inside:

```text
C:\xampp\htdocs\
```

Your project directory should look like:

```text
C:\xampp\htdocs\HugaTiera\
```

### 3. Start XAMPP

Open the XAMPP Control Panel and start:

- Apache
- MySQL

### 4. Create the Database

1. Open your browser.
2. Navigate to `http://localhost/phpmyadmin`.
3. Create a database named:

```sql
hugatiera_db
```

4. Import the provided SQL file:

```text
database/hugatiera.sql
```

*If the SQL file is not yet available, the database setup is still in development.*

### 5. Configure the Database Connection

Update the database configuration file according to your local MySQL setup.

Example configuration:

```php
<?php

$host = "localhost";
$username = "root";
$password = "";
$database = "hugatiera_db";

$conn = new mysqli(
    $host,
    $username,
    $password,
    $database
);

if ($conn->connect_error) {
    die("Database connection failed.");
}

?>
```

Use appropriate credentials for your own environment. Do not commit production credentials to GitHub.

### 6. Run the Application

Open your browser and visit:

```text
http://localhost/HugaTiera/
```

---

## 🔐 Security Considerations

The project will follow basic web application security practices, including:

- Password hashing using PHP password functions.
- Prepared statements for database queries.
- Server-side input validation.
- Role-based access control.
- Secure session handling.
- Validation of uploaded files.
- Protection of sensitive configuration files.
- Keeping AI API keys outside publicly accessible source code.

---

## 💳 Payment and Service Limitations

HugaTiera is intended to facilitate connections between clients and gardening service providers.

The following are outside the initial project scope:

- Direct in-app payment processing.
- Digital wallets and escrow services.
- Refunds and payment settlements.
- E-commerce for physical gardening supplies.
- Live GPS tracking.
- Automated gardener dispatch.
- Professional CAD or 3D garden modeling.
- Native Android and iOS applications.
- Nationwide deployment.

Payment arrangements, such as cash or GCash, will be handled directly between clients and gardeners outside the platform.

---

## 🚀 Development Roadmap

- [ ] System architecture and database design
- [ ] Project setup and database configuration
- [ ] User authentication and role management
- [ ] Client dashboard
- [ ] Gardener dashboard
- [ ] Administrator dashboard
- [ ] Gardener profiles and portfolios
- [ ] Gardening service listings and categories
- [ ] Marketplace search and filtering
- [ ] Service inquiry and quotation workflow
- [ ] Client-gardener messaging
- [ ] Booking and scheduling
- [ ] Ratings and reviews
- [ ] AI Garden Planning Assistant
- [ ] Notifications
- [ ] Administrative reports
- [ ] System testing and debugging
- [ ] Deployment

---

## 👥 Target Users

| User | Description |
|---|---|
| Clients | Homeowners and property managers looking for gardening services. |
| Gardeners | Freelance gardeners and landscaping service providers. |
| Administrators | Users responsible for platform administration and monitoring. |

---

## 📍 Project Scope

The initial implementation focuses on Zamboanga City, Philippines.

The system will be developed as a responsive web application accessible through desktop and mobile browsers.

Its primary purpose is to establish a centralized platform for discovering gardening services and connecting clients with independent gardening service providers.

---

## 📚 Project Information

**Project Name:** HugaTiera

**Project Title:** A Platform for Gardening Services with Generative AI Integration

**Project Category:** Web-Based Marketplace Platform

**Development Purpose:** Academic Software Engineering Project

**Initial Deployment Scope:** Zamboanga City, Philippines

---

## 📄 License

This project is developed for academic purposes. Licensing and permissions for reuse or redistribution will be determined by the project team.

---

<p align="center">
  🌱 <strong>HugaTiera</strong> — Connecting People, Gardeners, and Greener Spaces.
</p>
