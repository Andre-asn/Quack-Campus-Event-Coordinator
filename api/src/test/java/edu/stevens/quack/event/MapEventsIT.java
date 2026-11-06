package edu.stevens.quack.event;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.client.RestTestClient;
import org.springframework.web.util.UriBuilder;

import edu.stevens.quack.PostgresIntegrationTest;
import edu.stevens.quack.auth.AuthService;
import edu.stevens.quack.auth.GoogleIdentity;
import edu.stevens.quack.auth.HandoffCodes;
import edu.stevens.quack.user.User;
import edu.stevens.quack.user.UserRepository;

@AutoConfigureRestTestClient
class MapEventsIT extends PostgresIntegrationTest {

    private static final ZoneId CAMPUS = EventService.CAMPUS;
    private static final String BBOX = "-74.03,40.74,-74.02,40.75";

    @Autowired
    RestTestClient client;

    @Autowired
    AuthService authService;

    @Autowired
    HandoffCodes handoffCodes;

    @Autowired
    EventRepository events;

    @Autowired
    UserRepository users;

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void clean() {
        jdbc.update("delete from event_attendance");
        jdbc.update("delete from events");
        users.deleteAll();
    }

    @Test
    void requiresASession() {
        client.get().uri(mapUri(BBOX, startOfToday(), startOfTomorrow(), 50, null))
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    void returnsPinsInsideTheBoxIncludingTheEdge() {
        User host = host("ada");
        Instant today = noonToday();
        save(host, "Inside", 40.745, -74.025, today);
        save(host, "North edge", 40.75, -74.025, today);
        save(host, "South edge", 40.74, -74.025, today);
        save(host, "Outside", 40.751, -74.025, today);

        client.get().uri(mapUri(BBOX, startOfToday(), startOfTomorrow(), 50, null))
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.events.length()").isEqualTo(3)
                .jsonPath("$.events[?(@.title == 'Outside')]").isEmpty()
                .jsonPath("$.events[?(@.title == 'North edge')]").isNotEmpty()
                .jsonPath("$.events[?(@.title == 'South edge')]").isNotEmpty()
                .jsonPath("$.events[0].description").doesNotExist()
                .jsonPath("$.events[0].host.avatarUrl").isEqualTo("https://example.test/ada.png")
                .jsonPath("$.nextCursor").doesNotExist();
    }

    @Test
    void returnsAnEmptyPageWhenTheViewportHasNoEvents() {
        User host = host("ada");
        save(host, "Outside", 40.751, -74.025, noonToday());

        client.get().uri(mapUri(BBOX, startOfToday(), startOfTomorrow(), 50, null))
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.events.length()").isEqualTo(0);
    }

    @Test
    void excludesLinkOnlyEventsEvenForTheHost() {
        User host = host("ada");
        Instant today = noonToday();
        Event hidden = save(host, "Private table", 40.745, -74.025, today);
        jdbc.update("update events set visibility = 'link_only' where id = ?", hidden.getId());
        save(host, "Public table", 40.746, -74.025, today);

        client.get().uri(mapUri(BBOX, startOfToday(), startOfTomorrow(), 50, null))
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.events.length()").isEqualTo(1)
                .jsonPath("$.events[0].title").isEqualTo("Public table");
    }

    @Test
    void returnsEventsInsideTheHalfOpenRange() {
        User host = host("ada");
        Instant from = startOfToday();
        Instant to = startOfTomorrow();
        save(host, "Before from", 40.745, -74.025, from.minusSeconds(1));
        save(host, "At from", 40.745, -74.024, from);
        save(host, "Before to", 40.746, -74.025, to.minusSeconds(1));
        save(host, "At to", 40.746, -74.024, to);

        client.get().uri(mapUri(BBOX, from, to, 50, null))
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.events.length()").isEqualTo(2)
                .jsonPath("$.events[0].title").isEqualTo("At from")
                .jsonPath("$.events[1].title").isEqualTo("Before to")
                .jsonPath("$.events[?(@.title == 'Before from')]").isEmpty()
                .jsonPath("$.events[?(@.title == 'At to')]").isEmpty();
    }

    @Test
    void rejectsDatesOutsideYesterdayTodayAndTomorrow() {
        User host = host("ada");
        Instant tooEarly = startOfToday().minus(3, ChronoUnit.DAYS);

        client.get().uri(mapUri(BBOX, tooEarly, tooEarly.plus(1, ChronoUnit.HOURS), 50, null))
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .exchange()
                .expectStatus().isEqualTo(422)
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.code").isEqualTo("DATE_OUT_OF_RANGE");
    }

    @Test
    void pagesWithACursorInsteadOfABareArray() {
        User host = host("ada");
        Instant today = noonToday();
        save(host, "First", 40.745, -74.025, today);
        save(host, "Second", 40.746, -74.025, today.plusSeconds(60));
        String session = sessionFor(host);

        MapPage first = client.get().uri(mapUri(BBOX, startOfToday(), startOfTomorrow(), 1, null))
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + session)
                .exchange()
                .expectStatus().isOk()
                .expectBody(MapPage.class)
                .returnResult()
                .getResponseBody();

        assertThat(first).isNotNull();
        assertThat(first.events()).hasSize(1);
        assertThat(first.nextCursor()).isNotBlank();

        client.get().uri(mapUri(BBOX, startOfToday(), startOfTomorrow(), 1, first.nextCursor()))
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + session)
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.events.length()").isEqualTo(1)
                .jsonPath("$.events[0].title").isEqualTo("Second")
                .jsonPath("$.nextCursor").doesNotExist();
    }

    @Test
    void returnsNotModifiedWhenTheEtagMatches() {
        User host = host("ada");
        save(host, "Inside", 40.745, -74.025, noonToday());
        var uri = mapUri(BBOX, startOfToday(), startOfTomorrow(), 50, null);

        String etag = client.get().uri(uri)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .exchange()
                .expectStatus().isOk()
                .expectHeader().exists(HttpHeaders.ETAG)
                .returnResult(Void.class)
                .getResponseHeaders()
                .getFirst(HttpHeaders.ETAG);

        client.get().uri(uri)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .header(HttpHeaders.IF_NONE_MATCH, etag)
                .exchange()
                .expectStatus().isNotModified()
                .expectBody().isEmpty();

        client.get().uri(uri)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .header(HttpHeaders.IF_NONE_MATCH, "*")
                .exchange()
                .expectStatus().isNotModified()
                .expectBody().isEmpty();
    }

    @Test
    void returnsSevenEventsAtOneLocation() {
        User host = host("ada");
        Instant today = noonToday();
        for (int i = 0; i < 7; i++) {
            save(host, "Table " + i, 40.745, -74.025, today.plusSeconds(i));
        }

        client.get().uri(mapUri(BBOX, startOfToday(), startOfTomorrow(), 50, null))
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.events.length()").isEqualTo(7)
                .jsonPath("$.events[0].host.avatarUrl").isEqualTo("https://example.test/ada.png")
                .jsonPath("$.events[6].latitude").isEqualTo(40.745)
                .jsonPath("$.events[6].longitude").isEqualTo(-74.025);
    }

    @Test
    void rejectsAMalformedBoundingBox() {
        User host = host("ada");

        client.get().uri(mapUri("nope", startOfToday(), startOfTomorrow(), 50, null))
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.code").isEqualTo("MALFORMED_REQUEST");
    }

    @Test
    void returnsTheLocationLabelAndAttendeeCountBeforeAndAfterAJoinAndLeave() {
        User host = host("ada");
        Event event = joinable(save(host, "Inside", 40.745, -74.025, noonToday()));
        String guest = sessionFor(host("grace"));
        var uri = mapUri(BBOX, startOfToday(), startOfTomorrow(), 50, null);

        client.get().uri(uri)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + guest)
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.events[0].locationLabel").isEqualTo("Library")
                .jsonPath("$.events[0].attendeeCount").isEqualTo(0);

        client.put().uri("/api/v1/events/{id}/attendance", event.getId())
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + guest)
                .exchange()
                .expectStatus().is2xxSuccessful();

        client.get().uri(uri)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + guest)
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.events[0].attendeeCount").isEqualTo(1);

        client.delete().uri("/api/v1/events/{id}/attendance", event.getId())
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + guest)
                .exchange()
                .expectStatus().is2xxSuccessful();

        client.get().uri(uri)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + guest)
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.events[0].attendeeCount").isEqualTo(0);
    }

    @Test
    void changesTheEtagWhenSomeoneJoins() {
        User host = host("ada");
        Event event = joinable(save(host, "Inside", 40.745, -74.025, noonToday()));
        String guest = sessionFor(host("grace"));
        var uri = mapUri(BBOX, startOfToday(), startOfTomorrow(), 50, null);

        String before = client.get().uri(uri)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + guest)
                .exchange()
                .expectStatus().isOk()
                .returnResult(Void.class)
                .getResponseHeaders()
                .getFirst(HttpHeaders.ETAG);

        client.put().uri("/api/v1/events/{id}/attendance", event.getId())
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + guest)
                .exchange()
                .expectStatus().is2xxSuccessful();

        String after = client.get().uri(uri)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + guest)
                .header(HttpHeaders.IF_NONE_MATCH, before)
                .exchange()
                .expectStatus().isOk()
                .returnResult(Void.class)
                .getResponseHeaders()
                .getFirst(HttpHeaders.ETAG);

        assertThat(after).isNotNull().isNotEqualTo(before);
    }

    @Test
    void changesTheEtagWhenSomeoneLeaves() {
        User host = host("ada");
        Event event = joinable(save(host, "Inside", 40.745, -74.025, noonToday()));
        String guest = sessionFor(host("grace"));
        var uri = mapUri(BBOX, startOfToday(), startOfTomorrow(), 50, null);
        join(event, guest);
        String before = etag(uri, guest);

        client.delete().uri("/api/v1/events/{id}/attendance", event.getId())
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + guest)
                .exchange()
                .expectStatus().is2xxSuccessful();

        assertThat(etag(uri, guest)).isNotNull().isNotEqualTo(before);
    }

    @Test
    void changesTheEtagWhenTheLocationLabelChanges() {
        User host = host("ada");
        Event event = save(host, "Inside", 40.745, -74.025, noonToday());
        String session = sessionFor(host);
        var uri = mapUri(BBOX, startOfToday(), startOfTomorrow(), 50, null);
        String before = etag(uri, session);

        jdbc.update("update events set location_label = 'Library, 3rd floor' where id = ?", event.getId());

        client.get().uri(uri)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + session)
                .header(HttpHeaders.IF_NONE_MATCH, before)
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.events[0].locationLabel").isEqualTo("Library, 3rd floor");
        assertThat(etag(uri, session)).isNotEqualTo(before);
    }

    @Test
    void countsEachAttendeeOnceIncludingARepeatedJoin() {
        User host = host("ada");
        Event event = joinable(save(host, "Inside", 40.745, -74.025, noonToday()));
        String grace = sessionFor(host("grace"));
        String alan = sessionFor(host("alan"));
        join(event, grace);
        join(event, grace);
        join(event, alan);

        client.get().uri(mapUri(BBOX, startOfToday(), startOfTomorrow(), 50, null))
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + grace)
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.events[0].attendeeCount").isEqualTo(2);
    }

    // CLAUDE.md edge case: simultaneous joins.
    @Test
    void countsSimultaneousJoins() throws Exception {
        User host = host("ada");
        Event event = joinable(save(host, "Inside", 40.745, -74.025, noonToday()));
        List<String> sessions = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            sessions.add(sessionFor(host("guest" + i)));
        }
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(sessions.size());
        try {
            List<Future<?>> joins = new ArrayList<>();
            for (String session : sessions) {
                joins.add(pool.submit(() -> {
                    start.await();
                    join(event, session);
                    return null;
                }));
            }
            start.countDown();
            for (Future<?> join : joins) {
                join.get(30, TimeUnit.SECONDS);
            }
        } finally {
            pool.shutdownNow();
        }

        client.get().uri(mapUri(BBOX, startOfToday(), startOfTomorrow(), 50, null))
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessions.get(0))
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.events[0].attendeeCount").isEqualTo(8);
    }

    private void join(Event event, String session) {
        client.put().uri("/api/v1/events/{id}/attendance", event.getId())
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + session)
                .exchange()
                .expectStatus().is2xxSuccessful();
    }

    private String etag(java.util.function.Function<UriBuilder, URI> uri, String session) {
        return client.get().uri(uri)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + session)
                .exchange()
                .expectStatus().isOk()
                .returnResult(Void.class)
                .getResponseHeaders()
                .getFirst(HttpHeaders.ETAG);
    }

    // CLAUDE.md: map queries return in under 500 ms at p95 with 2,000 seeded events.
    @Test
    void answersWithinTheLatencyTargetWithTwoThousandSeededEventsAndAttendees() throws Exception {
        jdbc.execute(Files.readString(Path.of("scripts/seed-events.sql")));
        // Five attendees on every event, never its own host (the API never auto-joins a host).
        jdbc.update("""
                insert into event_attendance (event_id, user_id)
                select e.id, u.id
                from events e
                cross join lateral (
                    select id from users where is_seed and id <> e.host_id order by id limit 5) u
                on conflict do nothing
                """);
        String session = sessionFor(host("ada"));
        // The whole campus, today, a full page.
        var uri = mapUri("-74.035,40.735,-74.015,40.755", startOfToday(), startOfTomorrow(), 100, null);

        for (int i = 0; i < 5; i++) {
            get(uri, session);
        }
        long[] millis = new long[40];
        for (int i = 0; i < millis.length; i++) {
            long start = System.nanoTime();
            get(uri, session);
            millis[i] = (System.nanoTime() - start) / 1_000_000;
        }
        Arrays.sort(millis);
        long p95 = millis[(int) Math.ceil(millis.length * 0.95) - 1];
        assertThat(p95).as("p95 map query latency in ms").isLessThan(500);
    }

    // Noon today has ended by mid-afternoon, and an ended event refuses joins (409), so push the end out.
    private Event joinable(Event event) {
        jdbc.update("update events set ends_at = now() + interval '1 day' where id = ?", event.getId());
        return event;
    }

    private void get(java.util.function.Function<UriBuilder, URI> uri, String session) {
        client.get().uri(uri)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + session)
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.events.length()").isEqualTo(100);
    }

    private User host(String name) {
        return authService.signIn(new GoogleIdentity(
                name + "-sub", name + "@stevens.edu", true, name, "https://example.test/" + name + ".png"));
    }

    private Event save(User host, String title, double latitude, double longitude, Instant startsAt) {
        return events.save(Event.create(
                UUID.randomUUID(),
                host.getId(),
                title,
                "Studying for CS102!",
                "study",
                latitude,
                longitude,
                "Library",
                startsAt,
                startsAt.plus(2, ChronoUnit.HOURS),
                Instant.parse("2026-10-21T12:00:00Z")));
    }

    private String sessionFor(User user) {
        SessionBody session = client.post().uri("/api/v1/auth/session")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("handoff", handoffCodes.issue(user.getId())))
                .exchange()
                .expectStatus().isOk()
                .expectBody(SessionBody.class)
                .returnResult()
                .getResponseBody();
        assertThat(session).isNotNull();
        return session.sessionId();
    }

    private static Instant startOfToday() {
        return LocalDate.now(CAMPUS).atStartOfDay(CAMPUS).toInstant();
    }

    private static Instant startOfTomorrow() {
        return LocalDate.now(CAMPUS).plusDays(1).atStartOfDay(CAMPUS).toInstant();
    }

    private static Instant noonToday() {
        return LocalDate.now(CAMPUS).atTime(12, 0).atZone(CAMPUS).toInstant();
    }

    private static java.util.function.Function<UriBuilder, URI> mapUri(
            String bbox, Instant from, Instant to, int limit, String cursor) {
        return builder -> {
            builder.path("/api/v1/events")
                    .queryParam("bbox", bbox)
                    .queryParam("from", from.toString())
                    .queryParam("to", to.toString())
                    .queryParam("limit", Integer.toString(limit));
            if (cursor != null) {
                builder.queryParam("cursor", cursor);
            }
            return builder.build();
        };
    }

    record SessionBody(String sessionId) {
    }

    record MapPage(java.util.List<Object> events, String nextCursor) {
    }
}
