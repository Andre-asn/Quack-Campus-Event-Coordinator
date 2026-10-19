# Quack! 🦆 — Campus Event Coordinator

A lightweight, location-first way for students to turn "I'm here" into "come join."

Quack! is a campus-focused web application that helps students discover and organize informal, low-commitment meetups — without the overhead of joining a club or planning days in advance.

---

## Table of Contents
- [Problem](#problem)
- [Vision](#vision)
- [Team](#team)
- [Project Documentation](#project-documentation)
- [Getting Started](#getting-started)

---

## Problem

Campus socializing has a missing middle. "Joining a club" requires schedules, commitment, and planning, while classes only offer brief social windows. Existing tools don't fill that gap:

- **Event platforms** are built for organized, scheduled activities with significant lead time.
- **Group chats and social stories** mostly reach people students already know — they broadcast more than they coordinate.
- **Students already nearby** who want to grab lunch, study, or watch a movie together have no lightweight way to discover each other.

Quack! creates a low-commitment coordination layer for what's happening around campus in the next few hours.

## Team

| Team Member | Role(s) | Primary Responsibilities |
|---|---|---|
| **Andre Santiago-Neyra** | Project Lead; System Architect; Backend Engineer | Coordinates scope, milestones, and team decisions; owns architecture and technical design; leads backend services and API integration. |
| **Pratiksha Vilas Pawar** | Test and Requirements Engineer; DevOps Support; Full-Stack Support | Refines requirements and acceptance criteria; creates functional, regression, edge, and boundary tests; manages defects; supports CI/CD and application integration. |
| **Zhong Zhangniantong** | Backend and Database Engineer; API Developer; DevOps Support | Develops REST APIs and database-driven services; supports scalable system design, containerization, deployment, and technical documentation. |

**Andre Santiago-Neyra** is the project lead and engineering point of contact.

## Project Documentation

- 📖 [Project Wiki](../../wiki) — vision, scope, roles, risks, and assumptions
- 🗂️ [Epics / Features / Stories](../../wiki/epics-features-stories)
- 🧭 [Sprint plans and status updates](../../wiki)

## Getting Started

### 1. Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| **Node** | 22 LTS or newer | The app |
| **JDK** | 25 | The API (backend work only) |
| **Docker** | any current | The local database (backend work only) |

You also need an Expo account in the `quack-stevens-app` organization (for any build) and,
for TestFlight, access to the Apple Developer team. Ask Andre for both.

### 2. Clone and install

```bash
git clone https://github.com/Andre-asn/Quack-Campus-Event-Coordinator.git
cd Quack-Campus-Event-Coordinator/client
npm install
cp .env.example .env
```

### 3. Run the app on your phone (iPhone or Android)

Quack! uses the native Mapbox module, so it runs in a **development build** of the app. Expo
Go cannot load the map.

1. **Mapbox token.** In your Mapbox account, create a public token with only `styles:read`,
   `styles:tiles`, and `fonts:read`. Leave URL restrictions empty; Mapbox cannot restrict a
   token to a mobile app. Then set `client/.env`:

   ```text
   EXPO_PUBLIC_API_BASE_URL=https://quack-api-production.up.railway.app
   EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your-token
   ```

2. **Build the development app.** Once, and again only when native dependencies change. From
   `client`, log in with your `quack-stevens-app` Expo account (`npx eas-cli login`), then:
   - **Android:** `npx eas-cli build --profile development --platform android`, and install
     the APK from the build link.
   - **iPhone:** register the phone once with `npx eas-cli device:create`, then
     `npx eas-cli build --profile development --platform ios`. Install from the build link
     and turn on **Settings → Privacy & Security → Developer Mode** when asked. A newly
     registered phone needs a new build.
3. Start the bundler from `client`: `npm start`.
4. Open **Quack!** on the phone and scan the QR code from inside it. Phone and computer must
   be on the same Wi-Fi; if the phone can't connect, run `npx expo start --tunnel` instead.
5. Sign in with your `@stevens.edu` Google account. It must be on the Google consent
   screen's test-user list; ask Andre to add you. The map opens centered on Stevens.

Restart `npm start` after changing `.env`. Without a token, the app shows **Map unavailable**.

### 4. Run the API locally (backend work only)

1. Get the Google client id and secret from Andre, then `cp api/.env.example api/.env` and
   fill in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
2. Start Docker, then from `api`:

   ```bash
   set -a && source .env && set +a && ./gradlew bootRun
   ```

   On Windows PowerShell:

   ```powershell
   Get-Content .env | ForEach-Object { if ($_ -match '^\s*([^#=]+)=(.*)$') { Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim() } }
   .\gradlew.bat bootRun
   ```

   This starts PostgreSQL + PostGIS from `api/compose.yaml`, runs the Flyway migrations, and
   serves the API on port 8080. Check it: `curl http://localhost:8080/api/v1/health`.
3. To sign in against it, use the **Android emulator** (Google rejects `localhost` callbacks
   from a real phone). Set `EXPO_PUBLIC_API_BASE_URL=http://localhost:8080` in `client/.env`,
   then:

   ```powershell
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:8080 tcp:8080
   npm start
   ```

   With the Android development build installed on the emulator (drag the APK onto it),
   press `a` to open the app. Repeat `adb reverse` after each emulator restart.
4. Run the tests with `./gradlew test` (`.\gradlew.bat test` on Windows). Docker must be
   running; Testcontainers starts a throwaway PostGIS database.

If `java -version` is older than 25, point `JAVA_HOME` at a JDK 25 first. The database keeps
running after the API stops; `docker compose -f api/compose.yaml down -v` stops and wipes it.

### 5. Ship to TestFlight (iPhone)

TestFlight builds run against the production API. EAS builds and signs them in the cloud,
so no Mac is needed. From `client`:

1. Log in: `npx eas-cli login`.
2. Build: `npx eas-cli build --profile production --platform ios`. The first time, sign in to
   Apple when asked and let EAS create the certificate and provisioning profile.
3. Upload: `npx eas-cli submit --platform ios --latest`. If asked for an App Store Connect API
   key, let EAS generate one with the **App Manager** role.
4. When Apple finishes processing (about 10–30 minutes), open App Store Connect → **Quack!** →
   **TestFlight** → **Internal Testing**, add the build, and add testers. Testers must first
   accept an invite under **Users and Access**.
5. Testers install **TestFlight** on their iPhone and install Quack! from it.

Each later release is steps 2 and 3 again; EAS bumps the build number.

### One-time setup (maintainers)

- **Google sign-in** is one OAuth client of type **Web application**. Its authorized
  redirect URIs are `http://localhost:8080/api/v1/auth/callback` and
  `https://quack-api-production.up.railway.app/api/v1/auth/callback`, with no trailing slash.
  Test users are listed on the OAuth consent screen.
- **Railway** production sets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- The allowed email domains are `quack.auth.allowed-email-domains` in
  `api/src/main/resources/application.yml` (default `stevens.edu`). The client never checks
  the domain.
- EAS project: `@quack-stevens-app/quack`. App id on both platforms: `com.quackcampus.app`.
- TestFlight builds can't see `client/.env`, so the Mapbox token lives in EAS (already set).
  To change it, run from `client`:

  ```bash
  npx eas-cli env:set production --name EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN --value pk.your-token --visibility sensitive
  ```

### Repository layout

```
api/                     Spring Boot API (Java 25, Spring Boot 4, Gradle wrapper)
  .env.example           Google client id and secret placeholders
  compose.yaml           Local PostgreSQL + PostGIS for development
  src/main/resources/
    application.yml      Configuration; deployed values come from environment variables
    db/migration/        Flyway migrations
client/                  React Native client (Expo SDK 57, TypeScript)
  app.json               Expo config: EAS project id and the @rnmapbox/maps plugin
  eas.json               EAS profiles: development build and production (TestFlight)
  App.tsx                Loading, sign-in, and map screens
  src/CampusMap.tsx      Mapbox map centered on Stevens, 3D with time-of-day lighting
  .env.example           API base URL and Mapbox token placeholders
```
