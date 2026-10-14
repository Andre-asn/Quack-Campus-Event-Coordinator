package edu.stevens.quack.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.UUID;

import org.junit.jupiter.api.Test;

class HandoffCodesTest {

    @Test
    void codeIsSingleUseAndExpires() {
        MutableClock clock = new MutableClock(Instant.parse("2026-10-07T00:00:00Z"));
        HandoffCodes codes = new HandoffCodes(clock, Duration.ofSeconds(30));
        UUID userId = UUID.randomUUID();

        String code = codes.issue(userId);
        assertThat(codes.consume(code)).isEqualTo(userId);
        assertThatThrownBy(() -> codes.consume(code)).isInstanceOf(InvalidHandoffException.class);

        String expiring = codes.issue(userId);
        clock.advance(Duration.ofSeconds(31));
        assertThatThrownBy(() -> codes.consume(expiring)).isInstanceOf(InvalidHandoffException.class);
        assertThatThrownBy(() -> codes.consume(" ")).isInstanceOf(InvalidHandoffException.class);
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        private MutableClock(Instant now) {
            this.now = now;
        }

        private void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
