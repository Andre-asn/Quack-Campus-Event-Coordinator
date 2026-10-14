package edu.stevens.quack.auth;

import java.io.IOException;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import edu.stevens.quack.user.User;
import edu.stevens.quack.user.UserRepository;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@RestController
@RequestMapping("/api/v1")
public class AuthController {

    private final AppRedirectValidator redirects;
    private final HandoffCodes handoffCodes;
    private final UserRepository users;
    private final SessionService sessions;
    private final CurrentUser currentUser;

    public AuthController(
            AppRedirectValidator redirects,
            HandoffCodes handoffCodes,
            UserRepository users,
            SessionService sessions,
            CurrentUser currentUser) {
        this.redirects = redirects;
        this.handoffCodes = handoffCodes;
        this.users = users;
        this.sessions = sessions;
        this.currentUser = currentUser;
    }

    @GetMapping("/auth/login")
    public void login(
            @RequestParam(name = "appRedirect", required = false) String appRedirect,
            HttpServletRequest request,
            HttpServletResponse response) throws IOException {
        if (appRedirect != null) {
            redirects.validate(appRedirect);
            request.getSession(true).setAttribute(SignInSuccessHandler.APP_REDIRECT, appRedirect);
        }
        response.sendRedirect("/oauth2/authorization/google");
    }

    @PostMapping("/auth/session")
    public SessionResponse session(
            @RequestBody HandoffRequest body,
            HttpServletRequest request,
            HttpServletResponse response) {
        UUID userId = handoffCodes.consume(body.handoff());
        User user = users.findById(userId).orElseThrow(InvalidHandoffException::new);
        if (user.isSeed()) {
            throw new InvalidHandoffException();
        }
        // The system browser that finished Google sign-in does not share cookies with the app.
        // The cookie stays HttpOnly; the native client stores this same session id.
        String sessionId = sessions.start(request, response, user);
        return new SessionResponse(sessionId, UserResponse.from(user));
    }

    @PostMapping("/auth/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        new SecurityContextLogoutHandler().logout(
                request, response, SecurityContextHolder.getContext().getAuthentication());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public UserResponse me() {
        return UserResponse.from(currentUser.require());
    }

    public record HandoffRequest(String handoff) {
    }

    public record SessionResponse(String sessionId, UserResponse user) {
    }
}
