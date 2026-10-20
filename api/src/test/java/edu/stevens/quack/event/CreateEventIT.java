package edu.stevens.quack.event;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
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
