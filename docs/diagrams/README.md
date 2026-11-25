# HugaTiera — Exported System Diagrams (PNG)

High-resolution `.png` exports of all HugaTiera database, data-flow, architecture, network topology, and business-workflow diagrams for final documentation and project defense presentations.

All diagrams reflect the verified **`main`** codebase (`25` tables, `59` foreign keys, Migrations `001`–`013`).

| # | Filename | Diagram Title | Source Documentation |
|---|---|---|---|
| 01 | [01-data-model-erd-25-tables.png](01-data-model-erd-25-tables.png) | **Entity-Relationship Diagram (Data Model — 25 Tables, 59 FKs)** | [database/README.md](../../database/README.md), [hugatiera_schema.sql](../../database/schema/hugatiera_schema.sql) |
| 02 | [02-data-model-erd-grouped-overview.png](02-data-model-erd-grouped-overview.png) | **Entity-Relationship Diagram (Compact Grouped Relationships)** | [docs/erd-and-dfd.md](../erd-and-dfd.md) |
| 03 | [03-dfd-level-0-context.png](03-dfd-level-0-context.png) | **DFD Level 0 — Context Diagram** | [docs/erd-and-dfd.md](../erd-and-dfd.md) |
| 04 | [04-dfd-level-1-system.png](04-dfd-level-1-system.png) | **DFD Level 1 — System Processes (1.0–8.0) & Data Stores (D1–D10)** | [docs/erd-and-dfd.md](../erd-and-dfd.md) |
| 05 | [05-dfd-level-2-agreement-payment-closure.png](05-dfd-level-2-agreement-payment-closure.png) | **DFD Level 2 — Process 6.0 (Agreement, Reservation, Payment & Closure)** | [docs/erd-and-dfd.md](../erd-and-dfd.md) |
| 06 | [06-system-architecture-diagram.png](06-system-architecture-diagram.png) | **Three-Tier System Architecture Diagram** | [docs/architecture-and-workflows.md](../architecture-and-workflows.md) |
| 07 | [07-network-topology-diagram.png](07-network-topology-diagram.png) | **Network & Communication Topology Diagram (Ports, Protocols & External APIs)** | [README.md](../../README.md), [backend/app.js](../../backend/app.js) |
| 08 | [08-workflow-case1-case2-agreement-payment.png](08-workflow-case1-case2-agreement-payment.png) | **End-to-End Case 1 vs Case 2 Request, Agreement, Payment & Closure Flowchart** | [docs/architecture-and-workflows.md](../architecture-and-workflows.md) |
| 09 | [09-workflow-unified-overview.png](09-workflow-unified-overview.png) | **Unified 7-Step Request-to-Confirmation Workflow Overview** | [README.md](../../README.md) |
| 10 | [10-user-hierarchy-diagram.png](10-user-hierarchy-diagram.png) | **User Role Hierarchy & Access Control Diagram (Guest, Client, Gardener Dual-Role, Assigned Clerk, Administrator)** | [docs/architecture-and-workflows.md](../architecture-and-workflows.md), [docs/system-functionalities.md](../system-functionalities.md) |
