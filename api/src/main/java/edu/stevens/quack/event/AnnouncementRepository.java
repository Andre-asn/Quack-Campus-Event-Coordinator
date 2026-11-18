package edu.stevens.quack.event;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class AnnouncementRepository {

    private final JdbcTemplate jdbc;

    AnnouncementRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    void insert(UUID id, UUID eventId, UUID authorId, String body, Instant createdAt) {
        jdbc.update("""
                insert into event_announcement (id, event_id, author_id, body, created_at)
                values (?, ?, ?, ?, ?)
                """, id, eventId, authorId, body, Timestamp.from(createdAt));
    }

    List<AnnouncementController.Announcement> page(
            UUID eventId, Instant cursorCreatedAt, UUID cursorId, int limit) {
        String sql = """
                select id, body, created_at
                from event_announcement
                where event_id = ?
                """;
        if (cursorCreatedAt == null) {
            sql += " order by created_at desc, id desc limit ?";
            return jdbc.query(sql, (rs, row) -> new AnnouncementController.Announcement(
                    rs.getObject("id", UUID.class),
                    rs.getString("body"),
                    rs.getTimestamp("created_at").toInstant()),
                    eventId, limit);
        }
        sql += """
                 and (created_at < ? or (created_at = ? and id < ?))
                 order by created_at desc, id desc limit ?
                """;
        return jdbc.query(sql, (rs, row) -> new AnnouncementController.Announcement(
                rs.getObject("id", UUID.class),
                rs.getString("body"),
                rs.getTimestamp("created_at").toInstant()),
                eventId,
                Timestamp.from(cursorCreatedAt),
                Timestamp.from(cursorCreatedAt),
                cursorId,
                limit);
    }
}
