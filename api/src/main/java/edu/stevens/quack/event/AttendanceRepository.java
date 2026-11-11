package edu.stevens.quack.event;

import java.util.List;
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

    public void leave(UUID eventId, UUID userId) {
        jdbc.update("""
                delete from event_attendance
                where event_id = ? and user_id = ?
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

    /**
     * Reads the names, total, and viewer membership from one database snapshot.
     * The synthetic row keeps zero-attendee events representable without a second query.
     */
    public List<AttendanceSnapshotRow> snapshot(UUID eventId, UUID viewerId) {
        return jdbc.query("""
                with ordered as (
                    select u.display_name,
                           a.joined_at,
                           a.user_id,
                           row_number() over (order by a.joined_at, a.user_id) as attendee_number,
                           count(*) over () as attendee_count
                    from event_attendance a
                    join users u on u.id = a.user_id
                    where a.event_id = ?
                ),
                viewer as (
                    select exists (
                        select 1
                        from event_attendance
                        where event_id = ? and user_id = ?
                    ) as viewer_joined
                ),
                summary as (
                    select count(*) as attendee_count
                    from ordered
                )
                select display_name, attendee_count, viewer_joined, joined_at, user_id, 0 as row_kind
                from ordered cross join viewer
                where attendee_number <= 20
                union all
                select null, attendee_count, viewer_joined, null, null, 1
                from summary cross join viewer
                where attendee_count = 0
                order by row_kind, joined_at nulls last, user_id nulls last
                """, (rs, row) -> new AttendanceSnapshotRow(
                        rs.getString("display_name"),
                        rs.getLong("attendee_count"),
                        rs.getBoolean("viewer_joined")),
                eventId, eventId, viewerId);
    }

    public record AttendanceSnapshotRow(String displayName, long attendeeCount, boolean viewerJoined) {
    }
}
