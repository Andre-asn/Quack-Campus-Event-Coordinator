package edu.stevens.quack.event;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
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
@Import(CancellationIT.FixedClockConfig.class)
class CancellationIT extends PostgresIntegrationTest {

    private static final Instant TEST_NOW = Instant.parse("2026-11-04T17:00:00Z");
    private static final Instant STARTS_AT = TEST_NOW.plus(2, ChronoUnit.HOURS);
    private static final Instant ENDS_AT = TEST_NOW.plus(4, ChronoUnit.HOURS);
    private static final String BBOX = "-74.03,40.74,-74.02,40.75";

    @TestConfiguration
    static class FixedClockConfig {
        @Bean
        @org.springframework.context.annotation.Primary
        Clock testClock() {
            return Clock.fixed(TEST_NOW, ZoneOffset.UTC);
        }
    }

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
    void hostCancellationPreservesTheEventAttendanceAndDetail() {
        User host = user("host");
        UUID eventId = save(host).getId();
        UUID attendeeId = user("attendee").getId();
        UUID secondAttendeeId = user("second-attendee").getId();
        jdbc.update("insert into event_attendance (event_id, user_id, joined_at) values (?, ?, ?)",
                eventId, attendeeId, java.sql.Timestamp.from(TEST_NOW.minusSeconds(30)));
        jdbc.update("insert into event_attendance (event_id, user_id, joined_at) values (?, ?, ?)",
                eventId, secondAttendeeId, java.sql.Timestamp.from(TEST_NOW.minusSeconds(20)));
        Map<String, Object> before = eventRow(eventId);
        String session = sessionFor(host);

        cancel(eventId, session).expectStatus().isOk().expectBody().isEmpty();

        Map<String, Object> after = eventRow(eventId);
        assertThat(after).containsEntry("status", "cancelled");
        assertThat(after).containsEntry("host_id", before.get("host_id"));
        assertThat(after).containsEntry("title", before.get("title"));
        assertThat(after).containsEntry("description", before.get("description"));
        assertThat(after).containsEntry("category", before.get("category"));
        assertThat(after).containsEntry("location_label", before.get("location_label"));
        assertThat(after).containsEntry("starts_at", before.get("starts_at"));
        assertThat(after).containsEntry("ends_at", before.get("ends_at"));
        assertThat(after).containsEntry("visibility", before.get("visibility"));
        assertThat(after).containsEntry("share_token", before.get("share_token"));
        assertThat(after).containsEntry("created_at", before.get("created_at"));
        assertThat(jdbc.queryForObject("select count(*) from event_attendance where event_id = ?", Long.class, eventId))
                .isEqualTo(2L);

        client.get().uri("/api/v1/events/{id}", eventId)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(user("viewer")))
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo("cancelled")
                .jsonPath("$.attendeeCount").isEqualTo(2);
    }

    @Test
    void cancellationRemovesOnlyTheEventFromTheMapAndInvalidatesItsEtag() {
        User host = user("host");
        UUID cancelled = save(host, "Cancelled", STARTS_AT).getId();
        UUID unrelated = save(host, "Unrelated", STARTS_AT.plusSeconds(1)).getId();
        String session = sessionFor(host);
        String uri = "/api/v1/events?bbox=" + BBOX + "&from=2026-11-04T00:00:00Z&to=2026-11-05T00:00:00Z&limit=50";
        String etag = client.get().uri(uri).header(HttpHeaders.COOKIE, "JSESSIONID=" + session)
                .exchange().expectStatus().isOk().expectHeader().exists(HttpHeaders.ETAG)
                .returnResult(Void.class).getResponseHeaders().getFirst(HttpHeaders.ETAG);

        cancel(cancelled, session).expectStatus().isOk();

        client.get().uri(uri).header(HttpHeaders.COOKIE, "JSESSIONID=" + session)
                .header(HttpHeaders.IF_NONE_MATCH, etag).exchange()
                .expectStatus().isOk().expectBody()
                .jsonPath("$.events.length()").isEqualTo(1)
                .jsonPath("$.events[0].id").isEqualTo(unrelated.toString());
    }

    @Test
    void onlyTheHostCanCancelIncludingAnAlreadyCancelledEvent() {
        User host = user("host");
        UUID eventId = save(host).getId();
        User other = user("other");
        String otherSession = sessionFor(other);

        cancel(eventId, otherSession).expectStatus().isForbidden()
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody().jsonPath("$.code").isEqualTo("EVENT_FORBIDDEN");
        jdbc.update("update events set status = 'cancelled' where id = ?", eventId);
        Map<String, Object> before = eventRow(eventId);
        cancel(eventId, otherSession).expectStatus().isForbidden();
        assertThat(eventRow(eventId)).isEqualTo(before);
    }

    @Test
    void anonymousMissingAndMalformedCancellationRequestsUseExistingErrors() {
        UUID eventId = save(user("host")).getId();
        client.post().uri("/api/v1/events/{id}/cancel", eventId).exchange().expectStatus().isUnauthorized();
        cancel(UUID.randomUUID(), sessionFor(user("host-2"))).expectStatus().isNotFound()
                .expectBody().jsonPath("$.code").isEqualTo("EVENT_NOT_FOUND");
        cancelText("not-a-uuid", sessionFor(user("host-3"))).expectStatus().isNotFound()
                .expectBody().jsonPath("$.code").isEqualTo("EVENT_NOT_FOUND");
        assertThat(eventRow(eventId)).containsEntry("status", "active");
    }

    @Test
    void repeatedCancellationPreservesUpdatedAtAndSupportsAllTimesAndLegacyNullEnd() {
        User host = user("host");
        UUID repeated = save(host).getId();
        String session = sessionFor(host);
        cancel(repeated, session).expectStatus().isOk();
        Map<String, Object> afterFirst = eventRow(repeated);
        cancel(repeated, session).expectStatus().isOk();
        assertThat(eventRow(repeated)).isEqualTo(afterFirst);

        UUID started = save(host, "Started", TEST_NOW.minusSeconds(1)).getId();
        UUID ended = save(host, "Ended", TEST_NOW.minusSeconds(2)).getId();
        jdbc.update("update events set ends_at = ? where id = ?", java.sql.Timestamp.from(TEST_NOW.plusSeconds(1)), started);
        jdbc.update("update events set ends_at = ? where id = ?", java.sql.Timestamp.from(TEST_NOW.minusSeconds(1)), ended);
        UUID legacy = save(host, "Legacy", STARTS_AT).getId();
        jdbc.update("update events set ends_at = null where id = ?", legacy);

        cancel(started, session).expectStatus().isOk();
        cancel(ended, session).expectStatus().isOk();
        cancel(legacy, session).expectStatus().isOk();
        assertThat(jdbc.queryForList("select status from events where id in (?, ?, ?)", started, ended, legacy))
                .extracting(row -> row.get("status")).containsOnly("cancelled");
    }

    @Test
    void cancellationBlocksJoiningButDoesNotChangeLeaving() {
        User host = user("host");
        UUID eventId = save(host).getId();
        User attendee = user("attendee");
        String hostSession = sessionFor(host);
        String attendeeSession = sessionFor(attendee);
        client.put().uri("/api/v1/events/{id}/attendance", eventId)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + attendeeSession).exchange().expectStatus().isOk();
        cancel(eventId, hostSession).expectStatus().isOk();
        client.put().uri("/api/v1/events/{id}/attendance", eventId)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(user("late")))
                .exchange().expectStatus().isEqualTo(409).expectBody().jsonPath("$.code").isEqualTo("EVENT_CANCELLED");
        client.delete().uri("/api/v1/events/{id}/attendance", eventId)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + attendeeSession).exchange().expectStatus().isNoContent();
    }

    @Test
    void concurrentHostCancellationsAreBothSuccessful() throws Exception {
        User host = user("host");
        UUID eventId = save(host).getId();
        User attendee = user("attendee");
        jdbc.update("insert into event_attendance (event_id, user_id, joined_at) values (?, ?, ?)",
                eventId, attendee.getId(), java.sql.Timestamp.from(TEST_NOW.minusSeconds(30)));
        String session = sessionFor(host);
        CompletableFuture<Void> first = CompletableFuture.runAsync(() -> cancel(eventId, session).expectStatus().isOk());
        CompletableFuture<Void> second = CompletableFuture.runAsync(() -> cancel(eventId, session).expectStatus().isOk());
        CompletableFuture.allOf(first, second).get();
        assertThat(eventRow(eventId)).containsEntry("status", "cancelled");
        assertThat(jdbc.queryForObject("select count(*) from event_attendance where event_id = ?", Long.class, eventId))
                .isEqualTo(1L);
    }

    @Test
    void hostCanCancelLinkOnlyEventsWithoutChangingTokenProtection() {
        User host = user("host");
        UUID eventId = save(host).getId();
        UUID token = UUID.randomUUID();
        jdbc.update("update events set visibility = 'link_only', share_token = ? where id = ?", token, eventId);

        cancel(eventId, sessionFor(host)).expectStatus().isOk();
        client.get().uri("/api/v1/events/{id}", eventId)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(user("viewer")))
                .exchange().expectStatus().isNotFound();
        client.get().uri("/api/v1/events/{id}?token={token}", eventId, token)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(user("viewer-2")))
                .exchange().expectStatus().isOk().expectBody().jsonPath("$.status").isEqualTo("cancelled");
    }

    private RestTestClient.ResponseSpec cancel(UUID eventId, String session) {
        return cancelText(eventId.toString(), session);
    }

    private RestTestClient.ResponseSpec cancelText(String eventId, String session) {
        return client.post().uri("/api/v1/events/" + eventId + "/cancel")
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + session).exchange();
    }

    private Event save(User host) {
        return save(host, "Study group", STARTS_AT);
    }

    private Event save(User host, String title, Instant startsAt) {
        return events.saveAndFlush(Event.create(UUID.randomUUID(), host.getId(), title, "Study together", "study",
                40.7440, -74.0255, "Library", startsAt, ENDS_AT, "public", null, TEST_NOW));
    }

    private Map<String, Object> eventRow(UUID eventId) {
        return jdbc.queryForMap("""
                select host_id, title, description, category, location_label, starts_at, ends_at,
                       visibility, share_token, status, created_at, updated_at
                from events where id = ?
                """, eventId);
    }

    private User user(String name) {
        return authService.signIn(new GoogleIdentity("cancel-" + name, name + "@stevens.edu", true, name,
                "https://example.test/" + name + ".png"));
    }

    private String sessionFor(User user) {
        SessionBody session = client.post().uri("/api/v1/auth/session").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("handoff", handoffCodes.issue(user.getId()))).exchange().expectStatus().isOk()
                .expectBody(SessionBody.class).returnResult().getResponseBody();
        assertThat(session).isNotNull();
        return session.sessionId();
    }

    record SessionBody(String sessionId) {
    }
}
