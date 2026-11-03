package edu.stevens.quack.event;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
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
class EventDetailIT extends PostgresIntegrationTest {

    private static final Instant STARTS_AT = Instant.now().plus(2, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MICROS);

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
        Event event = save(user("ada"));

        client.get().uri("/api/v1/events/{id}", event.getId())
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    void returnsTheDetailFields() {
        User host = user("ada");
        Event event = save(host);

        client.get().uri("/api/v1/events/{id}", event.getId())
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(user("grace")))
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.id").isEqualTo(event.getId().toString())
                .jsonPath("$.title").isEqualTo("CS102 study group")
                .jsonPath("$.host.displayName").isEqualTo("ada")
                .jsonPath("$.host.avatarUrl").isEqualTo("https://example.test/ada.png")
                .jsonPath("$.startsAt").isEqualTo(STARTS_AT.toString())
                .jsonPath("$.locationLabel").isEqualTo("Library, 2nd floor")
                .jsonPath("$.category").isEqualTo("study")
                .jsonPath("$.description").isEqualTo("Studying for CS102!")
                .jsonPath("$.status").isEqualTo("active")
                .jsonPath("$.attendeeCount").isEqualTo(0);
    }

    @Test
    void leavesOutAttendeeNamesAndTheShareToken() {
        Event event = save(user("ada"));
        UUID token = linkOnly(event);

        String body = client.get().uri("/api/v1/events/{id}?token={token}", event.getId(), token)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(user("grace")))
                .exchange()
                .expectStatus().isOk()
                .expectBody(String.class)
                .returnResult()
                .getResponseBody();

        assertThat(body).isNotNull().doesNotContain(token.toString());
        Map<String, Object> json = JsonPath.read(body, "$");
        assertThat(json).containsOnlyKeys(
                "id", "title", "description", "category", "locationLabel", "startsAt", "status", "host",
                "attendeeCount");
        Map<String, Object> host = JsonPath.read(body, "$.host");
        assertThat(host).containsOnlyKeys("displayName", "avatarUrl");
    }

    @Test
    void returnsCancelledEventsWithTheirStatus() {
        Event event = save(user("ada"));
        jdbc.update("update events set status = 'cancelled' where id = ?", event.getId());

        client.get().uri("/api/v1/events/{id}", event.getId())
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(user("grace")))
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo("cancelled")
                .jsonPath("$.title").isEqualTo("CS102 study group");
    }

    @Test
    void returnsALinkOnlyEventWithItsToken() {
        Event event = save(user("ada"));
        UUID token = linkOnly(event);

        client.get().uri("/api/v1/events/{id}?token={token}", event.getId(), token)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(user("grace")))
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.id").isEqualTo(event.getId().toString());
    }

    @Test
    void hidesALinkOnlyEventWithoutAToken() {
        Event event = save(user("ada"));
        linkOnly(event);

        expectNotFound("/api/v1/events/" + event.getId(), sessionFor(user("grace")));
    }

    @Test
    void hidesALinkOnlyEventFromItsHostWithoutAToken() {
        User host = user("ada");
        Event event = save(host);
        linkOnly(event);

        expectNotFound("/api/v1/events/" + event.getId(), sessionFor(host));
    }

    @Test
    void hidesALinkOnlyEventWithATamperedToken() {
        Event event = save(user("ada"));
        UUID token = linkOnly(event);
        String tampered = token.toString().substring(0, 35) + (token.toString().endsWith("0") ? "1" : "0");
        String session = sessionFor(user("grace"));

        expectNotFound("/api/v1/events/" + event.getId() + "?token=" + tampered, session);
        expectNotFound("/api/v1/events/" + event.getId() + "?token=" + UUID.randomUUID(), session);
        expectNotFound("/api/v1/events/" + event.getId() + "?token=not-a-token", session);
        expectNotFound("/api/v1/events/" + event.getId() + "?token=", session);
    }

    @Test
    void hidesALinkOnlyEventWithAnotherEventsToken() {
        User host = user("ada");
        Event hidden = save(host);
        linkOnly(hidden);
        UUID otherToken = linkOnly(save(host));

        expectNotFound("/api/v1/events/" + hidden.getId() + "?token=" + otherToken, sessionFor(user("grace")));
    }

    @Test
    void hidesALinkOnlyEventThatHasNoToken() {
        Event event = save(user("ada"));
        jdbc.update("update events set visibility = 'link_only', share_token = null where id = ?", event.getId());

        expectNotFound("/api/v1/events/" + event.getId(), sessionFor(user("grace")));
    }

    @Test
    void ignoresTheTokenOnAPublicEvent() {
        Event event = save(user("ada"));

        client.get().uri("/api/v1/events/{id}?token={token}", event.getId(), UUID.randomUUID())
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(user("grace")))
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void returnsNotFoundForAnUnknownOrMalformedId() {
        String session = sessionFor(user("grace"));

        expectNotFound("/api/v1/events/" + UUID.randomUUID(), session);
        expectNotFound("/api/v1/events/not-a-uuid", session);
        expectNotFound("/api/v1/events/1-1-1-1-1", session);
    }

    private void expectNotFound(String uri, String session) {
        client.get().uri(uri)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + session)
                .exchange()
                .expectStatus().isNotFound()
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.code").isEqualTo("EVENT_NOT_FOUND")
                .jsonPath("$.status").isEqualTo(404);
    }

    private UUID linkOnly(Event event) {
        UUID token = UUID.randomUUID();
        jdbc.update("update events set visibility = 'link_only', share_token = ? where id = ?", token, event.getId());
        return token;
    }

    private User user(String name) {
        return authService.signIn(new GoogleIdentity(
                name + "-sub", name + "@stevens.edu", true, name, "https://example.test/" + name + ".png"));
    }

    private Event save(User host) {
        return events.save(Event.create(
                UUID.randomUUID(),
                host.getId(),
                "CS102 study group",
                "Studying for CS102!",
                "study",
                40.745,
                -74.025,
                "Library, 2nd floor",
                STARTS_AT,
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

    record SessionBody(String sessionId) {
    }
}
