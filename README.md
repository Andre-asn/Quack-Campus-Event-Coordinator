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

The client uses the native Mapbox module, so it runs from a **development build** on Android
or iPhone, not Expo Go. Expo Go cannot load the map. TestFlight builds are covered below.

**1. Mapbox token (once per developer).** In your Mapbox account, create a new public token
named for Quack! (not the default public token):

- Scopes: `styles:read`, `styles:tiles`, `fonts:read`. Uncheck every other scope.
- Leave URL restrictions empty. Mapbox's URL restrictions do not apply to requests from
  mobile apps, and Mapbox has no package-name restriction, so the protection is the narrow
  scopes plus a token used only by this app. Rotate it at Mapbox if it leaks.

Copy `client/.env.example` to `client/.env` and set `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` to that
`pk.` token. `.env` is git-ignored. Do not commit it. The app rejects anything that is not a
`pk.` token and shows **Map unavailable** instead of the map. No secret `sk.` download token
is needed; Mapbox no longer requires one to fetch the SDK.

**2. Build the development build (once, and again whenever native dependencies change).**
Builds run on EAS, so no local Android toolchain is needed. The EAS project is
`@quack-stevens-app/quack`; log in with an Expo account that is a member of
`quack-stevens-app`:

```bash
cd client
npx eas-cli login
npx eas-cli build --profile development --platform android
```

The build needs no secrets. When it finishes, EAS prints a link and a QR code for the APK.
Open it on the phone, or download the APK and drag it onto a running emulator, to install
**Quack!**.

For an iPhone, register the phone once, then build. EAS signs the build for the registered
devices, so a new phone needs `device:create` and a fresh build:

```bash
npx eas-cli device:create
npx eas-cli build --profile development --platform ios
```

Open the build link on the iPhone to install it, then turn on **Settings → Privacy & Security
→ Developer Mode** when iOS asks.

**3. Run.** Start the bundler, then open the installed Quack! app:

```bash
cd client
npm install
npm start
```

On a phone, scan the bundler's QR code from inside the Quack! app. If the phone cannot reach
the bundler, use `npx expo start --tunnel`. Sign in, and the map opens centered on Stevens.

The Android emulator is the sign-in target for local checks. With the emulator running:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:8080 tcp:8080
cd client
npm start
```

Press `a` in that window to open the development build on the emulator. Run `adb reverse`
again after every emulator restart. Restart the bundler after changing `client/.env`.
Google sign-in is configured below.

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
macOS or Linux. `./gradlew build` is the full API build, including those integration tests.
Docker must be running. On Windows, if `java -version` is older than 25, set `JAVA_HOME` to
a JDK 25 before Gradle, such as the JetBrains runtime bundled with IntelliJ IDEA.

Flyway runs `V1__enable_postgis.sql` and then `V2__create_users.sql`. A local database
created while the users migration was still `V1` must be recreated:

```bash
docker compose -f api/compose.yaml down -v
```

### Google sign-in

Sign-in is a Google OAuth web client. The API checks the verified email domain. The
allowlist is `quack.auth.allowed-email-domains` in `api/src/main/resources/application.yml`
(default `stevens.edu`). Do not enforce the domain in the client.

1. In Google Cloud, create an OAuth client of type **Web application** in the same project
   as the OAuth consent screen.
2. On the consent screen, set the app name and a support email. While the app is in
   testing, add every account you will use under **Test users**.
3. Under **Authorized redirect URIs**, add this value with no trailing slash:

   ```text
   http://localhost:8080/api/v1/auth/callback
   ```

4. Copy `api/.env.example` to `api/.env` and set `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`. Leave that file uncommitted.

`bootRun` reads those values from the process environment. From `api` on PowerShell:

```powershell
Get-Content .env | ForEach-Object { if ($_ -match '^\s*([^#=]+)=(.*)$') { Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim() } }
.\gradlew.bat bootRun
```

On macOS or Linux: `set -a && source .env && set +a && ./gradlew bootRun`.

Google accepts `http://localhost` as a redirect host. It rejects a private IP such as
`10.0.2.2` or `192.168.x.x`, and it rejects a tunnel hostname you do not own. The emulator
reaches the API through `adb reverse`, so the client base URL stays `http://localhost:8080`.

The production API needs the same Google client. In Railway, set `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` on the production service, and add this redirect URI to the OAuth
client:

```text
https://quack-api-production.up.railway.app/api/v1/auth/callback
```

### iOS on TestFlight

Pull requests deploy to production, and TestFlight builds talk to production
(`https://quack-api-production.up.railway.app`, set in `client/eas.json`). No Mac is needed;
EAS builds and signs in the cloud. The EAS project is `@quack-stevens-app/quack`, and the
bundle identifier is `com.quackcampus.app`.

You need an Expo account that is a member of `quack-stevens-app`, and access to the Apple
Developer Program team. TestFlight builds bundle the app's code on EAS, where `client/.env`
does not exist, so store the Mapbox token in EAS once:

```bash
npx eas-cli env:create --environment production --name EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN --value pk.your-token --visibility sensitive
```

From `client`, the first time:

```bash
npx eas-cli login
npx eas-cli build --profile production --platform ios
```

EAS asks you to sign in to Apple, registers the bundle identifier, and creates the
distribution certificate and provisioning profile. Let it manage them. When the build
finishes, upload it:

```bash
npx eas-cli submit --platform ios --latest
```

The first submit creates the app in App Store Connect. The store name must be unique across
the App Store, so pick another if **Quack!** is taken; the name on the home screen stays
**Quack!**. After Apple finishes processing, open App Store Connect → the app → **TestFlight**,
add teammates to an internal testing group, and they install the build from the TestFlight
app. Internal testers need no review. External testers need Beta App Review first.

Later builds are the same two commands. EAS increments the build number.

### Device verification

Recorded for stories #24, #25, and #26 on the Android emulator, with
`adb reverse tcp:8080 tcp:8080` and `EXPO_PUBLIC_API_BASE_URL=http://localhost:8080`.
The API integration tests cover the same rules against PostGIS. This table is the device
record: what was checked, and the result that counts as a pass.

| Check | Action | Recorded result |
|---|---|---|
| Sign-in | Tap **Sign in with Stevens Google** and finish Google with an `@stevens.edu` test user. | The screen shows **Signed in as** the account name and the Stevens email. |
| Domain rejection | Sign in with a verified Google account outside `stevens.edu`. | The screen stays signed out and shows **Use a Stevens Google account to sign in.** |
| Session restoration | Force-close Expo Go, then open Quack! again. | The signed-in screen returns without another Google prompt. |
| Logout | Tap **Sign out**. | The screen returns to **Sign in with Stevens Google**. |

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
  App.tsx                Sign-in screen, then the campus map
  src/CampusMap.tsx      Mapbox map centered on Stevens
  .env.example           API base URL and public Mapbox token placeholders
```

## Contributing

This is a semester capstone project for a small, fixed team. Team members should:
1. Create a feature branch off `main` for each story (`git checkout -b feature/short-description`).
2. Commit early and often with clear messages.
3. Open a pull request for review before merging into `main`.
4. Keep the wiki updated as sprints progress (objectives, mid-sprint status, end-sprint status).

---

*Quack! starts small by design — so the team can prove the experience before expanding the vision.*
