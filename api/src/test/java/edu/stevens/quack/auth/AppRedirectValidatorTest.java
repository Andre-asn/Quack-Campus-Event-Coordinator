package edu.stevens.quack.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class AppRedirectValidatorTest {

    private final AppRedirectValidator production = validator(false);
    private final AppRedirectValidator expoGo = validator(true);

    @Test
    void allowsTheAppScheme() {
        assertThat(production.isAllowed("quack://auth")).isTrue();
        assertThat(production.isAllowed("quack://auth/")).isTrue();
    }

    @Test
    void rejectsOpenRedirects() {
        assertThat(production.isAllowed("https://evil.example/auth")).isFalse();
        assertThat(production.isAllowed("quack://evil")).isFalse();
        assertThat(production.isAllowed("quack://auth@evil.example")).isFalse();
        assertThat(production.isAllowed("javascript:alert(1)")).isFalse();
        assertThatThrownBy(() -> production.validate("https://evil.example"))
                .isInstanceOf(InvalidAppRedirectException.class);
    }

    @Test
    void expoGoRedirectsAreConfiguration() {
        assertThat(production.isAllowed("exp://127.0.0.1:8081/--/auth")).isFalse();
        assertThat(expoGo.isAllowed("exp://127.0.0.1:8081/--/auth")).isTrue();
        assertThat(expoGo.isAllowed("exps://u.expo.dev/--/auth")).isTrue();
        assertThat(expoGo.isAllowed("exp://127.0.0.1:8081/--/other")).isFalse();
    }

    private static AppRedirectValidator validator(boolean allowExpoGo) {
        AuthProperties properties = new AuthProperties();
        properties.setAllowedEmailDomains(java.util.List.of("stevens.edu"));
        properties.setAllowExpoGoRedirects(allowExpoGo);
        return new AppRedirectValidator(properties);
    }
}
