package edu.stevens.quack.auth;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.stereotype.Component;

import edu.stevens.quack.web.ApiProblems;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

@Component
public class SignInFailureHandler implements AuthenticationFailureHandler {

    private final AppRedirectValidator redirects;

    public SignInFailureHandler(AppRedirectValidator redirects) {
        this.redirects = redirects;
    }

    @Override
    public void onAuthenticationFailure(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException exception) throws IOException {
        String appRedirect = appRedirect(request);
        new SecurityContextLogoutHandler().logout(request, response, null);
        String code = errorCode(exception);
        if (appRedirect != null) {
            response.sendRedirect(SignInSuccessHandler.appendQuery(appRedirect, "error", code));
            return;
        }
        ApiProblems.write(response, ApiProblems.of(
                HttpStatus.FORBIDDEN,
                code,
                "Sign-in rejected",
                "Sign-in was rejected."));
    }

    private String appRedirect(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return null;
        }
        Object value = session.getAttribute(SignInSuccessHandler.APP_REDIRECT);
        if (value instanceof String redirect && redirects.isAllowed(redirect)) {
            return redirect;
        }
        return null;
    }

    private static String errorCode(AuthenticationException exception) {
        if (exception instanceof OAuth2AuthenticationException oauth
                && oauth.getError() != null
                && oauth.getError().getErrorCode() != null
                && oauth.getError().getErrorCode().matches("[A-Za-z0-9_]{1,64}")) {
            return oauth.getError().getErrorCode();
        }
        return "SIGN_IN_FAILED";
    }
}
