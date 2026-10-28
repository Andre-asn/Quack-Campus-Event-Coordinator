package edu.stevens.quack.event;

import org.springframework.boot.context.properties.ConfigurationProperties;

// The campus bounding box events must fall inside. Inclusive on every edge.
@ConfigurationProperties(prefix = "quack.campus")
public record CampusProperties(double west, double south, double east, double north) {

    public CampusProperties {
        if (west >= east || south >= north) {
            throw new IllegalStateException("quack.campus must be west < east and south < north");
        }
    }

    boolean containsLatitude(double latitude) {
        return latitude >= south && latitude <= north;
    }

    boolean containsLongitude(double longitude) {
        return longitude >= west && longitude <= east;
    }
}
