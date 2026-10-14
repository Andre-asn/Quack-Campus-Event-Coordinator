package edu.stevens.quack.health;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.test.web.servlet.client.RestTestClient;

import edu.stevens.quack.PostgresIntegrationTest;

@AutoConfigureRestTestClient
class HealthControllerIT extends PostgresIntegrationTest {

    @Autowired
    RestTestClient client;

    @Test
    void healthReportsUpWhenDatabaseIsReachable() {
        client.get().uri("/api/v1/health")
                .exchange()
                .expectStatus().isOk()
                .expectBody(HealthController.HealthResponse.class)
                .isEqualTo(new HealthController.HealthResponse("up", "up"));
    }
}
