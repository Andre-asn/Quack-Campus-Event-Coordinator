package edu.stevens.quack.auth;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class HandoffCodes {

    private final Clock clock;
    private final Duration ttl;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Entry> codes = new ConcurrentHashMap<>();

    @Autowired
    public HandoffCodes(Clock clock) {
        this(clock, Duration.ofMinutes(2));
    }

    HandoffCodes(Clock clock, Duration ttl) {
        this.clock = clock;
        this.ttl = ttl;
    }

    public String issue(UUID userId) {
        Instant now = clock.instant();
        codes.entrySet().removeIf(entry -> !entry.getValue().expiresAt().isAfter(now));
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String code = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        codes.put(code, new Entry(userId, now.plus(ttl)));
        return code;
    }

    public UUID consume(String code) {
        if (code == null || code.isBlank()) {
            throw new InvalidHandoffException();
        }
        Entry entry = codes.remove(code);
        if (entry == null || !entry.expiresAt().isAfter(clock.instant())) {
            throw new InvalidHandoffException();
        }
        return entry.userId();
    }

    private record Entry(UUID userId, Instant expiresAt) {
    }
}
