create table event_announcement (
    id uuid primary key,
    event_id uuid not null,
    author_id uuid not null,
    body varchar(280) not null,
    created_at timestamp(6) with time zone not null,

    constraint event_announcement_event_fk
        foreign key (event_id)
        references events(id),

    constraint event_announcement_author_fk
        foreign key (author_id)
        references users(id)
);

create index event_announcement_event_created_idx
    on event_announcement (event_id, created_at desc, id desc);

create table event_reminder (
    event_id uuid not null,
    user_id uuid not null,
    lead_minutes integer not null,
    created_at timestamp(6) with time zone not null,

    constraint event_reminder_pk
        primary key (event_id, user_id),

    constraint event_reminder_lead_check
        check (lead_minutes in (15, 60)),

    constraint event_reminder_event_fk
        foreign key (event_id)
        references events(id),

    constraint event_reminder_user_fk
        foreign key (user_id)
        references users(id)
);
