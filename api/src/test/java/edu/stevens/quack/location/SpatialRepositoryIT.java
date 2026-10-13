package edu.stevens.quack.location;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@SpringBootTest
class SpatialRepositoryIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer(
            DockerImageName.parse("postgis/postgis:16-3.4")
                    .asCompatibleSubstituteFor("postgres"));

    @Autowired
    SpatialRepository repository;

    @Test
    void detectsTwoNearbyCampusLocations() {
        boolean nearby = repository.areWithinMeters(
                40.7440, -74.0255,
                40.7432, -74.0261,
                150);

        assertThat(nearby).isTrue();
    }

    @Test
    void rejectsALocationOutsideTheRequestedDistance() {
        boolean nearby = repository.areWithinMeters(
                40.7440, -74.0255,
                40.7580, -73.9855,
                1_000);

        assertThat(nearby).isFalse();
    }
}
