package edu.stevens.quack.auth;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

@Component
public class SignInSuccessHandler implements AuthenticationSuccessHandler {

    static final String APP_REDIRECT = "quack.appRedirect";

    private final HandoffCodes handoffCodes;
    private final AppRedirectValidator redirects;

    public SignInSuccessHandler(HandoffCodes handoffCodes, AppRedirectValidator redirects) {
        this.handoffCodes = handoffCodes;
        this.redirects = redirects;
    }

    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request,
            HttpServletResponse response,
            Authentication authentication) throws IOException {
        if (!(authentication.getPrincipal() instanceof QuackOidcUser user)) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        String appRedirect = appRedirect(request);
        if (appRedirect == null) {
            response.sendRedirect("/api/v1/me");
            return;
        }
        String handoff = handoffCodes.issue(user.userId());
        new SecurityContextLogoutHandler().logout(request, response, authentication);
        response.sendRedirect(appendQuery(appRedirect, "handoff", handoff));
    }

    private String appRedirect(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return null;
        }
        Object value = session.getAttribute(APP_REDIRECT);
        if (value instanceof String redirect && redirects.isAllowed(redirect)) {
            return redirect;
        }
        return null;
    }

    static String appendQuery(String url, String name, String value) {
        int hash = url.indexOf('#');
        String base = hash >= 0 ? url.substring(0, hash) : url;
        String fragment = hash >= 0 ? url.substring(hash) : "";
        String separator = base.contains("?") ? "&" : "?";
        String encoded = URLEncoder.encode(value, StandardCharsets.UTF_8);
        return base + separator + name + "=" + encoded + fragment;
    }
}
