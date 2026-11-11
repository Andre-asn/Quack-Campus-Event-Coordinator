package edu.stevens.quack.event;

import java.util.UUID;

import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface EventRepository extends JpaRepository<Event, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from Event e where e.id = :id")
    java.util.Optional<Event> findByIdForUpdate(@Param("id") UUID id);
}
