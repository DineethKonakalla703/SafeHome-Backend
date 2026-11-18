# SafeHome-Backend

[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-v5.1-lightgrey.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20v7.0-brightgreen.svg)](https://www.mongodb.com/)
[![GraphRAG](https://img.shields.io/badge/AI-RAG%20%26%20GraphRAG-blueviolet.svg)](https://github.com/DineethKonakalla703/SafeHome-Backend)
[![Tests](https://img.shields.io/badge/Tests-49%20Passing-success.svg)](https://github.com/DineethKonakalla703/SafeHome-Backend)

**SafeHome-Backend** is an enterprise-grade residential facility maintenance and community service CRM backend powered by **Retrieval-Augmented Generation (RAG)**, **Knowledge Graph (GraphRAG)** reasoning, and an **Agentic Copilot**. It provides 160 REST API endpoints, 36 Mongoose models, and a 6-tier Role-Based Access Control (RBAC) hierarchy to serve web and mobile client applications.

---

## 1. Core Capabilities & Architecture

- **Dual-Engine Knowledge Retrieval:**
  - **In-Process Hybrid RAG:** Combines lexical inverted token matching with 64-dimensional sparse feature hash projections (`feature-hash-v1`) with 0.37 ms latency and zero token indexing cost.
  - **GraphRAG Multi-Hop Reasoning:** Integrates a Neo4j property graph client (Bolt:7687 / HTTP:7474) and an in-memory property graph with adjacency indices. Traverses multi-hop entity relationships (2-hop BFS), achieving **0.980 Recall@5 on relational CRM queries** (+790.9% gain over flat vector RAG).
- **Autonomous CRM Copilot & Safety Guardrails:**
  - Claude 3.5 Sonnet agent runner with 30 registered CRM tool definitions.
  - Human-in-the-loop liability guardrail (`confirmationStore.js`) intercepting high-liability destructive actions and financial dispatches.
- **Enterprise CRM Workflows:**
  - Resident onboarding, ticketing lifecycle state machine, technician dispatch, itemized billing, amenity reservations, visitor gate access, and immutable audit logs.
- **Robust Security Middleware:**
  - Stateless JWT authentication and 6-role RBAC (`MAIN_ADMIN`, `BLOCK_SUB_ADMIN`, `FACILITY_MANAGER`, `TECHNICIAN`, `RESIDENT`, `SECURITY`).
  - Recursive NoSQL injection operator sanitizer (`$where`, `$gt` stripping) and null-byte (`\0`) protection.
  - Deterministic heuristic fallback engine (`aiFallbackRules.js`) ensuring 100% operational uptime during external LLM outages.

---

## 2. Technology Stack

- **Runtime:** Node.js (v20+ / v24 ESM)
- **Web Framework:** Express.js 5.1
- **Database:** MongoDB Atlas (Mongoose ODM 8.19)
- **Graph Database:** Neo4j Community/Enterprise (Bolt protocol & HTTP Cypher API) with embedded fallback
- **AI / LLM:** Anthropic Claude 3.5 Sonnet SDK (`@anthropic-ai/sdk`), deterministic fallback rules
- **Security:** JSON Web Tokens (`jsonwebtoken`), Bcrypt (`bcryptjs`), Helmet, Express Rate Limiter
- **Testing:** Node.js native test runner (`node --test`), Supertest

---

## 3. Directory Structure

```text
SafeHome-Backend/
├── scripts/                      # Evaluation & audit scripts
│   ├── audit_counts.js           # API route & model counter
│   ├── inspectDatabase.js        # MongoDB connection & health check
│   └── runRagasEvaluation.js     # Live RAGAS continuous evaluation runner
├── src/
│   ├── ai/                       # AI Subsystem
│   │   ├── agent/                # Copilot runner, tool definitions (30 tools)
│   │   ├── chatbot/              # Intent detector, permission guard, confirmation store
│   │   ├── evaluation/           # RAGAS evaluator & golden benchmark suite
│   │   ├── graph/                # Neo4j client, entity extractor, BFS traversal, pipeline
│   │   ├── rag/                  # Hybrid retriever, embedding service, answer generator
│   │   ├── aiFallbackRules.js    # Zero-downtime deterministic rule engine
│   │   ├── claudeClient.js       # Anthropic SDK client wrapper
│   │   └── claudeJsonParser.js   # JSON repair & markdown fence cleaner
│   ├── config/                   # Database & runtime configuration
│   ├── controllers/              # 19 REST API controllers
│   ├── middleware/               # Auth (JWT/RBAC), security sanitizer, error handling
│   ├── models/                   # 36 Mongoose database schemas & models
│   ├── routes/                   # 19 modular Express route declarations (160 endpoints)
│   ├── seed/                     # Database seed generator with demo accounts
│   ├── services/                 # Business logic, email, notifications
│   ├── tests/                    # 8 automated test suites (49 passing test cases)
│   ├── utils/                    # Common helpers, logger, date utilities
│   └── server.js                 # Application entry point & gateway setup
├── uploads/                      # Local file storage (tickets, photos, gate passes)
├── .env.example                  # Environment configuration template
├── .gitignore                    # Git tracking rules
├── Dockerfile                    # Containerization specification
├── package.json                  # Dependencies & scripts
└── README.md                     # Documentation
```

---

## 4. Installation & Setup

### Prerequisites
- Node.js >= 20.x installed
- MongoDB instance (Local or MongoDB Atlas connection string)
- Neo4j instance (Optional; falls back to high-performance embedded property graph)
- Anthropic API Key (Optional; falls back to deterministic heuristic rules)

### Installation
```bash
# Clone the repository
git clone https://github.com/DineethKonakalla703/SafeHome-Backend.git
cd SafeHome-Backend

# Install dependencies
npm install
```

### Environment Configuration
Copy `.env.example` to `.env` and configure your credentials:
```bash
cp .env.example .env
```

Key environment variables:
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173,http://localhost:8081
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/safehome_rag?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_jwt_key_at_least_32_characters
JWT_EXPIRES_IN=7d
ANTHROPIC_API_KEY=your_anthropic_api_key_here
NEO4J_URI=bolt://localhost:7687
```

### Database Seeding
Seed the database with initial residential estates, buildings, apartments, and demo role accounts:
```bash
npm run seed
```
*Default demo password across all seeded accounts:* `Demo@123`

---

## 5. Startup & Running Commands

```bash
# Start development server with live reload
npm run dev

# Start production server
npm start

# Run syntax & compilation check
npm run check

# Run automated integration tests (49 test cases)
npm test

# Run RAGAS quantitative evaluation benchmark
npm run eval:ragas
```

---

## 6. API Route Groups Summary

The backend exposes **160 endpoints** mounted under `/api/`:

| Route Prefix | Module | Key Operations |
| :--- | :--- | :--- |
| `/api/auth` | Authentication | Login, registration, token verification, password reset |
| `/api/tickets` | Complaints & Ticketing | Complaint creation, automated priority triage, SLA timers |
| `/api/work-orders` | Work Orders | Technician work order assignment, completion proof, status updates |
| `/api/knowledge` | Knowledge & GraphRAG | Document chunk CRUD, hybrid query, Neo4j graph traversal |
| `/api/chatbot` | Resident AI Chatbot | Conversational maintenance helper, liability confirmation banner |
| `/api/agent` | Autonomous Copilot | Multi-turn CRM tool execution across 30 models |
| `/api/billing` | Billing & Ledgers | Maintenance fee invoicing, receipt generation, dues summary |
| `/api/amenities` | Amenity Booking | Clubhouse/Gym slot booking, conflict avoidance |
| `/api/security` | Gate & Security | Digital gate passes, visitor check-in/out, vehicle log |
| `/api/resident` | Resident Portal | Unit profile, mobile dashboard feed, registered vehicles |
| `/api/ai` | AI Insights | SLA breach predictor, technician/vendor recommender, incident detector |

---

## 7. Docker Deployment

```bash
# Build Docker image
docker build -t safehome-backend .

# Run container
docker run -p 5000:5000 --env-file .env safehome-backend
```

---

## 8. License

Proprietary / Academic Capstone Project · Developed by Dineeth Konakalla.
