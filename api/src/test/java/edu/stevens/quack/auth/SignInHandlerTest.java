package edu.stevens.quack.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.web.authentication.preauth.PreAuthenticatedAuthenticationToken;

class SignInHandlerTest {

    private final HandoffCodes handoffCodes = new HandoffCodes(java.time.Clock.systemUTC(), java.time.Duration.ofMinutes(2));
    private final AppRedirectValidator redirects = validator();

    @Test
    void successReturnsTheHandoffToTheAppAndDropsTheBrowserSession() throws Exception {
        UUID userId = UUID.randomUUID();
        SignInSuccessHandler handler = new SignInSuccessHandler(handoffCodes, redirects);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession().setAttribute(SignInSuccessHandler.APP_REDIRECT, "quack://auth");
        MockHttpServletResponse response = new MockHttpServletResponse();
        OidcIdToken token = new OidcIdToken(
                "token",
                Instant.parse("2026-10-07T00:00:00Z"),
                Instant.parse("2026-10-07T01:00:00Z"),
                Map.of("sub", "sub-1"));

        handler.onAuthenticationSuccess(
                request,
                response,
                new PreAuthenticatedAuthenticationToken(new QuackOidcUser(token, userId), null));

        String redirected = response.getRedirectedUrl();
        assertThat(redirected).startsWith("quack://auth?handoff=");
        String handoff = redirected.substring("quack://auth?handoff=".length());
        assertThat(handoffCodes.consume(handoff)).isEqualTo(userId);
        assertThat(request.getSession(false)).isNull();
    }

    @Test
    void successDoesNotRedirectOffApp() throws Exception {
        SignInSuccessHandler handler = new SignInSuccessHandler(handoffCodes, redirects);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession().setAttribute(SignInSuccessHandler.APP_REDIRECT, "https://evil.example");
        MockHttpServletResponse response = new MockHttpServletResponse();
        OidcIdToken token = new OidcIdToken(
                "token",
                Instant.parse("2026-10-07T00:00:00Z"),
                Instant.parse("2026-10-07T01:00:00Z"),
                Map.of("sub", "sub-1"));

        handler.onAuthenticationSuccess(
                request,
                response,
                new PreAuthenticatedAuthenticationToken(new QuackOidcUser(token, UUID.randomUUID()), null));

        assertThat(response.getRedirectedUrl()).isEqualTo("/api/v1/me");
    }

    @Test
    void failureRedirectsWithTheRejectionCode() throws Exception {
        SignInFailureHandler handler = new SignInFailureHandler(redirects);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession().setAttribute(SignInSuccessHandler.APP_REDIRECT, "quack://auth");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationFailure(
                request,
                response,
                new OAuth2AuthenticationException(new OAuth2Error("DOMAIN_NOT_ALLOWED")));

        assertThat(response.getRedirectedUrl()).isEqualTo("quack://auth?error=DOMAIN_NOT_ALLOWED");
    }

    private static AppRedirectValidator validator() {
        AuthProperties properties = new AuthProperties();
        properties.setAllowedEmailDomains(java.util.List.of("stevens.edu"));
        properties.setAllowExpoGoRedirects(false);
        return new AppRedirectValidator(properties);
    }
}
