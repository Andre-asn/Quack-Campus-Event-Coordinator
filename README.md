# Quack! 🦆 — Campus Event Coordinator

A lightweight, location-first way for students to turn "I'm here" into "come join."

Quack! is a campus-focused web application that helps students discover and organize informal, low-commitment meetups — without the overhead of joining a club or planning days in advance.

---

## Table of Contents
- [Problem](#problem)
- [Vision](#vision)
- [Semester Scope (MVP)](#semester-scope-mvp)
- [Out of Scope (For Now)](#out-of-scope-for-now)
- [Key Features](#key-features)
- [Requirements Structure](#requirements-structure)
- [Team](#team)
- [Project Documentation](#project-documentation)
- [Getting Started](#getting-started)
- [Contributing](#contributing)

---

## Problem

Campus socializing has a missing middle. "Joining a club" requires schedules, commitment, and planning, while classes only offer brief social windows. Existing tools don't fill that gap:

- **Event platforms** are built for organized, scheduled activities with significant lead time.
- **Group chats and social stories** mostly reach people students already know — they broadcast more than they coordinate.
- **Students already nearby** who want to grab lunch, study, or watch a movie together have no lightweight way to discover each other.

Quack! creates a low-commitment coordination layer for what's happening around campus in the next few hours.

## Vision



**Make spontaneous campus life visible.** Quack! aims to become the ambient social layer for campus: a simple way for students to see what's happening nearby, create low-commitment meetups, and turn shared time and place into real-world connection — discovering nearby activity, creating events in seconds, joining spontaneously, building campus connections, and eventually understanding activity patterns.

## Semester Scope (MVP)

 ***Post → Discover → Join → Repeat.***

A registered student can place an event pin on a campus map, add a date, time, location, and short description, and make the event public or accessible only through a link. Other students can discover nearby events, view details and attendance, and join or leave. Hosts can edit or cancel their events and review basic view/participation counts.

In scope for this semester:
- Persistent student accounts and event data
- Map-based event posting and discovery
- Date, time, location, and short description per event
- Event detail and attendance visibility
- Join / leave workflow
- Host edit / cancel controls
- Public vs. link-only visibility
- Date filtering and basic host counts
- A deployed, tested application for one campus / one client platform

## Out of Scope (For Now)

- Messaging and social feeds
- Payments and ticketing
- Recurring events and check-in
- Full moderation/admin dashboard
- Ratings

Profiles, interests, invitations, distance/category filters, notifications, attendance caps, reporting/blocking, and heatmaps are secondary or stretch capabilities that may be considered after the core loop is stable.

## Key Features

| Priority | Feature | Value Delivered | Status |
|---|---|---|---|
| P0 | Accounts & Authentication | Persistent identity for real students | Core |
| P0 | Map-Based Event Creation | Post location, date/time, and one-line detail | Core |
| P0 | Location-First Discovery | See nearby events on the campus map | Core |
| P0 | Event Details + Join/Leave | Complete the post/discover/join loop | Core |
| P1 | Host Controls & Visibility | Edit/cancel; public or link-only access | Planned |
| P1 | Date Filtering & Basic Stats | Past/upcoming events; view/join counts | Planned |
| P2 | Profiles / Interests / Friends | Support continued social connection | Secondary |
| P2 | Filters, Notifications, Heatmap | Improve discovery, safety, and insight | Stretch |

## Requirements Structure

Requirements are organized as Epics → Features → Stories.

- **Epic 1 — Identity & Access**: Accounts, login, visibility rules.
  _Example story: As a student, I can create an account and log in._
- **Epic 2 — Event Creation & Hosting**: Create, edit, cancel, event visibility.
  _Example story: As a student, I can pin an event with date, time, location, and description._
- **Epic 3 — Discovery & Participation**: Map discovery, details, join/leave.
  _Example story: As a student, I can open the map and see events happening near me._
- **Epic 4 — History & Insight**: Date filters and host participation counts.
  _Example story: As a host, I can see how many people viewed and joined my events._

Full breakdown lives on the [Epics/Features/Stories wiki page](../../wiki/epics-features-stories).

## Team

| Team Member | Role(s) | Primary Responsibilities |
|---|---|---|
| **Andre Santiago-Neyra** | Project Lead; System Architect; Backend Engineer | Coordinates scope, milestones, and team decisions; owns architecture and technical design; leads backend services and API integration. |
| **Matthew Feroz** | Backend Lead; Frontend and DevOps Support | Develops backend services and data access; supports map and interface integration; assists with deployment and CI/CD. |
| **Pratiksha Vilas Pawar** | Test and Requirements Engineer; DevOps Support; Full-Stack Support | Refines requirements and acceptance criteria; creates functional, regression, edge, and boundary tests; manages defects; supports CI/CD and application integration. |
| **Zhong Zhangniantong** | Backend and Database Engineer; API Developer; DevOps Support | Develops REST APIs and database-driven services; supports scalable system design, containerization, deployment, and technical documentation. |

**Andre Santiago-Neyra** is the project lead and engineering point of contact.

## Project Documentation

- 📖 [Project Wiki](../../wiki) — vision, scope, roles, risks, and assumptions
- 🗂️ [Epics / Features / Stories](../../wiki/epics-features-stories)
- 🧭 [Sprint plans and status updates](../../wiki)

## Getting Started

### Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| **Node** | 22 LTS or newer | The React Native client |
| **JDK** | 25 | The Spring Boot API |
| **Docker** | any current | The local PostgreSQL + PostGIS database |

Nothing else is installed globally. Only Node is needed to work on the client.

### Clone

```bash
git clone https://github.com/MikeZHONGznt/Quack-Campus-Event-Coordinator.git
cd Quack-Campus-Event-Coordinator
```

### Run the client

```bash
cd client
npm install
npm start
```

Install **Expo Go** on your phone, then scan the QR code the bundler prints. On Android use
Expo Go's scanner; on iOS use the Camera app. You should see a plain "Quack!" screen, which
confirms the toolchain works.

On a physical iOS device, Expo Go requires both it and the Expo CLI to be signed in to the
same Expo account. Android has no such requirement. If the phone cannot find the bundler at
all, the network is blocking it; use `npx expo start --tunnel` instead.

The map, the Mapbox native module, and the development build that module requires all arrive
with story #19 in Sprint 2. Until then there is nothing to configure and no client tokens to set.

### Run the API

Start Docker, then:

```bash
cd api
./gradlew bootRun        # Windows: .\gradlew.bat bootRun
```

That one command starts a local PostgreSQL + PostGIS container from `api/compose.yaml`,
runs Flyway migrations, and serves the API on port 8080. Check it with:

```bash
curl http://localhost:8080/api/v1/health
# {"status":"up","database":"up"}
```

The first run downloads Gradle and, if your installed JDK is not 25, a JDK 25 toolchain. The
database container keeps running after the API stops; `docker compose -f api/compose.yaml
down` stops it, and adding `-v` also wipes its data.

Run the PostGIS spatial repository integration tests explicitly from the `api` directory:

```powershell
.\gradlew.bat test --tests edu.stevens.quack.location.SpatialRepositoryIT
```

The class contains two cases: one verifies nearby campus locations are within range, and
the other verifies a distant location is outside the requested range. Testcontainers starts
a throwaway PostGIS container for these tests, so Docker must be running.

On macOS or Linux, use:

```bash
./gradlew test --tests edu.stevens.quack.location.SpatialRepositoryIT
```

Run the regular API test suite with `.\gradlew.bat test` on Windows or `./gradlew test` on
macOS or Linux.

### Repository layout

```
api/                     Spring Boot API (Java 25, Spring Boot 4, Gradle wrapper)
  compose.yaml           Local PostgreSQL + PostGIS for development
  src/main/resources/
    application.yml      Configuration; deployed values come from environment variables
    db/migration/        Flyway migrations
client/                  React Native client (Expo SDK 57, TypeScript)
  app.json               Expo config
  App.tsx                Placeholder screen; the map lands with #19
```

## Contributing

This is a semester capstone project for a small, fixed team. Team members should:
1. Create a feature branch off `main` for each story (`git checkout -b feature/short-description`).
2. Commit early and often with clear messages.
3. Open a pull request for review before merging into `main`.
4. Keep the wiki updated as sprints progress (objectives, mid-sprint status, end-sprint status).

---

*Quack! starts small by design — so the team can prove the experience before expanding the vision.*
