package edu.stevens.quack.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.DataIntegrityViolationException;
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

    @Test
    void insertsEventForExistingHost() {
        UUID hostId = insertHost();
        UUID eventId = insertEvent(hostId, "study", "public", null, "active");

        Integer count = jdbc.queryForObject(
                "select count(*) from events where id = ?",
                Integer.class,
                eventId);

        assertThat(count).isEqualTo(1);
    }

    @Test
    void rejectsEventWithNonexistentHost() {
        assertThatThrownBy(() -> insertEvent(UUID.randomUUID(), "study", "public", null, "active"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsInvalidCategory() {
        assertThatThrownBy(() -> insertEvent(insertHost(), "invalid", "public", null, "active"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsInvalidVisibility() {
        assertThatThrownBy(() -> insertEvent(insertHost(), "study", "invalid", null, "active"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsInvalidStatus() {
        assertThatThrownBy(() -> insertEvent(insertHost(), "study", "public", null, "invalid"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsDuplicateNonNullShareTokens() {
        UUID hostId = insertHost();
        UUID shareToken = UUID.randomUUID();
        insertEvent(hostId, "study", "link_only", shareToken, "active");

        assertThatThrownBy(() -> insertEvent(hostId, "food", "link_only", shareToken, "active"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void allowsMultipleEventsWithoutShareTokens() {
        UUID hostId = insertHost();
        UUID firstEvent = insertEvent(hostId, "study", "public", null, "active");
        UUID secondEvent = insertEvent(hostId, "food", "public", null, "active");

        Integer count = jdbc.queryForObject(
                "select count(*) from events where id in (?, ?)",
                Integer.class,
                firstEvent,
                secondEvent);

        assertThat(count).isEqualTo(2);
    }

    @Test
    void locationIndexUsesGist() {
        String accessMethod = jdbc.queryForObject("""
                select am.amname
                from pg_index i
                join pg_class idx on idx.oid = i.indexrelid
                join pg_am am on am.oid = idx.relam
                where i.indrelid = 'public.events'::regclass
                  and idx.relname = 'events_location_gist_idx'
                  and pg_get_indexdef(i.indexrelid, 1, true) = 'location'
                """, String.class);

        assertThat(accessMethod).isEqualTo("gist");
    }

    private UUID insertHost() {
        UUID hostId = UUID.randomUUID();
        String uniqueValue = hostId.toString();

        jdbc.update("""
                insert into users (
                    id, provider, provider_subject_id, email, email_domain,
                    display_name, is_seed, created_at, last_login_at
                ) values (?, 'google', ?, ?, 'stevens.edu', 'Migration Test', true, now(), now())
                """,
                hostId,
                uniqueValue,
                "migration-" + uniqueValue + "@stevens.edu");

        return hostId;
    }

    private UUID insertEvent(
            UUID hostId,
            String category,
            String visibility,
            UUID shareToken,
            String status) {
        UUID eventId = UUID.randomUUID();

        jdbc.update("""
                insert into events (
                    id, host_id, title, description, category, location, location_label,
                    starts_at, visibility, share_token, status, created_at, updated_at
                ) values (
                    ?, ?, 'Migration Test', 'Test event', ?,
                    st_setsrid(st_makepoint(-74.0255, 40.7440), 4326)::geography,
                    'Campus', now(), ?, ?::uuid, ?, now(), now()
                )
                """,
                eventId,
                hostId,
                category,
                visibility,
                shareToken,
                status);

        return eventId;
    }
}