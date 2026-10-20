create table events (
    id uuid primary key,

    host_id uuid not null,

    title varchar(255) not null,

    description varchar(140) not null,

    category varchar(32) not null,

    location geography(Point, 4326) not null,

    location_label varchar(255) not null,

    starts_at timestamp(6) with time zone not null,

    visibility varchar(32) not null default 'public',

    share_token uuid,

    status varchar(32) not null default 'active',

    created_at timestamp(6) with time zone not null,

    updated_at timestamp(6) with time zone not null,

    constraint events_host_fk
        foreign key (host_id)
        references users(id),

    constraint events_category_check
        check (
            category in (
                'study',
                'food',
                'sports',
                'games',
                'movie',
                'music',
                'other'
            )
        ),

    constraint events_visibility_check
        check (
            visibility in (
                'public',
                'link_only'
            )
        ),

    constraint events_status_check
        check (
            status in (
                'active',
                'cancelled'
            )
        )
);

create index events_location_gist_idx
    on events using gist (location);

create index events_starts_at_idx
    on events (starts_at);

create index events_host_id_idx
    on events (host_id);

create unique index events_share_token_unique_idx
    on events (share_token)
    where share_token is not null;
