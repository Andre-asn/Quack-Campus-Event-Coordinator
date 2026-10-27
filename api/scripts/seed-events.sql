-- Development/demo data only. Run with psql --single-transaction -v ON_ERROR_STOP=1.
-- Stable IDs make reruns refresh dates without duplicating or deleting real events.
SELECT pg_advisory_xact_lock(450045);

INSERT INTO users (id, provider, provider_subject_id, email, email_domain,
                   display_name, is_seed, created_at)
SELECT md5('quack-45-user-' || n)::uuid, 'seed',
       md5('quack-45-user-' || n), 'quack-demo-' || n || '@example.invalid',
       'example.invalid', 'Demo Student ' || n, true, now()
FROM generate_series(1, 20) AS n
ON CONFLICT (id) DO NOTHING;

-- Fail rather than overwrite a row if an ID ever collides with non-demo data.
DO $$
BEGIN
    IF (SELECT count(*) FROM users
        WHERE id IN (SELECT md5('quack-45-user-' || n)::uuid FROM generate_series(1,20) n)
          AND provider = 'seed' AND is_seed) <> 20 THEN
        RAISE EXCEPTION 'Seed user ID collision';
    END IF;
    IF EXISTS (SELECT 1 FROM events e
        JOIN generate_series(1,2000) n ON e.id = md5('quack-45-event-' || n)::uuid
        WHERE e.host_id <> md5('quack-45-user-' || (1 + (n-1)%20))::uuid) THEN
        RAISE EXCEPTION 'Seed event ID collision';
    END IF;
END $$;

WITH locations (idx, label, lat, lon) AS (
    -- Approximate outdoor points at named Stevens campus landmarks.
    VALUES (0, 'Samuel C. Williams Library', 40.7448, -74.0255),
           (1, 'Babbio Center', 40.7426, -74.0266),
           (2, 'Schaefer Athletic Center', 40.7444, -74.0238),
           (3, 'Walker Gymnasium', 40.7435, -74.0250),
           (4, 'Castle Point', 40.7456, -74.0218),
           (5, 'Palmer Lawn', 40.7446, -74.0244),
           (6, 'Howe Center', 40.7449, -74.0239)
), data AS (
    SELECT n, l.*,
           (ARRAY['study','food','sports','games','movie','music','other'])[1+(n-1)%7] AS category,
           (ARRAY['CS study session','Lunch with classmates','Pickup sports',
                  'Board game break','Movie discussion','Music practice','Campus hangout'])[1+(n-1)%7] AS title,
           (((now() AT TIME ZONE 'America/New_York')::date + ((n-1)%3 - 1))
             + time '08:00' + (((n-1)/21)%28) * interval '30 minutes')
                AT TIME ZONE 'America/New_York' AS starts
    FROM generate_series(1,2000) n
    JOIN locations l ON l.idx = ((n-1)/7)%7
)
INSERT INTO events (id, host_id, title, description, category, location,
                    location_label, starts_at, visibility, status, created_at, updated_at)
SELECT md5('quack-45-event-' || n)::uuid,
       md5('quack-45-user-' || (1+(n-1)%20))::uuid,
       title || ' #' || n, 'Demo event: ' || title || '. Everyone is welcome!',
       category, ST_SetSRID(ST_MakePoint(lon, lat),4326)::geography,
       label, starts, 'public', 'active', starts - interval '1 day', now()
FROM data
ON CONFLICT (id) DO UPDATE SET
    title = excluded.title, description = excluded.description,
    category = excluded.category, location = excluded.location,
    location_label = excluded.location_label, starts_at = excluded.starts_at,
    visibility = excluded.visibility, status = excluded.status, updated_at = excluded.updated_at;
