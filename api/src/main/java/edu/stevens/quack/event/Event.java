package edu.stevens.quack.event;

import java.time.Instant;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "events")
public class Event {

    private static final GeometryFactory WGS84 = new GeometryFactory(new PrecisionModel(), 4326);

    @Id
    private UUID id;

    @Column(name = "host_id", nullable = false)
    private UUID hostId;

    @Column(nullable = false, length = 255)
    private String title;

    @Column(nullable = false, length = 140)
    private String description;

    @Column(nullable = false, length = 32)
    private String category;

    // JTS points are (x, y) = (longitude, latitude).
    @JdbcTypeCode(SqlTypes.GEOGRAPHY)
    @Column(nullable = false)
    private Point location;

    @Column(name = "location_label", nullable = false, length = 255)
    private String locationLabel;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(nullable = false, length = 32)
    private String visibility;

    @Column(name = "share_token")
    private UUID shareToken;

    @Column(nullable = false, length = 32)
    private String status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Event() {
    }

    public static Event create(
            UUID id,
            UUID hostId,
            String title,
            String description,
            String category,
            double latitude,
            double longitude,
            String locationLabel,
            Instant startsAt,
            Instant when) {
        Event event = new Event();
        event.id = id;
        event.hostId = hostId;
        event.title = title;
        event.description = description;
        event.category = category;
        event.location = WGS84.createPoint(new Coordinate(longitude, latitude));
        event.locationLabel = locationLabel;
        event.startsAt = startsAt;
        event.visibility = "public";
        event.status = "active";
        event.createdAt = when;
        event.updatedAt = when;
        return event;
    }

    public UUID getId() {
        return id;
    }

    public UUID getHostId() {
        return hostId;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public String getCategory() {
        return category;
    }

    public double getLatitude() {
        return location.getY();
    }

    public double getLongitude() {
        return location.getX();
    }

    public String getLocationLabel() {
        return locationLabel;
    }

    public Instant getStartsAt() {
        return startsAt;
    }

    public String getVisibility() {
        return visibility;
    }

    public UUID getShareToken() {
        return shareToken;
    }

    public String getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
