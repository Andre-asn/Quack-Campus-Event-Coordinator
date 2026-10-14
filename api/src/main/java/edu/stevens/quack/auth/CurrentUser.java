package edu.stevens.quack.auth;

import java.util.Optional;
import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import edu.stevens.quack.user.User;
import edu.stevens.quack.user.UserRepository;

@Service
public class CurrentUser {

    private final UserRepository users;

    public CurrentUser(UserRepository users) {
        this.users = users;
    }

    public User require() {
        UUID userId = currentUserId().orElseThrow(UnauthenticatedException::new);
        return users.findById(userId).orElseThrow(UnauthenticatedException::new);
    }

    private Optional<UUID> currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return Optional.empty();
        }
        Object principal = authentication.getPrincipal();
        if (principal instanceof QuackPrincipal quack) {
            return Optional.of(quack.userId());
        }
        if (principal instanceof QuackOidcUser oidc) {
            return Optional.of(oidc.userId());
        }
        return Optional.empty();
    }
}
