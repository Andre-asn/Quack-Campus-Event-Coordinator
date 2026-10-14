package edu.stevens.quack.auth;

import java.util.List;

import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.preauth.PreAuthenticatedAuthenticationToken;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Service;

import edu.stevens.quack.user.User;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

@Service
public class SessionService {

    private final SecurityContextRepository securityContexts = new HttpSessionSecurityContextRepository();

    public String start(HttpServletRequest request, HttpServletResponse response, User user) {
        boolean hadSession = request.getSession(false) != null;
        QuackPrincipal principal = new QuackPrincipal(
                user.getId(), user.getEmail(), user.getDisplayName(), user.getAvatarUrl());
        PreAuthenticatedAuthenticationToken authentication = new PreAuthenticatedAuthenticationToken(
                principal, null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContexts.saveContext(context, request, response);
        if (hadSession) {
            request.changeSessionId();
        }
        HttpSession session = request.getSession(false);
        if (session == null) {
            throw new IllegalStateException("Session was not created");
        }
        return session.getId();
    }
}
