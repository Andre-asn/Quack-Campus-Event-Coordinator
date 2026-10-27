package edu.stevens.quack.event;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

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
