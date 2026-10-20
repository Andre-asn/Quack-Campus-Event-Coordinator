package edu.stevens.quack.event;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@SpringBootTest
class EventMigrationIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer(
            DockerImageName.parse("postgis/postgis:16-3.4")
                    .asCompatibleSubstituteFor("postgres"));

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void flywayCreatesEventsTable() {
        String table = jdbc.queryForObject(
                "select to_regclass('public.events')::text",
                String.class);

        assertThat(table).isEqualTo("events");
    }

    @Test
    void locationUsesPostgisGeographyPoint() {
        String type = jdbc.queryForObject("""
                select format_type(a.atttypid, a.atttypmod)
                from pg_attribute a
                where a.attrelid = 'public.events'::regclass
                  and a.attname = 'location'
                """, String.class);

        assertThat(type).isEqualToIgnoringCase("geography(Point,4326)");
    }

    @Test
    void requiredIndexesExist() {
        var indexes = jdbc.queryForList("""
                select indexname
                from pg_indexes
                where schemaname = 'public'
                  and tablename = 'events'
                """, String.class);

        assertThat(indexes).contains(
                "events_location_gist_idx",
                "events_starts_at_idx",
                "events_host_id_idx",
                "events_share_token_unique_idx");
    }
}