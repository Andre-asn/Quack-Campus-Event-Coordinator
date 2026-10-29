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
class AttendanceIT extends PostgresIntegrationTest {

    @Autowired
    RestTestClient client;

    @Autowired
    AuthService authService;

    @Autowired
    HandoffCodes handoffCodes;

    @Autowired
    UserRepository users;

    @Autowired
    EventRepository events;

    @Autowired
    AttendanceRepository attendance;

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
    void joinsAsTheSignedInStudent() {
        User host = user("host");
        User student = user("student");
        UUID eventId = createEvent(host);

        assertThat(attendance.countByEventId(eventId)).isZero();

        join(eventId, sessionFor(student))
                .expectStatus().isOk();

        assertThat(attendance.countByEventId(eventId)).isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "select user_id from event_attendance where event_id = ?",
                UUID.class, eventId)).isEqualTo(student.getId());
    }

    @Test
    void joiningTwiceStillReturns200AndStoresOneRow() {
        User host = user("host");
        User student = user("student");
        UUID eventId = createEvent(host);
        String session = sessionFor(student);

        join(eventId, session).expectStatus().isOk();
        join(eventId, session).expectStatus().isOk();

        assertThat(attendance.countByEventId(eventId)).isEqualTo(1L);
    }

    @Test
    void differentStudentsCanJoinTheSameEvent() {
        User host = user("host");
        UUID eventId = createEvent(host);

        join(eventId, sessionFor(user("student-one")))
                .expectStatus().isOk();
        join(eventId, sessionFor(user("student-two")))
                .expectStatus().isOk();

        assertThat(attendance.countByEventId(eventId)).isEqualTo(2L);
    }

    @Test
    void rejectsCancelledEventsWithoutAddingAttendance() {
        User host = user("host");
        User student = user("student");
        UUID eventId = createEvent(host);

        jdbc.update(
                "update events set status = 'cancelled' where id = ?",
                eventId);

        join(eventId, sessionFor(student))
                .expectStatus().isEqualTo(409)
                .expectHeader()
                .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.status").isEqualTo(409)
                .jsonPath("$.code").isEqualTo("EVENT_CANCELLED")
                .jsonPath("$.detail").isNotEmpty();

        assertThat(attendance.countByEventId(eventId)).isZero();
    }

    @Test
    void rejectsMissingEvents() {
        User student = user("student");

        join(UUID.randomUUID(), sessionFor(student))
                .expectStatus().isNotFound()
                .expectHeader()
                .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.code").isEqualTo("EVENT_NOT_FOUND");

        assertThat(jdbc.queryForObject(
                "select count(*) from event_attendance",
                Long.class)).isZero();
    }

    @Test
    void rejectsAnonymousCallers() {
        UUID eventId = createEvent(user("host"));

        client.put()
                .uri("/api/v1/events/" + eventId + "/attendance")
                .exchange()
                .expectStatus().isUnauthorized();

        assertThat(attendance.countByEventId(eventId)).isZero();
    }

    private User user(String name) {
        return authService.signIn(new GoogleIdentity(
                "attendance-" + name,
                name + "@stevens.edu",
                true,
                name,
                null));
    }

    private UUID createEvent(User host) {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);

        Event event = Event.create(
                UUID.randomUUID(),
                host.getId(),
                "Study group",
                "Study together",
                "study",
                40.7440,
                -74.0255,
                "Library",
                now.plus(2, ChronoUnit.HOURS),
                now);

        return events.saveAndFlush(event).getId();
    }

    private RestTestClient.ResponseSpec join(UUID eventId, String session) {
        return client.put()
                .uri("/api/v1/events/" + eventId + "/attendance")
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + session)
                .exchange();
    }

    private String sessionFor(User user) {
        SessionBody session = client.post()
                .uri("/api/v1/auth/session")
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