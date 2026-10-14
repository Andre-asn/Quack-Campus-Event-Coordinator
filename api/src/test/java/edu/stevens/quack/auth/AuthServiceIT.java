package edu.stevens.quack.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import edu.stevens.quack.PostgresIntegrationTest;
import edu.stevens.quack.user.User;
import edu.stevens.quack.user.UserRepository;

class AuthServiceIT extends PostgresIntegrationTest {

    @Autowired
    AuthService authService;

    @Autowired
    AuthProperties properties;

    @Autowired
    UserRepository users;

    @BeforeEach
    void cleanUsers() {
        users.deleteAll();
    }

    @Test
    void allowlistIsStevensEduFromConfiguration() {
        assertThat(properties.getAllowedEmailDomains()).containsExactly("stevens.edu");
    }

    @Test
    void firstSignInCreatesAUserKeyedOnProviderSubjectId() {
        User user = authService.signIn(verified("sub-1", "Ada@Stevens.EDU", "Ada Lovelace"));

        assertThat(user.getProvider()).isEqualTo("google");
        assertThat(user.getProviderSubjectId()).isEqualTo("sub-1");
        assertThat(user.getEmail()).isEqualTo("ada@stevens.edu");
        assertThat(user.getEmailDomain()).isEqualTo("stevens.edu");
        assertThat(user.getDisplayName()).isEqualTo("Ada Lovelace");
        assertThat(user.getAvatarUrl()).isEqualTo("https://example.test/avatar.png");
        assertThat(user.isSeed()).isFalse();
        assertThat(user.getCreatedAt()).isNotNull();
        assertThat(user.getLastLoginAt()).isEqualTo(user.getCreatedAt());
        assertThat(users.count()).isEqualTo(1);
    }

    @Test
    void secondSignInMatchesTheExistingProviderSubject() {
        User first = authService.signIn(verified("sub-1", "ada@stevens.edu", "Ada"));
        User second = authService.signIn(new GoogleIdentity(
                "sub-1", "ada@stevens.edu", true, "Ada Updated", "https://example.test/new.png"));

        assertThat(second.getId()).isEqualTo(first.getId());
        assertThat(second.getDisplayName()).isEqualTo("Ada Updated");
        assertThat(second.getAvatarUrl()).isEqualTo("https://example.test/new.png");
        assertThat(second.getCreatedAt()).isEqualTo(first.getCreatedAt());
        assertThat(users.count()).isEqualTo(1);
    }

    @Test
    void differentSubjectCreatesAnotherUser() {
        authService.signIn(verified("sub-1", "ada@stevens.edu", "Ada"));
        authService.signIn(verified("sub-2", "grace@stevens.edu", "Grace"));

        assertThat(users.count()).isEqualTo(2);
    }

    @Test
    void nonStevensAccountIsRejectedAndCreatesNoUser() {
        assertThatThrownBy(() -> authService.signIn(verified("gmail-sub", "ada@gmail.com", "Ada")))
                .isInstanceOf(SignInRejectedException.class)
                .extracting(ex -> ((SignInRejectedException) ex).failure())
                .isEqualTo(SignInFailure.DOMAIN_NOT_ALLOWED);
        assertThat(users.count()).isZero();
    }

    @Test
    void unverifiedEmailIsRejectedAndCreatesNoUser() {
        assertThatThrownBy(() -> authService.signIn(
                new GoogleIdentity("sub-1", "ada@stevens.edu", false, "Ada", null)))
                .isInstanceOf(SignInRejectedException.class)
                .extracting(ex -> ((SignInRejectedException) ex).failure())
                .isEqualTo(SignInFailure.EMAIL_NOT_VERIFIED);
        assertThat(users.count()).isZero();
    }

    @Test
    void seedAccountCannotSignIn() {
        users.save(User.seed(UUID.randomUUID(), "seed@stevens.edu", "Seed", Instant.parse("2026-01-01T00:00:00Z")));

        assertThatThrownBy(() -> authService.signIn(verified("real-sub", "seed@stevens.edu", "Real")))
                .isInstanceOf(SignInRejectedException.class)
                .extracting(ex -> ((SignInRejectedException) ex).failure())
                .isEqualTo(SignInFailure.SEED_ACCOUNT);
        assertThat(users.count()).isEqualTo(1);
        assertThat(users.findAll().getFirst().isSeed()).isTrue();
    }

    private static GoogleIdentity verified(String subject, String email, String name) {
        return new GoogleIdentity(subject, email, true, name, "https://example.test/avatar.png");
    }
}
