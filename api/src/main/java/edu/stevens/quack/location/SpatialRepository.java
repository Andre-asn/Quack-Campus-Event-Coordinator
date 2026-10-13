package edu.stevens.quack.location;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class SpatialRepository {

    private final JdbcTemplate jdbc;

    public SpatialRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean areWithinMeters(
            double firstLatitude,
            double firstLongitude,
            double secondLatitude,
            double secondLongitude,
            double distanceMeters) {
        String sql = """
                select ST_DWithin(
                    ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography,
                    ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography,
                    ?
                )
                """;

        return Boolean.TRUE.equals(jdbc.queryForObject(
                sql,
                Boolean.class,
                firstLongitude,
                firstLatitude,
                secondLongitude,
                secondLatitude,
                distanceMeters));
    }
}
