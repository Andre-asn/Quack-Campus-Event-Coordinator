package edu.stevens.quack.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import edu.stevens.quack.PostgresIntegrationTest;
import edu.stevens.quack.user.UserRepository;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "quack.auth.allowed-email-domains=example.edu"
})
class ConfiguredAllowlistIT extends PostgresIntegrationTest {

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
    void changingTheAllowlistChangesWhoCanSignIn() {
        assertThat(properties.getAllowedEmailDomains()).containsExactly("example.edu");

        authService.signIn(new GoogleIdentity("sub-1", "ada@example.edu", true, "Ada", null));
        assertThat(users.count()).isEqualTo(1);

        assertThatThrownBy(() -> authService.signIn(
                new GoogleIdentity("sub-2", "ada@stevens.edu", true, "Ada", null)))
                .isInstanceOf(SignInRejectedException.class)
                .extracting(ex -> ((SignInRejectedException) ex).failure())
                .isEqualTo(SignInFailure.DOMAIN_NOT_ALLOWED);
        assertThat(users.count()).isEqualTo(1);
    }
}
