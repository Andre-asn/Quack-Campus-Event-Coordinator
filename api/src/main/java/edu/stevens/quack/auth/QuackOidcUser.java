package edu.stevens.quack.auth;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;

public final class QuackOidcUser extends DefaultOidcUser {

    private final UUID userId;

    public QuackOidcUser(OidcIdToken idToken, UUID userId) {
        super(List.of(new SimpleGrantedAuthority("ROLE_USER")), idToken);
        this.userId = userId;
    }

    public UUID userId() {
        return userId;
    }
}
