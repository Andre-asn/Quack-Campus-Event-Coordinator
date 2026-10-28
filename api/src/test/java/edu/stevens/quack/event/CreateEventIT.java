package edu.stevens.quack.event;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
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
import edu.stevens.quack.user.UserRepository;

@AutoConfigureRestTestClient
class CreateEventIT extends PostgresIntegrationTest {

    @Autowired
    RestTestClient client;

    @Autowired
    AuthService authService;

    @Autowired
    HandoffCodes handoffCodes;

    @Autowired
    UserRepository users;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    CampusProperties campus;

    @BeforeEach
    @AfterEach
    void clean() {
        // Other test classes delete users, which the events foreign key would block.
        jdbc.update("delete from events");
        users.deleteAll();
    }

    @Test
    void createsAnEventHostedByTheCaller() {
        User host = authService.signIn(new GoogleIdentity("sub-1", "ada@stevens.edu", true, "Ada", null));
        Instant startsAt = Instant.now().plus(2, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);

        String location = client.post().uri("/api/v1/events")
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of(
                        "title", "CS102 study group",
                        "description", "Studying for CS102!",
                        "category", "study",
                        "latitude", 40.7440,
                        "longitude", -74.0255,
                        "locationLabel", "Library, 2nd floor",
                        "startsAt", startsAt.toString()))
                .exchange()
                .expectStatus().isCreated()
                .expectBody()
                .jsonPath("$.hostId").isEqualTo(host.getId().toString())
                .jsonPath("$.latitude").isEqualTo(40.7440)
                .jsonPath("$.longitude").isEqualTo(-74.0255)
                .returnResult()
                .getResponseHeaders()
                .getFirst(HttpHeaders.LOCATION);

        assertThat(location).matches(".*/api/v1/events/[0-9a-f-]{36}$");
        UUID id = UUID.fromString(location.substring(location.lastIndexOf('/') + 1));

        Map<String, Object> row = jdbc.queryForMap("""
                select host_id, title, description, category, location_label, starts_at,
                       visibility, status, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lon
                from events where id = ?
                """, id);
        assertThat(row.get("host_id")).isEqualTo(host.getId());
        assertThat(row.get("title")).isEqualTo("CS102 study group");
        assertThat(row.get("description")).isEqualTo("Studying for CS102!");
        assertThat(row.get("category")).isEqualTo("study");
        assertThat(row.get("location_label")).isEqualTo("Library, 2nd floor");
        assertThat(((java.sql.Timestamp) row.get("starts_at")).toInstant()).isEqualTo(startsAt);
        assertThat(row.get("visibility")).isEqualTo("public");
        assertThat(row.get("status")).isEqualTo("active");
        assertThat((Double) row.get("lat")).isEqualTo(40.7440);
        assertThat((Double) row.get("lon")).isEqualTo(-74.0255);
    }

    @Test
    void rejectsAnonymousCallers() {
        client.post().uri("/api/v1/events")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("title", "Anonymous"))
                .exchange()
                .expectStatus().isUnauthorized()
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.code").isEqualTo("UNAUTHENTICATED");

        assertThat(jdbc.queryForObject("select count(*) from events", Integer.class)).isZero();
    }

    @Test
    void rejectsMalformedJson() {
        User host = authService.signIn(new GoogleIdentity("sub-1", "ada@stevens.edu", true, "Ada", null));

        client.post().uri("/api/v1/events")
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"title\": \"Broken\",")
                .exchange()
                .expectStatus().isBadRequest()
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.code").isEqualTo("MALFORMED_REQUEST");
    }

    @Test
    void acceptsAnEventStartingNow() {
        User host = signIn();

        post(host, valid(Map.of("startsAt", Instant.now().toString()))).expectStatus().isCreated();
    }

    @Test
    void rejectsAStartInThePast() {
        User host = signIn();
        Instant anHourAgo = Instant.now().minus(1, ChronoUnit.HOURS);

        expectInvalid(post(host, valid(Map.of("startsAt", anHourAgo.toString()))), "startsAt", "IN_PAST");
    }

    @Test
    void allowsAFewMinutesOfClockSkewBeforeNow() {
        User host = signIn();
        Instant justBefore = Instant.now().minus(1, ChronoUnit.MINUTES);

        post(host, valid(Map.of("startsAt", justBefore.toString()))).expectStatus().isCreated();
    }

    @Test
    void acceptsAStartJustInsideFortyEightHours() {
        User host = signIn();
        Instant almost = Instant.now().plus(48, ChronoUnit.HOURS).minus(1, ChronoUnit.MINUTES);

        post(host, valid(Map.of("startsAt", almost.toString()))).expectStatus().isCreated();
    }

    @Test
    void acceptsExactlyFortyEightHoursAhead() {
        User host = signIn();
        // The server's clock reads a little later than this one, so this is at most exactly 48h for it.
        Instant limit = Instant.now().plus(48, ChronoUnit.HOURS);

        post(host, valid(Map.of("startsAt", limit.toString()))).expectStatus().isCreated();
    }

    @Test
    void rejectsJustBeyondFortyEightHours() {
        User host = signIn();
        // A minute, not a second, so the gap between this clock and the server's can't make it pass.
        Instant tooLate = Instant.now().plus(48, ChronoUnit.HOURS).plus(1, ChronoUnit.MINUTES);

        expectInvalid(post(host, valid(Map.of("startsAt", tooLate.toString()))), "startsAt", "TOO_FAR_AHEAD");
    }

    @Test
    void acceptsADescriptionOfExactlyOneHundredFortyCharacters() {
        User host = signIn();

        post(host, valid(Map.of("description", "x".repeat(140)))).expectStatus().isCreated();
    }

    @Test
    void rejectsADescriptionLongerThanOneHundredFortyCharacters() {
        User host = signIn();

        RestTestClient.ResponseSpec response = post(host, valid(Map.of("description", "x".repeat(141))));

        // detail carries the reason too, for clients that show only the top-level message.
        response.expectBody().jsonPath("$.detail").isEqualTo("Description must be at most 140 characters.");
        expectInvalid(response, "description", "TOO_LONG");
    }

    @Test
    void trimsTextBeforeCheckingAndStoringIt() {
        User host = signIn();
        Map<String, Object> body = valid(Map.of(
                "title", "  CS102 study group  ",
                "description", "x".repeat(140) + "   "));

        post(host, body).expectStatus().isCreated();

        Map<String, Object> row = jdbc.queryForMap("select title, description from events");
        assertThat(row.get("title")).isEqualTo("CS102 study group");
        assertThat(row.get("description")).isEqualTo("x".repeat(140));
    }


    @Test
    void rejectsAMissingCategory() {
        User host = signIn();
        Map<String, Object> body = valid(Map.of());
        body.remove("category");

        expectInvalid(post(host, body), "category", "REQUIRED");
    }

    @Test
    void rejectsAnUnknownCategory() {
        User host = signIn();

        expectInvalid(post(host, valid(Map.of("category", "party"))), "category", "UNKNOWN_CATEGORY");
    }

    @Test
    void rejectsCoordinatesOutsideTheCampus() {
        User host = signIn();
        // Times Square: off campus on both axes.
        Map<String, Object> body = valid(Map.of("latitude", 40.7580, "longitude", -73.9855));

        expectInvalid(post(host, body), "location", "OUTSIDE_CAMPUS");
    }

    @Test
    void acceptsAPinOnTheCampusEdge() {
        User host = signIn();

        post(host, valid(Map.of("latitude", campus.south(), "longitude", campus.west()))).expectStatus().isCreated();
    }

    @Test
    void reportsEveryMissingFieldAtOnce() {
        User host = signIn();

        var body = post(host, Map.of())
                .expectStatus().isEqualTo(422)
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.code").isEqualTo("INVALID_EVENT")
                .jsonPath("$.errors.length()").isEqualTo(7);
        for (String field : List.of(
                "title", "description", "locationLabel", "category", "startsAt", "latitude", "longitude")) {
            body.jsonPath("$.errors[?(@.field == '" + field + "' && @.code == 'REQUIRED')]").isNotEmpty();
        }
        assertNoEvents();
    }

    private User signIn() {
        return authService.signIn(new GoogleIdentity("sub-1", "ada@stevens.edu", true, "Ada", null));
    }

    private Map<String, Object> valid(Map<String, Object> overrides) {
        Map<String, Object> body = new HashMap<>(Map.of(
                "title", "CS102 study group",
                "description", "Studying for CS102!",
                "category", "study",
                "latitude", 40.7440,
                "longitude", -74.0255,
                "locationLabel", "Library, 2nd floor",
                "startsAt", Instant.now().plus(2, ChronoUnit.HOURS).toString()));
        body.putAll(overrides);
        return body;
    }

    private RestTestClient.ResponseSpec post(User host, Map<String, Object> body) {
        return client.post().uri("/api/v1/events")
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(host))
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .exchange();
    }

    private void expectInvalid(RestTestClient.ResponseSpec response, String field, String code) {
        response.expectStatus().isEqualTo(422)
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.code").isEqualTo("INVALID_EVENT")
                .jsonPath("$.errors.length()").isEqualTo(1)
                .jsonPath("$.errors[0].field").isEqualTo(field)
                .jsonPath("$.errors[0].code").isEqualTo(code)
                .jsonPath("$.errors[0].detail").isNotEmpty();
        assertNoEvents();
    }

    private void assertNoEvents() {
        assertThat(jdbc.queryForObject("select count(*) from events", Integer.class)).isZero();
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
