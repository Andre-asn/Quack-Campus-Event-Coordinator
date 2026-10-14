package edu.stevens.quack.auth;

import java.io.Serializable;
import java.security.Principal;
import java.util.UUID;

public record QuackPrincipal(UUID userId, String email, String displayName, String avatarUrl)
        implements Principal, Serializable {

    @Override
    public String getName() {
        return email;
    }
}
