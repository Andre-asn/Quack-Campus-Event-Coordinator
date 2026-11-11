package edu.stevens.quack.event;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

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
@Import(AttendanceListIT.FixedClockConfig.class)
class AttendanceListIT extends PostgresIntegrationTest {

    private static final Instant TEST_NOW = Instant.parse("2026-11-04T17:00:00Z");
    private static final Instant STARTS_AT = TEST_NOW.plus(2, ChronoUnit.HOURS);
    private static final Instant ENDS_AT = TEST_NOW.plus(4, ChronoUnit.HOURS);

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
    void hostSeesNamesWithoutJoiningAndDoesNotGetAutoAdded() {
        User host = user("host");
        User attendee = user("attendee");
        UUID eventId = save(host).getId();
        join(eventId, sessionFor(attendee)).expectStatus().isOk();

        AttendanceController.AttendanceResponse response = list(eventId, sessionFor(host))
                .expectStatus().isOk().expectBody(AttendanceController.AttendanceResponse.class)
                .returnResult().getResponseBody();

        assertThat(response).isEqualTo(new AttendanceController.AttendanceResponse(1, List.of("attendee"), 0));
        assertThat(jdbc.queryForObject("select count(*) from event_attendance where event_id = ?", Long.class, eventId))
                .isEqualTo(1L);
    }

    @Test
    void joinedStudentSeesNamesButOutsiderGetsForbiddenAndDetailStillShowsCount() {
        User host = user("host");
        User attendee = user("attendee");
        User outsider = user("outsider");
        UUID eventId = save(host).getId();
        join(eventId, sessionFor(attendee)).expectStatus().isOk();

        list(eventId, sessionFor(attendee)).expectStatus().isOk().expectBody()
                .jsonPath("$.attendeeCount").isEqualTo(1)
                .jsonPath("$.names").isEqualTo(List.of("attendee"))
                .jsonPath("$.remainingCount").isEqualTo(0);

        String outsiderSession = sessionFor(outsider);
        String error = list(eventId, outsiderSession).expectStatus().isForbidden()
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody(String.class).returnResult().getResponseBody();
        assertThat(error).doesNotContain("@stevens.edu").doesNotContain("provider");

        client.get().uri("/api/v1/events/{id}", eventId)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + outsiderSession)
                .exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.attendeeCount").isEqualTo(1)
                .jsonPath("$.host").exists();
    }

    @Test
    void anonymousMissingAndMalformedRequestsUseExistingConventions() {
        UUID eventId = save(user("host")).getId();
        client.get().uri("/api/v1/events/{id}/attendance", eventId)
                .exchange().expectStatus().isUnauthorized();

        list(UUID.randomUUID(), sessionFor(user("viewer"))).expectStatus().isNotFound()
                .expectBody().jsonPath("$.code").isEqualTo("EVENT_NOT_FOUND");
        client.get().uri("/api/v1/events/not-a-uuid/attendance")
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionFor(user("viewer-2")))
                .exchange().expectStatus().isBadRequest();
        assertThat(eventId).isNotNull();
    }

    @Test
    void returnsZeroTwentyAndRemainingCountsWithStableDuplicatePreservingOrder() {
        User host = user("host");
        UUID eventId = save(host).getId();
        String hostSession = sessionFor(host);

        list(eventId, hostSession).expectStatus().isOk().expectBody()
                .jsonPath("$.attendeeCount").isEqualTo(0)
                .jsonPath("$.names").isEmpty()
                .jsonPath("$.remainingCount").isEqualTo(0);

        List<User> attendees = new ArrayList<>();
        for (int i = 0; i < 21; i++) {
            attendees.add(user(i == 0 || i == 1 ? "same-name" : "attendee-" + i));
        }
        for (User attendee : attendees) {
            jdbc.update("insert into event_attendance (event_id, user_id, joined_at) values (?, ?, ?)",
                    eventId, attendee.getId(), java.sql.Timestamp.from(TEST_NOW));
        }

        List<String> expectedNames = jdbc.queryForList("""
                select u.display_name
                from event_attendance a join users u on u.id = a.user_id
                where a.event_id = ?
                order by a.joined_at, a.user_id
                limit 20
                """, String.class, eventId);

        String body = list(eventId, hostSession).expectStatus().isOk()
                .expectBody(String.class).returnResult().getResponseBody();
        assertThat(body).isNotNull().doesNotContain("@stevens.edu").doesNotContain("provider_subject_id");
        AttendanceController.AttendanceResponse response = client.get()
                .uri("/api/v1/events/{id}/attendance", eventId)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + hostSession)
                .exchange().expectStatus().isOk()
                .expectBody(AttendanceController.AttendanceResponse.class).returnResult().getResponseBody();
        assertThat(response).isNotNull();
        assertThat(response.attendeeCount()).isEqualTo(21);
        assertThat(response.names()).isEqualTo(expectedNames);
        assertThat(response.names()).hasSize(20);
        assertThat(response.remainingCount()).isEqualTo(1);
        assertThat(response.names()).contains("same-name");
        assertThat(response.names().stream().filter("same-name"::equals).count()).isEqualTo(2);
    }

    @Test
    void leavingRemovesNamesAccessAndRejoiningRestoresItWithoutInflatingCount() {
        User host = user("host");
        User attendee = user("attendee");
        UUID eventId = save(host).getId();
        String attendeeSession = sessionFor(attendee);
        join(eventId, attendeeSession).expectStatus().isOk();
        join(eventId, attendeeSession).expectStatus().isOk();
        list(eventId, attendeeSession).expectStatus().isOk().expectBody()
                .jsonPath("$.attendeeCount").isEqualTo(1);

        leave(eventId, attendeeSession).expectStatus().isNoContent();
        list(eventId, attendeeSession).expectStatus().isForbidden();
        list(eventId, sessionFor(host)).expectStatus().isOk().expectBody()
                .jsonPath("$.attendeeCount").isEqualTo(0);

        join(eventId, attendeeSession).expectStatus().isOk();
        list(eventId, attendeeSession).expectStatus().isOk().expectBody()
                .jsonPath("$.attendeeCount").isEqualTo(1)
                .jsonPath("$.names[0]").isEqualTo("attendee");
    }

    @Test
    void linkOnlyEventsCheckTokensBeforeMembershipAndNames() {
        User host = user("host");
        User attendee = user("attendee");
        User outsider = user("outsider");
        UUID eventId = save(host).getId();
        UUID token = UUID.randomUUID();
        jdbc.update("update events set visibility = 'link_only', share_token = ? where id = ?", token, eventId);
        String hostSession = sessionFor(host);
        String attendeeSession = sessionFor(attendee);
        String outsiderSession = sessionFor(outsider);

        list(eventId, hostSession).expectStatus().isNotFound();
        listWithToken(eventId, hostSession, token.toString()).expectStatus().isOk();
        listWithToken(eventId, attendeeSession, token.toString()).expectStatus().isForbidden();
        joinWithToken(eventId, attendeeSession, token.toString()).expectStatus().isOk();
        listWithToken(eventId, attendeeSession, token.toString()).expectStatus().isOk()
                .expectBody().jsonPath("$.names[0]").isEqualTo("attendee");
        listWithToken(eventId, outsiderSession, token.toString()).expectStatus().isForbidden();

        for (String invalid : new String[] {"", "not-a-token", "1-1-1-1-1", UUID.randomUUID().toString()}) {
            listWithToken(eventId, hostSession, invalid).expectStatus().isNotFound();
            listWithToken(eventId, attendeeSession, invalid).expectStatus().isNotFound();
            listWithToken(eventId, outsiderSession, invalid).expectStatus().isNotFound();
        }
    }

    @Test
    void endedAndCancelledEventsRemainReadableToAuthorizedViewers() {
        User host = user("host");
        User attendee = user("attendee");
        UUID ended = save(host).getId();
        join(ended, sessionFor(attendee)).expectStatus().isOk();
        jdbc.update("update events set starts_at = ?, ends_at = ? where id = ?",
                java.sql.Timestamp.from(TEST_NOW.minusSeconds(2)),
                java.sql.Timestamp.from(TEST_NOW.minusSeconds(1)), ended);
        list(ended, sessionFor(attendee)).expectStatus().isOk()
                .expectBody().jsonPath("$.attendeeCount").isEqualTo(1);

        UUID cancelled = save(host).getId();
        join(cancelled, sessionFor(attendee)).expectStatus().isOk();
        jdbc.update("update events set status = 'cancelled' where id = ?", cancelled);
        list(cancelled, sessionFor(host)).expectStatus().isOk()
                .expectBody().jsonPath("$.attendeeCount").isEqualTo(1);
    }

    private RestTestClient.ResponseSpec list(UUID eventId, String session) {
        return client.get().uri("/api/v1/events/{id}/attendance", eventId)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + session).exchange();
    }

    private RestTestClient.ResponseSpec listWithToken(UUID eventId, String session, String token) {
        return client.get().uri("/api/v1/events/{id}/attendance?token={token}", eventId, token)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + session).exchange();
    }

    private RestTestClient.ResponseSpec join(UUID eventId, String session) {
        return client.put().uri("/api/v1/events/{id}/attendance", eventId)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + session).exchange();
    }

    private RestTestClient.ResponseSpec joinWithToken(UUID eventId, String session, String token) {
        return client.put().uri("/api/v1/events/{id}/attendance", eventId)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + session)
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("token", token)).exchange();
    }

    private RestTestClient.ResponseSpec leave(UUID eventId, String session) {
        return client.delete().uri("/api/v1/events/{id}/attendance", eventId)
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + session).exchange();
    }

    private User user(String name) {
        return authService.signIn(new GoogleIdentity(
                "attendance-list-" + name + "-" + UUID.randomUUID(),
                name + "-" + UUID.randomUUID() + "@stevens.edu",
                true,
                name,
                "https://example.test/" + name + ".png"));
    }

    private Event save(User host) {
        return events.saveAndFlush(Event.create(
                UUID.randomUUID(), host.getId(), "Study group", "Study together", "study",
                40.7440, -74.0255, "Library", STARTS_AT, ENDS_AT, "public", null, TEST_NOW));
    }

    private String sessionFor(User user) {
        SessionBody session = client.post().uri("/api/v1/auth/session")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("handoff", handoffCodes.issue(user.getId())))
                .exchange().expectStatus().isOk().expectBody(SessionBody.class).returnResult().getResponseBody();
        assertThat(session).isNotNull();
        return session.sessionId();
    }

    record SessionBody(String sessionId) {
    }
}
