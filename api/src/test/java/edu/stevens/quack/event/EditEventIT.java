package edu.stevens.quack.event;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
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
class EditEventIT extends PostgresIntegrationTest {

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
        jdbc.update("delete from events");
        jdbc.update("delete from users");
    }

    @Test
    void hostEditsTheEventAndTheMapShowsTheChange() {
        User host = signIn("ada");
        UUID id = create(host, "public");
        Instant startsAt = Instant.now().plus(3, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);

        patch(host, id, edit(Map.of(
                "title", "Moved study group",
                "description", "Now in the lounge",
                "category", "food",
                "latitude", 40.7450,
                "longitude", -74.0240,
                "locationLabel", "Babbio lobby",
                "startsAt", startsAt.toString())))
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.title").isEqualTo("Moved study group")
                .jsonPath("$.visibility").isEqualTo("public")
                .jsonPath("$.shareToken").doesNotExist();

        Map<String, Object> row = jdbc.queryForMap("""
                select title, description, category, location_label, starts_at, visibility, status,
                       ST_Y(location::geometry) as lat, ST_X(location::geometry) as lon
                from events where id = ?
                """, id);
        assertThat(row.get("title")).isEqualTo("Moved study group");
        assertThat(row.get("description")).isEqualTo("Now in the lounge");
        assertThat(row.get("category")).isEqualTo("food");
        assertThat(row.get("location_label")).isEqualTo("Babbio lobby");
        assertThat(((Timestamp) row.get("starts_at")).toInstant()).isEqualTo(startsAt);
        assertThat(row.get("visibility")).isEqualTo("public");
        assertThat(row.get("status")).isEqualTo("active");
        assertThat((Double) row.get("lat")).isEqualTo(40.7450);
        assertThat((Double) row.get("lon")).isEqualTo(-74.0240);

        map(host).expectStatus().isOk()
                .expectBody()
                .jsonPath("$.events[?(@.title == 'Moved study group')]").isNotEmpty();
    }

    @Test
    void anotherStudentIsForbiddenAndTheRowStays() {
        User host = signIn("ada");
        User other = signIn("bea");
        UUID id = create(host, "public");

        patch(other, id, edit(Map.of("title", "Taken over")))
                .expectStatus().isForbidden()
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.code").isEqualTo("NOT_HOST");

        assertThat(jdbc.queryForObject("select title from events where id = ?", String.class, id))
                .isEqualTo("CS102 study group");
    }

    @Test
    void someoneElseEditingALinkOnlyEventLooksLikeAMissingEvent() {
        User host = signIn("ada");
        User other = signIn("bea");
        UUID id = create(host, "link_only");

        patch(other, id, edit(Map.of("title", "Taken over")))
                .expectStatus().isNotFound()
                .expectBody()
                .jsonPath("$.code").isEqualTo("EVENT_NOT_FOUND");

        assertThat(jdbc.queryForObject("select title from events where id = ?", String.class, id))
                .isEqualTo("CS102 study group");
    }

    @Test
    void editingACancelledEventConflicts() {
        User host = signIn("ada");
        UUID id = create(host, "public");
        jdbc.update("update events set status = 'cancelled' where id = ?", id);

        patch(host, id, edit(Map.of("title", "Still on")))
                .expectStatus().isEqualTo(409)
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.code").isEqualTo("EVENT_CANCELLED");

        assertThat(jdbc.queryForObject("select title from events where id = ?", String.class, id))
                .isEqualTo("CS102 study group");
    }

    @Test
    void aStartedEventCanKeepItsPastStartTime() {
        User host = signIn("ada");
        UUID id = create(host, "public");
        Instant past = Instant.now().minus(2, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MICROS);
        jdbc.update("update events set starts_at = ? where id = ?", Timestamp.from(past), id);

        patch(host, id, edit(Map.of("title", "Already started", "startsAt", past.toString())))
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.title").isEqualTo("Already started");

        assertThat(jdbc.queryForObject("select starts_at from events where id = ?", Timestamp.class, id).toInstant())
                .isEqualTo(past);
    }

    @Test
    void movingTheStartToTheStoredEndIsRejected() {
        User host = signIn("ada");
        UUID id = create(host, "public");
        Instant endsAt = jdbc.queryForObject(
                "select ends_at from events where id = ?", Timestamp.class, id).toInstant();

        patch(host, id, edit(Map.of("startsAt", endsAt.toString())))
                .expectStatus().isEqualTo(422)
                .expectBody()
                .jsonPath("$.code").isEqualTo("INVALID_EVENT")
                .jsonPath("$.errors[0].field").isEqualTo("startsAt")
                .jsonPath("$.errors[0].code").isEqualTo("NOT_BEFORE_END");

        assertThat(jdbc.queryForObject("select starts_at from events where id = ?", Timestamp.class, id).toInstant())
                .isNotEqualTo(endsAt);
    }

    @Test
    void movingTheStartIntoThePastIsRejected() {
        User host = signIn("ada");
        UUID id = create(host, "public");
        Instant past = Instant.now().minus(2, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);

        patch(host, id, edit(Map.of("startsAt", past.toString())))
                .expectStatus().isEqualTo(422)
                .expectBody()
                .jsonPath("$.code").isEqualTo("INVALID_EVENT")
                .jsonPath("$.errors[0].field").isEqualTo("startsAt")
                .jsonPath("$.errors[0].code").isEqualTo("IN_PAST");
    }

    @Test
    void anUnknownEventIsNotFound() {
        User host = signIn("ada");

        patch(host, UUID.randomUUID(), edit(Map.of()))
                .expectStatus().isNotFound()
                .expectBody()
                .jsonPath("$.code").isEqualTo("EVENT_NOT_FOUND");
    }

    @Test
    void anAnonymousCallerIsUnauthorized() {
        client.patch().uri("/api/v1/events/" + UUID.randomUUID())
                .contentType(MediaType.APPLICATION_JSON)
                .body(edit(Map.of()))
                .exchange()
                .expectStatus().isUnauthorized()
                .expectBody()
                .jsonPath("$.code").isEqualTo("UNAUTHENTICATED");
    }

    private UUID create(User host, String visibility) {
        Map<String, Object> body = edit(Map.of("visibility", visibility));
        body.put("endsAt", Instant.now().plus(4, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS).toString());
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

    private RestTestClient.ResponseSpec patch(User user, UUID id, Map<String, Object> body) {
        return client.patch().uri("/api/v1/events/" + id)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(user))
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .exchange();
    }

    private RestTestClient.ResponseSpec map(User user) {
        Instant from = LocalDate.now(EventService.CAMPUS).atStartOfDay(EventService.CAMPUS).toInstant();
        Instant to = LocalDate.now(EventService.CAMPUS).plusDays(2).atStartOfDay(EventService.CAMPUS).toInstant();
        return client.get().uri(builder -> builder.path("/api/v1/events")
                        .queryParam("bbox", "-74.03,40.74,-74.02,40.75")
                        .queryParam("from", from.toString())
                        .queryParam("to", to.toString())
                        .queryParam("limit", "50")
                        .build())
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(user))
                .exchange();
    }

    private Map<String, Object> edit(Map<String, Object> overrides) {
        Map<String, Object> body = new HashMap<>(Map.of(
                "title", "CS102 study group",
                "description", "Studying for CS102!",
                "category", "study",
                "latitude", 40.7440,
                "longitude", -74.0255,
                "locationLabel", "Library, 2nd floor",
                "startsAt", Instant.now().plus(2, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS).toString()));
        body.putAll(overrides);
        return body;
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
