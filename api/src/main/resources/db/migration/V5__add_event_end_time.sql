ALTER TABLE events
    ADD COLUMN ends_at timestamp(6) with time zone;

ALTER TABLE events
    ADD CONSTRAINT events_end_after_start_check
        CHECK (ends_at > starts_at);