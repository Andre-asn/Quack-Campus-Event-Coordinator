package edu.stevens.quack.event;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AttendanceRepository {

    private final JdbcTemplate jdbc;

    public AttendanceRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void join(UUID eventId, UUID userId) {
        jdbc.update("""
                insert into event_attendance (event_id, user_id)
                values (?, ?)
                on conflict (event_id, user_id) do nothing
                """, eventId, userId);
    }

    public long countByEventId(UUID eventId) {
        Long count = jdbc.queryForObject("""
                select count(*)
                from event_attendance
                where event_id = ?
                """, Long.class, eventId);

        return count == null ? 0L : count;
    }
}