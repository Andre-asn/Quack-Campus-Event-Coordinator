package edu.stevens.quack.event;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
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

import edu.stevens.quack.PostgresIntegrationTest;
import edu.stevens.quack.auth.AuthService;
import edu.stevens.quack.auth.GoogleIdentity;
import edu.stevens.quack.auth.HandoffCodes;
import edu.stevens.quack.user.User;

@AutoConfigureRestTestClient
class Sprint4IT extends PostgresIntegrationTest {

    @Autowired
    RestTestClient client;

    @Autowired
    AuthService authService;

    @Autowired
    HandoffCodes handoffCodes;

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void clean() {
        jdbc.update("delete from event_announcement");
        jdbc.update("delete from event_reminder");
        jdbc.update("delete from event_attendance");
        jdbc.update("delete from events");
        jdbc.update("delete from users");
    }

    @Test
    void startingSoonIsComputedOnTheServerAndClearsOnceStarted() {
        User host = signIn("ada");
        UUID soon = create(host, Instant.now().plus(30, ChronoUnit.MINUTES), Instant.now().plus(2, ChronoUnit.HOURS));
        UUID later = create(host, Instant.now().plus(3, ChronoUnit.HOURS), Instant.now().plus(4, ChronoUnit.HOURS));
        UUID started = create(host, Instant.now().plus(2, ChronoUnit.HOURS), Instant.now().plus(3, ChronoUnit.HOURS));
        jdbc.update("update events set starts_at = ? where id = ?",
                java.sql.Timestamp.from(Instant.now().minus(10, ChronoUnit.MINUTES)), started);

        map(host)
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.events[?(@.id == '" + soon + "' && @.startingSoon == true)]").isNotEmpty()
                .jsonPath("$.events[?(@.id == '" + later + "' && @.startingSoon == true)]").isEmpty()
                .jsonPath("$.events[?(@.id == '" + started + "' && @.startingSoon == true)]").isEmpty();

        client.get().uri("/api/v1/events/{id}", soon)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.startingSoon").isEqualTo(true)
                .jsonPath("$.hosting").isEqualTo(true);
    }

    @Test
    void aFreeWindowKeepsOnlyEventsThatFitInsideItAndTheDay() {
        User host = signIn("ada");
        Instant start = Instant.now().plus(2, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);
        UUID fits = create(host, start, start.plus(1, ChronoUnit.HOURS));
        UUID runsLate = create(host, start, start.plus(3, ChronoUnit.HOURS));

        map(host, start.minus(30, ChronoUnit.MINUTES), start.plus(90, ChronoUnit.MINUTES))
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.events[?(@.id == '" + fits + "')]").isNotEmpty()
                .jsonPath("$.events[?(@.id == '" + runsLate + "')]").isEmpty();

        map(host)
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.events[?(@.id == '" + fits + "')]").isNotEmpty()
                .jsonPath("$.events[?(@.id == '" + runsLate + "')]").isNotEmpty();

        client.get().uri(builder -> builder.path("/api/v1/events")
                        .queryParam("bbox", "-74.03,40.74,-74.02,40.75")
                        .queryParam("from", start.minus(1, ChronoUnit.HOURS).toString())
                        .queryParam("to", start.plus(1, ChronoUnit.HOURS).toString())
                        .queryParam("freeFrom", start.toString())
                        .build())
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.code").isEqualTo("MALFORMED_REQUEST");

        client.get().uri(builder -> builder.path("/api/v1/events")
                        .queryParam("bbox", "-74.03,40.74,-74.02,40.75")
                        .queryParam("from", start.minus(1, ChronoUnit.HOURS).toString())
                        .queryParam("to", start.plus(1, ChronoUnit.HOURS).toString())
                        .queryParam("freeFrom", start.plus(1, ChronoUnit.HOURS).toString())
                        .queryParam("freeTo", start.toString())
                        .build())
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .exchange()
                .expectStatus().isEqualTo(422)
                .expectBody()
                .jsonPath("$.code").isEqualTo("INVALID_RANGE");
    }

    @Test
    void onlyTheHostPostsAnnouncementsAndEveryoneWhoCanSeeTheEventReadsThemNewestFirst() {
        User host = signIn("ada");
        User attendee = signIn("bea");
        UUID id = create(host, Instant.now().plus(2, ChronoUnit.HOURS), Instant.now().plus(3, ChronoUnit.HOURS));

        post(attendee, id, "I will bring snacks")
                .expectStatus().isForbidden()
                .expectBody()
                .jsonPath("$.code").isEqualTo("NOT_HOST");

        post(host, id, "Room changed to Babbio 122")
                .expectStatus().isOk();
        post(host, id, "Bring a laptop")
                .expectStatus().isOk();

        client.get().uri("/api/v1/events/{id}/announcements", id)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(attendee))
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.announcements[0].body").isEqualTo("Bring a laptop")
                .jsonPath("$.announcements[0].createdAt").exists()
                .jsonPath("$.announcements[1].body").isEqualTo("Room changed to Babbio 122")
                .jsonPath("$.announcements[0].email").doesNotExist();

        UUID linkOnly = create(host, Instant.now().plus(2, ChronoUnit.HOURS),
                Instant.now().plus(3, ChronoUnit.HOURS), "link_only");
        client.get().uri("/api/v1/events/{id}/announcements", linkOnly)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .exchange()
                .expectStatus().isNotFound()
                .expectBody()
                .jsonPath("$.code").isEqualTo("EVENT_NOT_FOUND");

        client.post().uri("/api/v1/events/{id}/cancel", id)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .exchange()
                .expectStatus().isOk();
        post(host, id, "Too late")
                .expectStatus().isEqualTo(409)
                .expectBody()
                .jsonPath("$.code").isEqualTo("EVENT_CANCELLED");
    }

    @Test
    void remindersFollowJoinLeaveAndCancel() {
        User host = signIn("ada");
        User student = signIn("bea");
        UUID id = create(host, Instant.now().plus(2, ChronoUnit.HOURS), Instant.now().plus(3, ChronoUnit.HOURS));

        client.put().uri("/api/v1/events/{id}/reminder", id)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(student))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("leadMinutes", 15))
                .exchange()
                .expectStatus().isEqualTo(409)
                .expectBody()
                .jsonPath("$.code").isEqualTo("NOT_ATTENDING");

        client.put().uri("/api/v1/events/{id}/attendance", id)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(student))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of())
                .exchange()
                .expectStatus().isOk();

        client.put().uri("/api/v1/events/{id}/reminder", id)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(student))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("leadMinutes", 60))
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.leadMinutes").isEqualTo(60);

        client.delete().uri("/api/v1/events/{id}/attendance", id)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(student))
                .exchange()
                .expectStatus().isNoContent();
        assertThat(jdbc.queryForObject("select count(*) from event_reminder where event_id = ?", Integer.class, id))
                .isZero();

        client.put().uri("/api/v1/events/{id}/attendance", id)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(student))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of())
                .exchange()
                .expectStatus().isOk();
        client.put().uri("/api/v1/events/{id}/reminder", id)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(student))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("leadMinutes", 15))
                .exchange()
                .expectStatus().isOk();

        client.post().uri("/api/v1/events/{id}/cancel", id)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .exchange()
                .expectStatus().isOk();
        assertThat(jdbc.queryForObject("select count(*) from event_reminder where event_id = ?", Integer.class, id))
                .isZero();
    }

    private RestTestClient.ResponseSpec post(User user, UUID id, String body) {
        return client.post().uri("/api/v1/events/{id}/announcements", id)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(user))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("body", body))
                .exchange();
    }

    private UUID create(User host, Instant startsAt, Instant endsAt) {
        return create(host, startsAt, endsAt, "public");
    }

    private UUID create(User host, Instant startsAt, Instant endsAt, String visibility) {
        Map<String, Object> body = new HashMap<>(Map.of(
                "title", "CS102 study group",
                "description", "Studying for CS102!",
                "category", "study",
                "latitude", 40.7440,
                "longitude", -74.0255,
                "locationLabel", "Library, 2nd floor",
                "startsAt", startsAt.truncatedTo(ChronoUnit.SECONDS).toString(),
                "endsAt", endsAt.truncatedTo(ChronoUnit.SECONDS).toString()));
        body.put("visibility", visibility);
        String location = client.post().uri("/api/v1/events")
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .exchange()
                .expectStatus().isCreated()
                .expectBody()
                .returnResult()
                .getResponseHeaders()
                .getFirst(HttpHeaders.LOCATION);
        assertThat(location).isNotNull();
        return UUID.fromString(location.substring(location.lastIndexOf('/') + 1));
    }

    private RestTestClient.ResponseSpec map(User user) {
        return map(user, null, null);
    }

    private RestTestClient.ResponseSpec map(User user, Instant freeFrom, Instant freeTo) {
        Instant from = LocalDate.now(EventService.CAMPUS).atStartOfDay(EventService.CAMPUS).toInstant();
        Instant to = LocalDate.now(EventService.CAMPUS).plusDays(2).atStartOfDay(EventService.CAMPUS).toInstant();
        return client.get().uri(builder -> {
                    builder.path("/api/v1/events")
                            .queryParam("bbox", "-74.03,40.74,-74.02,40.75")
                            .queryParam("from", from.toString())
                            .queryParam("to", to.toString())
                            .queryParam("limit", "50");
                    if (freeFrom != null && freeTo != null) {
                        builder.queryParam("freeFrom", freeFrom.toString())
                                .queryParam("freeTo", freeTo.toString());
                    }
                    return builder.build();
                })
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(user))
                .exchange();
    }

    private User signIn(String name) {
        return authService.signIn(new GoogleIdentity(
                name + "-sub", name + "@stevens.edu", true, name, null));
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

    record SessionBody(String sessionId) {
    }
}
