create table event_attendance (
    event_id uuid not null,
    user_id uuid not null,
    joined_at timestamp(6) with time zone not null default current_timestamp,

    constraint event_attendance_pk
        primary key (event_id, user_id),

    constraint event_attendance_event_fk
        foreign key (event_id)
        references events(id),

    constraint event_attendance_user_fk
        foreign key (user_id)
        references users(id)
);

create index event_attendance_user_id_idx
    on event_attendance (user_id);