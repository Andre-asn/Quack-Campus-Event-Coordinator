package edu.stevens.quack.event;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class MapEventQuery {

    private final JdbcTemplate jdbc;

    MapEventQuery(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<MapEventPage.MapPin> find(
            double west,
            double south,
            double east,
            double north,
            Instant from,
            Instant to,
            Instant cursorStartsAt,
            UUID cursorId,
            int limit) {
        String sql = """
                select e.id, e.title, e.category, e.starts_at,
                       ST_Y(e.location::geometry) as latitude,
                       ST_X(e.location::geometry) as longitude,
                       u.display_name, u.avatar_url
                from events e
                join users u on u.id = e.host_id
                where e.visibility = 'public'
                  and e.status = 'active'
                  and e.starts_at >= ?
                  and e.starts_at < ?
                  and ST_Intersects(
                        e.location,
                        ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography)
                """;
        List<Object> args = new ArrayList<>();
        args.add(Timestamp.from(from));
        args.add(Timestamp.from(to));
        args.add(west);
        args.add(south);
        args.add(east);
        args.add(north);
        if (cursorStartsAt != null) {
            sql += """
                     and (e.starts_at > ? or (e.starts_at = ? and e.id > ?))
                    """;
            args.add(Timestamp.from(cursorStartsAt));
            args.add(Timestamp.from(cursorStartsAt));
            args.add(cursorId);
        }
        sql += " order by e.starts_at, e.id limit ?";
        args.add(limit);

        return jdbc.query(sql, (rs, row) -> new MapEventPage.MapPin(
                rs.getObject("id", UUID.class),
                rs.getString("title"),
                rs.getString("category"),
                rs.getDouble("latitude"),
                rs.getDouble("longitude"),
                rs.getTimestamp("starts_at").toInstant(),
                new MapEventPage.MapHost(rs.getString("display_name"), rs.getString("avatar_url"))),
                args.toArray());
    }
}
