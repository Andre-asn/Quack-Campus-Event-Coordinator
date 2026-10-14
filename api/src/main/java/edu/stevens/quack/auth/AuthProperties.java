package edu.stevens.quack.auth;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.springframework.boot.context.properties.ConfigurationProperties;

import jakarta.annotation.PostConstruct;

@ConfigurationProperties(prefix = "quack.auth")
public class AuthProperties {

    private List<String> allowedEmailDomains = new ArrayList<>();

    private boolean allowExpoGoRedirects;

    public List<String> getAllowedEmailDomains() {
        return allowedEmailDomains;
    }

    public void setAllowedEmailDomains(List<String> allowedEmailDomains) {
        this.allowedEmailDomains = allowedEmailDomains.stream()
                .map(domain -> domain.toLowerCase(Locale.ROOT).trim())
                .filter(domain -> !domain.isEmpty())
                .distinct()
                .toList();
    }

    public boolean isAllowExpoGoRedirects() {
        return allowExpoGoRedirects;
    }

    public void setAllowExpoGoRedirects(boolean allowExpoGoRedirects) {
        this.allowExpoGoRedirects = allowExpoGoRedirects;
    }

    @PostConstruct
    void requireAllowlist() {
        if (allowedEmailDomains.isEmpty()) {
            throw new IllegalStateException("quack.auth.allowed-email-domains must not be empty");
        }
    }
}
