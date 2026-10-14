create table users (
    id uuid primary key,
    provider varchar(32) not null,
    provider_subject_id varchar(255) not null,
    email varchar(320) not null,
    email_domain varchar(255) not null,
    display_name varchar(255) not null,
    avatar_url varchar(2048),
    is_seed boolean not null default false,
    created_at timestamp(6) with time zone not null,
    last_login_at timestamp(6) with time zone,
    constraint users_provider_subject_unique unique (provider, provider_subject_id)
);

create unique index users_email_lower_idx on users (lower(email));
