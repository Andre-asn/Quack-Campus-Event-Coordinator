package edu.stevens.quack.event;

import static org.assertj.core.api.Assertions.assertThat;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import edu.stevens.quack.PostgresIntegrationTest;

@Transactional
class SeedEventsIT extends PostgresIntegrationTest {
    @Autowired JdbcTemplate jdbc;

    @Test
    void rerunningSeeds2000EventsAcrossEveryCategoryAndThreeCampusDates() throws Exception {
        jdbc.update("delete from events");
        jdbc.update("delete from users");
        String sql = Files.readString(Path.of("scripts/seed-events.sql"));
        jdbc.execute(sql);
        jdbc.execute(sql);
        assertThat(jdbc.queryForObject("select count(*) from events", Integer.class)).isEqualTo(2000);
        assertThat(jdbc.queryForObject("select count(*) from users where is_seed and provider='seed'", Integer.class)).isEqualTo(20);
        assertThat(jdbc.queryForList("select distinct category from events", String.class))
                .containsExactlyInAnyOrder("study", "food", "sports", "games", "movie", "music", "other");
        assertThat(jdbc.queryForList("""
                select distinct (starts_at at time zone 'America/New_York')::date
                - (now() at time zone 'America/New_York')::date from events
                """, Integer.class)).containsExactlyInAnyOrder(-1, 0, 1);
        assertThat(jdbc.queryForObject("select count(distinct location_label) from events", Integer.class)).isEqualTo(7);
        assertThat(jdbc.queryForObject("""
                select min(n) from (select count(*) n from events
                group by ST_AsText(location::geometry)) spots
                """, Integer.class)).isGreaterThanOrEqualTo(7);
    }
}
