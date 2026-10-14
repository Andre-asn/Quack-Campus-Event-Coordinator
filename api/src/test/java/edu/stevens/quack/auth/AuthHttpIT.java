package edu.stevens.quack.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.web.servlet.client.RestTestClient;

import edu.stevens.quack.PostgresIntegrationTest;
import edu.stevens.quack.user.UserRepository;

@AutoConfigureRestTestClient
class AuthHttpIT extends PostgresIntegrationTest {

    @Autowired
    RestTestClient client;

    @Autowired
    AuthService authService;

    @Autowired
    HandoffCodes handoffCodes;

    @Autowired
    UserRepository users;

    @LocalServerPort
    int port;

    @org.junit.jupiter.api.BeforeEach
    void cleanUsers() {
        users.deleteAll();
    }

    @Test
    void protectedEndpointRejectsAnonymousCallers() {
        client.get().uri("/api/v1/me")
                .exchange()
                .expectStatus().isUnauthorized()
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.code").isEqualTo("UNAUTHENTICATED")
                .jsonPath("$.status").isEqualTo(401);
    }

    @Test
    void loginStartsTheGoogleOAuthFlow() {
        String start = client.get().uri("/api/v1/auth/login")
                .exchange()
                .expectStatus().isFound()
                .expectHeader().value(HttpHeaders.LOCATION, location ->
                        assertThat(location).contains("/oauth2/authorization/google"))
                .returnResult(Void.class)
                .getResponseHeaders()
                .getFirst(HttpHeaders.LOCATION);

        client.get().uri(start)
                .exchange()
                .expectStatus().isFound()
                .expectHeader().value(HttpHeaders.LOCATION, location -> {
                    assertThat(location).contains("accounts.google.com");
                    assertThat(location).contains("redirect_uri=");
                    assertThat(location).contains("/api/v1/auth/callback");
                });
    }

    @Test
    void loginRejectsAnOpenRedirect() {
        client.get().uri("/api/v1/auth/login?appRedirect={redirect}", "https://evil.example/auth")
                .exchange()
                .expectStatus().isBadRequest()
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.code").isEqualTo("INVALID_APP_REDIRECT");
    }

    @Test
    void sessionSurvivesANewClientAndLogoutInvalidatesIt() {
        var user = authService.signIn(new GoogleIdentity(
                "sub-1", "ada@stevens.edu", true, "Ada", "https://example.test/a.png"));
        String handoff = handoffCodes.issue(user.getId());

        SessionBody created = client.post().uri("/api/v1/auth/session")
                .contentType(MediaType.APPLICATION_JSON)
                .body(java.util.Map.of("handoff", handoff))
                .exchange()
                .expectStatus().isOk()
                .expectHeader().value(HttpHeaders.SET_COOKIE, cookie -> assertThat(cookie).contains("HttpOnly"))
                .expectBody(SessionBody.class)
                .returnResult()
                .getResponseBody();

        assertThat(created).isNotNull();
        assertThat(created.user().email()).isEqualTo("ada@stevens.edu");
        assertThat(created.sessionId()).isNotBlank();

        RestTestClient restarted = RestTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .build();
        restarted.get().uri("/api/v1/me")
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + created.sessionId())
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.email").isEqualTo("ada@stevens.edu")
                .jsonPath("$.displayName").isEqualTo("Ada");

        restarted.post().uri("/api/v1/auth/logout")
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + created.sessionId())
                .exchange()
                .expectStatus().isNoContent();

        restarted.get().uri("/api/v1/me")
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + created.sessionId())
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    void handoffExchangeRotatesAnExistingSessionId() {
        var user = authService.signIn(new GoogleIdentity("sub-1", "ada@stevens.edu", true, "Ada", null));
        SessionBody first = exchange(handoffCodes.issue(user.getId()), null);
        SessionBody second = exchange(handoffCodes.issue(user.getId()), first.sessionId());

        assertThat(second.sessionId()).isNotEqualTo(first.sessionId());

        RestTestClient caller = RestTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .build();
        caller.get().uri("/api/v1/me")
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + first.sessionId())
                .exchange()
                .expectStatus().isUnauthorized();
        caller.get().uri("/api/v1/me")
                .header(HttpHeaders.COOKIE, "JSESSIONID=" + second.sessionId())
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.email").isEqualTo("ada@stevens.edu");
    }

    private SessionBody exchange(String handoff, String sessionId) {
        var request = client.post().uri("/api/v1/auth/session")
                .contentType(MediaType.APPLICATION_JSON)
                .body(java.util.Map.of("handoff", handoff));
        if (sessionId != null) {
            request = request.header(HttpHeaders.COOKIE, "JSESSIONID=" + sessionId);
        }
        SessionBody created = request.exchange()
                .expectStatus().isOk()
                .expectBody(SessionBody.class)
                .returnResult()
                .getResponseBody();
        assertThat(created).isNotNull();
        assertThat(created.sessionId()).isNotBlank();
        return created;
    }

    @Test
    void handoffCannotBeReused() {
        var user = authService.signIn(new GoogleIdentity("sub-1", "ada@stevens.edu", true, "Ada", null));
        String handoff = handoffCodes.issue(user.getId());
        java.util.Map<String, String> body = java.util.Map.of("handoff", handoff);

        client.post().uri("/api/v1/auth/session")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .exchange()
                .expectStatus().isOk();

        client.post().uri("/api/v1/auth/session")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .exchange()
                .expectStatus().isUnauthorized()
                .expectBody()
                .jsonPath("$.code").isEqualTo("INVALID_HANDOFF");
    }

    record SessionBody(String sessionId, UserBody user) {
    }

    record UserBody(String id, String email, String displayName, String avatarUrl) {
    }
}
