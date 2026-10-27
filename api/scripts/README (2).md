# Issue #45: campus event data

These files target main commit 5b38620d229dc77bf84533c5dfaa8fe822e9e681.
Run only against your local development database, after starting the API once
so Flyway creates the schema. No migration or auth change is needed:
`AuthService.signIn` already rejects seed accounts and `AuthServiceIT.seedAccountCannotSignIn`
covers that behavior.

From the repository root, with Docker running:

```sh
docker compose -f api/compose.yaml up -d
```

Start the API in a separate terminal:

```sh
cd api
./gradlew bootRun
```

Seed from the repository root (works in PowerShell and Bash):

```sh
docker compose -f api/compose.yaml cp api/scripts/seed-events.sql postgres:/tmp/quack-seed.sql
docker compose -f api/compose.yaml exec -T postgres psql -U quack -d quack --single-transaction -v ON_ERROR_STOP=1 -f /tmp/quack-seed.sql
```

Run the same seed command twice. It keeps 2,000 stable event IDs and 20 seed
accounts, updates event dates relative to America/New_York, and preserves other
records. All seven category values are represented on all three days. Seven named
campus landmarks use approximate outdoor coordinates, with many exact overlaps.
These are fictional demo events, not real scheduled campus events. Accounts use
example.invalid email addresses, provider=seed, and is_seed=true. A transaction
and advisory lock prevent partial or interleaved seed runs. ID collisions with
non-demo hosts fail instead of overwriting their events.

Run integration tests (JDK 25 and Docker required):

```sh
cd api
./gradlew test --tests '*SeedEventsIT' --tests '*AuthServiceIT' --tests '*MapEventsIT'
```

On Windows use `gradlew.bat` in place of `./gradlew`.

For the performance criterion, seed your local database, sign in using your real
Stevens account, and obtain your current session ID from your own local client.
Keep it private. The seed accounts cannot be used for this.

PowerShell (from repository root):

```powershell
$env:QUACK_COOKIE = 'JSESSIONID=YOUR_SESSION_ID'
python api/scripts/benchmark-map.py
Remove-Item Env:QUACK_COOKIE
```

Bash:

```sh
QUACK_COOKIE='JSESSIONID=YOUR_SESSION_ID' python3 api/scripts/benchmark-map.py
```

Python 3.9+ with IANA timezone data is required. On Windows, if ZoneInfo reports
missing timezone data, install `tzdata` into your local Python environment.
The benchmark measures authenticated, uncached HTTP first pages at limit=100
for the entire campus, separately for yesterday, today, and tomorrow. Each day
has 20 warmups and 100 timed requests; nearest-rank p95 must be below 500ms for
each day. It checks non-empty seeded responses and nextCursor; HTTP errors and
timeouts fail the run. It measures transport through response-body receipt,
excluding JSON parsing. This is a sequential warm benchmark, not a concurrency
or full-pagination load test. Record machine, environment, and output in the PR.

Validation status: source and whitespace checks completed. Integration tests and
benchmark have NOT run here: Gradle download is blocked by network access;
this workspace also lacks JDK 25 and Docker/PostGIS. Do not mark the performance
acceptance criterion complete until you have real measured passing output.

Suggested PR title: #45 Seed realistic campus events
PR body: Adds repeatable development seed SQL, a PostGIS integration test, and
an authenticated HTTP p95 benchmark. Existing seed sign-in protections are reused.
Attach the successful test/benchmark output before claiming Closes #45.
