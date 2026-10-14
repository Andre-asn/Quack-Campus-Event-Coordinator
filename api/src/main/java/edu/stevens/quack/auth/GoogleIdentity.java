package edu.stevens.quack.auth;

import org.springframework.security.oauth2.core.oidc.OidcIdToken;

public record GoogleIdentity(
        String subject,
        String email,
        boolean emailVerified,
        String displayName,
        String avatarUrl) {

    public static GoogleIdentity from(OidcIdToken token) {
        return new GoogleIdentity(
                token.getSubject(),
                stringClaim(token, "email"),
                emailVerified(token),
                stringClaim(token, "name"),
                stringClaim(token, "picture"));
    }

    private static boolean emailVerified(OidcIdToken token) {
        Object verified = token.getClaims().get("email_verified");
        if (verified instanceof Boolean value) {
            return value;
        }
        return verified instanceof String value && value.equalsIgnoreCase("true");
    }

    private static String stringClaim(OidcIdToken token, String name) {
        Object value = token.getClaims().get(name);
        return value instanceof String text ? text : null;
    }
}
