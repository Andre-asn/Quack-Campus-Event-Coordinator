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
            UUID viewerId,
            int limit) {
        String sql = """
                select e.id, e.title, e.category, e.visibility, e.share_token, e.starts_at,
                       ST_Y(e.location::geometry) as latitude,
                       ST_X(e.location::geometry) as longitude,
                       u.display_name, u.avatar_url
                from events e
                join users u on u.id = e.host_id
                where e.status = 'active'
                  and (e.visibility = 'public' or (e.visibility = 'link_only' and e.host_id = ?))
                  and e.starts_at >= ?
                  and e.starts_at < ?
                  and e.location && ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography
                  -- Geography edges are geodesics and bow north of the south latitude, so the rectangle is checked in geometry.
                  and ST_Intersects(
                        e.location::geometry,
                        ST_MakeEnvelope(?, ?, ?, ?, 4326))
                """;
        List<Object> args = new ArrayList<>();
        args.add(viewerId);
        args.add(Timestamp.from(from));
        args.add(Timestamp.from(to));
        args.add(west);
        args.add(south);
        args.add(east);
        args.add(north);
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
                new MapEventPage.MapHost(rs.getString("display_name"), rs.getString("avatar_url")),
                rs.getString("visibility"),
                rs.getObject("share_token", UUID.class)),
                args.toArray());
    }
}
