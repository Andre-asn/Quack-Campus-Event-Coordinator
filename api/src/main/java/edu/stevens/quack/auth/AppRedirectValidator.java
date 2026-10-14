package edu.stevens.quack.auth;

import java.net.URI;
import java.util.Locale;

import org.springframework.stereotype.Component;

@Component
public class AppRedirectValidator {

    private final boolean allowExpoGoRedirects;

    public AppRedirectValidator(AuthProperties properties) {
        this.allowExpoGoRedirects = properties.isAllowExpoGoRedirects();
    }

    public void validate(String appRedirect) {
        if (!isAllowed(appRedirect)) {
            throw new InvalidAppRedirectException();
        }
    }

    public boolean isAllowed(String appRedirect) {
        if (appRedirect == null || appRedirect.isBlank()) {
            return false;
        }
        URI uri;
        try {
            uri = URI.create(appRedirect);
        } catch (IllegalArgumentException ex) {
            return false;
        }
        if (uri.getScheme() == null || uri.getUserInfo() != null || uri.getRawUserInfo() != null) {
            return false;
        }
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        if ("quack".equals(scheme)) {
            String path = uri.getPath();
            return "auth".equals(uri.getHost()) && (path == null || path.isEmpty() || "/".equals(path));
        }
        if (!allowExpoGoRedirects || !("exp".equals(scheme) || "exps".equals(scheme))) {
            return false;
        }
        String path = uri.getPath() == null ? "" : uri.getPath();
        return "/--/auth".equals(path) || path.endsWith("/--/auth");
    }
}
