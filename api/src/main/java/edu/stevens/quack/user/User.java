package edu.stevens.quack.user;

import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "users")
public class User {

    @Id
    private UUID id;

    @Column(nullable = false, length = 32)
    private String provider;

    @Column(name = "provider_subject_id", nullable = false, length = 255)
    private String providerSubjectId;

    @Column(nullable = false, length = 320)
    private String email;

    @Column(name = "email_domain", nullable = false, length = 255)
    private String emailDomain;

    @Column(name = "display_name", nullable = false, length = 255)
    private String displayName;

    @Column(name = "avatar_url", length = 2048)
    private String avatarUrl;

    @Column(name = "is_seed", nullable = false)
    private boolean seed;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    protected User() {
    }

    public static User firstSignIn(
            UUID id,
            String provider,
            String providerSubjectId,
            String email,
            String emailDomain,
            String displayName,
            String avatarUrl,
            Instant when) {
        User user = new User();
        user.id = id;
        user.provider = provider;
        user.providerSubjectId = providerSubjectId;
        user.email = email;
        user.emailDomain = emailDomain;
        user.displayName = displayName;
        user.avatarUrl = avatarUrl;
        user.seed = false;
        user.createdAt = when;
        user.lastLoginAt = when;
        return user;
    }

    public static User seed(UUID id, String email, String displayName, Instant when) {
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        int at = normalized.lastIndexOf('@');
        User user = new User();
        user.id = id;
        user.provider = "seed";
        user.providerSubjectId = id.toString();
        user.email = normalized;
        user.emailDomain = normalized.substring(at + 1);
        user.displayName = displayName;
        user.seed = true;
        user.createdAt = when;
        return user;
    }

    public void recordSignIn(String email, String emailDomain, String displayName, String avatarUrl, Instant when) {
        this.email = email;
        this.emailDomain = emailDomain;
        this.displayName = displayName;
        this.avatarUrl = avatarUrl;
        this.lastLoginAt = when;
    }

    public UUID getId() {
        return id;
    }

    public String getProvider() {
        return provider;
    }

    public String getProviderSubjectId() {
        return providerSubjectId;
    }

    public String getEmail() {
        return email;
    }

    public String getEmailDomain() {
        return emailDomain;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public boolean isSeed() {
        return seed;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }
}
