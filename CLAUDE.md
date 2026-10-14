# Quack!
 
Campus meetup app for Stevens students. A student pins an event on the campus map with a
time and one line of detail ("Studying for CS102!"); nearby students see it and join.
Semester project: 14 weeks, 4 people, one campus (Stevens), one client platform.
 
Problem statement, scope, and timeline live in `docs/overview.md`. The Quack! Technical
Design doc is the source of truth for architecture, data model, and API. GitHub issues are
the source of truth for what to build next. If any of these disagree, stop and ask.
 
## Commands
 
<!-- Fill these in once #18 and #19 land. -->
 
Prerequisites: JDK 25, Node, Docker. Nothing else installed globally; the API builds
through the committed wrapper.
 
- Run API locally: `cd api && ./gradlew bootRun` (Docker running). Starts PostGIS from
  `api/compose.yaml` and serves `GET /api/v1/health` on port 8080.
- Run client: `cd client && npm install && npm start`, then scan the QR code with Expo
  Go. The development build that the Mapbox native module needs arrives with #19
  in Sprint 2.
- Test: `cd api && ./gradlew test` (Docker running, for Testcontainers)
- Lint:
- Deploy: merging to `main` deploys the API via GitHub Actions. Never deploy by hand.
## Stack
 
Decided. Do not swap, add, or remove any of these without asking.
 
| Layer       | Choice                                                              |
| ----------- | ------------------------------------------------------------------- |
| Client      | React Native, TypeScript, native Mapbox module (`@rnmapbox/maps`)   |
| API         | Java 25, Spring Boot 4, Spring Web                                  |
| Persistence | Spring Data JPA, Flyway, hibernate-spatial (JTS types)              |
| Database    | PostgreSQL with PostGIS, hosted on Railway                          |
| Auth        | `spring-boot-starter-oauth2-client` against Google, domain allowlist |
| API hosting | Railway service, same project as the database                       |
| CI          | GitHub Actions                                                      |
| Tests       | JUnit 5, Spring Boot test slices, Testcontainers with PostGIS       |
 
The client runs from a development build on a device or simulator, because the native
Mapbox module does not work without one.
 
Architecture is three tiers: client, one stateless Spring Boot API, one Postgres. No
queues, caches, workers, WebSockets, or microservices. Polling and refetch on navigation
are how data stays fresh.
 
## Work tracking
 
Work is tracked as GitHub issues in three levels, all on the project board:
 
- `[Epic]`, label `epic`: a product area. Never worked on directly.
- `[Feature]`, label `feature`: a slice of an epic, assigned to a sprint milestone.
- `[Story]`, label `user story` plus `P0` or `P1`: the unit of work. One story, one
  branch, one pull request. Its acceptance criteria are the definition of done.
| Epic                            | Features (sprint)                                                        | Design doc  |
| ------------------------------- | ------------------------------------------------------------------------ | ----------- |
| #3 Platform and Automation      | #8 Repository and build setup (S1), #9 CI and deployment (S1)            | n/a         |
| #4 Identity and Access          | #10 Stevens Google sign-in (S1), #11 Event visibility (S3)               | F1, F7      |
| #5 Event Creation and Hosting   | #12 Create an event (S2), #13 Host controls (S3)                         | F2, F6      |
| #6 Discovery and Participation  | #14 Map discovery (S2), #15 Event detail and participation (S3)          | F3, F4, F5  |
| #7 History and Insight          | #16 Date stepper (S4), #17 Host statistics (S4)                          | F8, F9      |
 
Stories written so far:
 
Sprint 1 is boilerplate and sign-in only. Nothing map-related, including the Mapbox
module and #19, starts before Sprint 2.

- #8 setup: #18 run the API locally with one command, #19 run the client from a
  development build with a working map (Sprint 2)
- #9 CI/CD: #20 PRs run build and tests, #21 integration tests on PostGIS via
  Testcontainers, #22 merging to main deploys the API, #23 new issues added to the board
  automatically (P1)
- #10 sign-in: #24 sign in with a Stevens Google account, #25 reject accounts outside
  stevens.edu, #26 session persists between app launches
Features #11 to #17 have no stories yet. Do not invent their scope; ask for the story.
 
## Priorities
 
Product priority follows the design doc. Do not start P1 product work while P0 product
work is unfinished.
 
- P0, the core loop: sign in (F1), create an event (F2), map discovery (F3), event detail
  with attendees (F4), join and leave (F5)
- P1, after the loop works end to end: host edit and cancel (F6), visibility (F7), date
  stepper (F8), host view and join counts (F9)
- P2, do not build without asking: profiles, interests, friends list, personal invites,
  category and distance filters, attendance caps, notifications on edit or cancel, report
  and block, activity heatmap
Out of scope for this semester: messaging, social feeds, payments, ticketing, recurring
events, check-in, ratings, moderation and admin dashboards, real-time push, offline
support, multi-campus tenancy, direct Stevens Okta integration, geocoding.
 
## Rules
 
- Every change traces to a `[Story]` issue. If a request implies work no story covers,
  say so before writing code.
- Do not add a runtime dependency without asking.
- Secrets live in `.env` locally and in platform environment variables when deployed,
  never in the repo. This includes the Mapbox token. Flag any key that appears in a diff.
- Never store passwords. Personal data is limited to email, display name, avatar URL, and
  provider subject id.
- Do not log precise coordinates next to a user id.
- Do not add analytics or third-party tracking.
- Keep the seed script working. An empty map demos badly.
## Backend conventions
 
- Keep Spring shallow: controller, service, repository. No single-implementation
  interfaces, DTO mapper frameworks, or abstract base services.
- Controllers validate and map requests. Services own business rules and all
  authorization, so a new controller cannot bypass it. Repositories own queries.
- No business logic in database triggers or stored procedures.
- Schema changes go through a new Flyway migration. Never edit a merged migration.
  Migrations run on startup, never by hand.
- The API exposes a health endpoint.
- Users are keyed on `(provider, provider_subject_id)`, not email. A user record is created
  on first sign-in only.
- The domain check runs server side on the ID token and requires `email_verified`. Never
  check the domain in client code. The allowlist is configuration, not a constant.
- Seed users have `is_seed = true` and can never sign in.
- Keep the JVM max heap set explicitly and under 512 MB.
## Data model
 
- `User`: id, provider, provider_subject_id, email, email_domain, display_name,
  avatar_url, is_seed, created_at, last_login_at
- `Event`: id, host_id, title, description, category, location, location_label,
  starts_at, visibility, share_token, status, created_at, updated_at
- `EventAttendance`: event_id, user_id (unique together), joined_at. Leave deletes the row.
- `EventView`: event_id, viewer_id, viewed_at
Details that matter:
 
- `location` is `geography(Point, 4326)` with a GiST index. The API speaks latitude and
  longitude as separate numbers; conversion happens at the persistence boundary.
- `starts_at` is stored in UTC and indexed.
- Cancelling sets `status = cancelled`. Events are never hard deleted.
- Category statistics are a `GROUP BY` query. No counter or rollup tables.
## API conventions
 
- REST over HTTPS, JSON, every path under `/api/v1`, RFC 3339 UTC timestamps.
- Errors are RFC 9457 Problem Details (`application/problem+json`) with a stable `code`
  field. Use Spring's `ProblemDetail`.
- Status codes: 400 malformed, 401 unauthenticated, 403 forbidden, 404 not found or not
  visible, 409 conflict, 422 semantically invalid.
- Join is `PUT /events/{id}/attendance`, leave is `DELETE` on the same path. A duplicate
  join from the unique constraint is treated as success.
- Cancel is `POST /events/{id}/cancel`.
- `bbox` is `west,south,east,north`, passed through from Mapbox unchanged.
- Lists return an object with a cursor (`limit` in, `nextCursor` out), never a bare array.
- The map query returns an ETag and honours `If-None-Match`.
- The OpenAPI spec is generated by springdoc and committed.
Visibility and authorization:
 
- Link-only events never appear in the map query, even for the host.
- A link-only event without a valid `share_token` returns 404, not 403.
- Everyone sees the attendee count. Only attendees see names; the attendee list returns
  403 otherwise.
- Only the host can edit or cancel. Started events can be edited; cancelled ones cannot.
Validation:
 
- Start time at most 48 hours ahead.
- Description at most 140 characters.
- Category required: `study`, `food`, `sports`, `games`, `movie`, `music`, `other`.
- Coordinates inside the Stevens campus bounding box. Dorms count as on campus.
- Map query dates limited to yesterday, today, or tomorrow.
View counting (F9): a view is logged on detail fetch, once per viewer per event per day,
and the host's own views are excluded.
 
## Client conventions
 
- The map is the home screen and opens centered on Stevens. Mount it once; detail, create,
  and lists are sheets over it, not separate screens.
- The viewport bounding box drives every event query. Debounce requests while panning.
- No geocoding. Hosts type `location_label` themselves.
- Create is one screen: location from the map center, time defaulting to the next hour,
  one line of text. Posting takes under 30 seconds.
- Joins update optimistically.
- Overlapping events show three host-avatar bubbles plus a "..." bubble that opens a
  Show all list.
- A list view backs up the map. Every control has an accessibility label.
- Server state is fetched per screen and refetched on navigation. Only the session is
  global state, and it survives an app restart.
- Use a scoped, provider-restricted Mapbox token read from configuration.
## Testing
 
- Integration tests run against real PostGIS via Testcontainers, locally and in CI. Never
  use H2 or another in-memory database.
- Every story ships with tests for its acceptance criteria. Cover every cell of the
  visibility and authorization matrix.
- Edge cases to keep covered: events on the bbox edge, events starting now, simultaneous
  joins, cancelled events with attendees, empty viewports, seven events at one spot,
  tampered share tokens, non-stevens.edu Google accounts.
- Map queries must return in under 500 ms at p95 with 2,000 seeded events.
## Vocabulary
 
Use these exact terms in code, UI copy, and commit messages:
 
- `Event` is the posted thing. "Pin" appears only in UI copy about the map. Never
  "meetup", "party", or "activity" as a type name.
- `host` is the creator. Not "organizer", not "owner".
- `attendee` is someone who joined. Not "guest", not "participant". The join record is
  `attendance`.
- `visibility` is `public` or `link_only`. There is no third value.
- `status` is `active` or `cancelled`.
- Joining is reversible: `join` and `leave`. Never "RSVP".
## Git
 
- One branch per story issue, named with its number: `24-stevens-google-sign-in`.
- Reference the issue in the commit subject (`#24 Add OAuth callback`) and close it from
  the pull request body (`Closes #24`).
- No direct pushes to `main`. Failing checks block merge, and every pull request needs one
  approving review.
## Do not guess on these
 
Decided: Android is the platform we build, test, and demo on this semester. An iOS profile
can be added later; iOS would need an Apple Developer membership and a physical device,
since nobody on the team has a Mac.
 
Still open. Ask the team rather than picking an answer:
 
- How the session is held on the device, given the design doc specifies an httpOnly cookie
- Pin granularity: exact coordinates, or snapped to named campus locations
- Whether a host can remove a past event from the day-back view
- The final category list, which must be agreed before the first migration
