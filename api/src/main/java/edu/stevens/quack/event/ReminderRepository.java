package edu.stevens.quack.event;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class ReminderRepository {

    private final JdbcTemplate jdbc;

    ReminderRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    void save(UUID eventId, UUID userId, int leadMinutes, Instant createdAt) {
        jdbc.update("""
                insert into event_reminder (event_id, user_id, lead_minutes, created_at)
                values (?, ?, ?, ?)
                on conflict (event_id, user_id) do update
                    set lead_minutes = excluded.lead_minutes,
                        created_at = excluded.created_at
                """, eventId, userId, leadMinutes, Timestamp.from(createdAt));
    }

    Integer leadMinutes(UUID eventId, UUID userId) {
        var leads = jdbc.query("""
                select lead_minutes from event_reminder
                where event_id = ? and user_id = ?
                """, (rs, row) -> rs.getInt("lead_minutes"), eventId, userId);
        return leads.isEmpty() ? null : leads.get(0);
    }

    void deleteForUser(UUID eventId, UUID userId) {
        jdbc.update("delete from event_reminder where event_id = ? and user_id = ?", eventId, userId);
    }

    void deleteForEvent(UUID eventId) {
        jdbc.update("delete from event_reminder where event_id = ?", eventId);
    }
}
