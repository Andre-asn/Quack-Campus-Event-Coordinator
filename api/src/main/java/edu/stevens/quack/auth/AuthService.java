package edu.stevens.quack.auth;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import edu.stevens.quack.user.User;
import edu.stevens.quack.user.UserRepository;

@Service
public class AuthService {

    static final String PROVIDER = "google";

    private final UserRepository users;
    private final AuthProperties properties;
    private final Clock clock;

    public AuthService(UserRepository users, AuthProperties properties, Clock clock) {
        this.users = users;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public User signIn(GoogleIdentity identity) {
        String subject = blankToNull(identity.subject());
        String email = normalizeEmail(identity.email());
        if (subject == null || email == null) {
            throw new SignInRejectedException(SignInFailure.INVALID_IDENTITY);
        }
        int at = email.lastIndexOf('@');
        if (at <= 0 || at != email.indexOf('@') || at == email.length() - 1) {
            throw new SignInRejectedException(SignInFailure.INVALID_IDENTITY);
        }
        if (!identity.emailVerified()) {
            throw new SignInRejectedException(SignInFailure.EMAIL_NOT_VERIFIED);
        }
        String domain = email.substring(at + 1);
        if (!properties.getAllowedEmailDomains().contains(domain)) {
            throw new SignInRejectedException(SignInFailure.DOMAIN_NOT_ALLOWED);
        }

        String displayName = displayName(identity.displayName(), email, at);
        String avatarUrl = avatarUrl(identity.avatarUrl());
        Optional<User> bySubject = users.findByProviderAndProviderSubjectId(PROVIDER, subject);
        Optional<User> byEmail = users.findByEmailIgnoreCase(email);
        if (byEmail.isPresent() && byEmail.get().isSeed()) {
            throw new SignInRejectedException(SignInFailure.SEED_ACCOUNT);
        }
        if (byEmail.isPresent() && (bySubject.isEmpty() || !bySubject.get().getId().equals(byEmail.get().getId()))) {
            throw new SignInRejectedException(SignInFailure.EMAIL_IN_USE);
        }
        if (bySubject.isPresent()) {
            User existing = bySubject.get();
            if (existing.isSeed()) {
                throw new SignInRejectedException(SignInFailure.SEED_ACCOUNT);
            }
            existing.recordSignIn(email, domain, displayName, avatarUrl, now());
            return users.save(existing);
        }
        User created = User.firstSignIn(
                UUID.randomUUID(), PROVIDER, subject, email, domain, displayName, avatarUrl, now());
        try {
            return users.saveAndFlush(created);
        } catch (DataIntegrityViolationException ex) {
            throw new SignInRejectedException(SignInFailure.EMAIL_IN_USE);
        }
    }

    private Instant now() {
        // Postgres stores timestamp(6), so keep microseconds or the read-back value drifts.
        return clock.instant().truncatedTo(ChronoUnit.MICROS);
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String normalizeEmail(String value) {
        String trimmed = blankToNull(value);
        return trimmed == null ? null : trimmed.toLowerCase(Locale.ROOT);
    }

    private static String displayName(String name, String email, int at) {
        String displayName = name == null ? "" : name.trim();
        if (displayName.isEmpty()) {
            displayName = email.substring(0, at);
        }
        if (displayName.length() > 255) {
            return displayName.substring(0, 255);
        }
        return displayName;
    }

    private static String avatarUrl(String avatarUrl) {
        if (avatarUrl == null || avatarUrl.isBlank()) {
            return null;
        }
        String trimmed = avatarUrl.trim();
        return trimmed.length() > 2048 ? null : trimmed;
    }
}
