create table public.ss_account (
  account_id serial not null,
  "accountName" character varying(255) not null,
  "accountEmail" character varying(255) not null,
  "accountRole" character varying(50) null default 'Student'::character varying,
  "accountGroup" character varying(255) null,
  "googleAccessToken" text null,
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  "googleRefreshToken" text null,
  constraint ss_account_pkey primary key (account_id),
  constraint ss_account_accountEmail_key unique ("accountEmail")
) TABLESPACE pg_default;

create table public.ss_ai_cache (
  id serial not null,
  course_id integer null,
  group_name text null,
  type text null,
  result text null,
  data_hash text null,
  updated_at timestamp without time zone null default CURRENT_TIMESTAMP,
  constraint ss_ai_cache_pkey primary key (id),
  constraint ss_ai_cache_unique_key unique (course_id, group_name, type)
) TABLESPACE pg_default;

create table public.ss_attendance (
  att_id serial not null,
  "conID" integer null,
  one_id integer null,
  mem1 text null,
  two_id integer null,
  mem2 text null,
  three_id integer null,
  mem3 text null,
  four_id integer null,
  mem4 text null,
  five_id integer null,
  mem5 text null,
  constraint ss_attendance_pkey primary key (att_id),
  constraint ss_attendance_conid_fkey foreign KEY ("conID") references ss_consultation ("conID")
) TABLESPACE pg_default;

create table public.ss_connected_sheets (
  id uuid not null default gen_random_uuid (),
  "courseID" integer not null,
  "sheetId" text not null,
  "sheetName" text not null default 'Connected Sheet'::text,
  "groupCount" integer not null default 0,
  created_at timestamp with time zone not null default now(),
  constraint ss_connected_sheets_pkey primary key (id),
  constraint ss_connected_sheets_courseID_sheetId_key unique ("courseID", "sheetId"),
  constraint ss_connected_sheets_courseID_fkey foreign KEY ("courseID") references ss_courses (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.ss_consultation (
  "conID" serial not null,
  "courseID" integer null,
  "groupName" text null,
  slot_id integer null,
  "conDate" text null,
  "conType" text null,
  "conMil" text null,
  "conSum" text null,
  "conAction" text null,
  "conAtt" text null,
  "isDraft" boolean null default true,
  status text null default 'DRAFT'::text,
  "conNotes" text null,
  adviser_notes text null,
  attendance_data jsonb null default '{}'::jsonb,
  participation_data jsonb null default '{}'::jsonb,
  submitted_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint ss_consultation_pkey primary key ("conID"),
  constraint ss_consultation_courseid_fkey foreign KEY ("courseID") references ss_courses (id),
  constraint ss_consultation_slot_id_fkey foreign KEY (slot_id) references ss_consultation_slots (slot_id) on delete set null,
  constraint ss_consultation_status_check check (
    (
      status = any (
        array[
          'DRAFT'::text,
          'SUBMITTED'::text,
          'COMPLETED'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create table public.ss_courses (
  id serial not null,
  "courseName" character varying(255) not null,
  "courseCode" character varying(50) not null,
  "courseSection" character varying(50) not null,
  "courseTerm" character varying(50) not null,
  "courseAdviser" character varying(255) null,
  "courseKey" character varying(50) not null,
  "courseAmount" integer null default 0,
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  "courseSheetUrl" text null,
  constraint ss_courses_pkey primary key (id),
  constraint ss_courses_courseKey_key unique ("courseKey")
) TABLESPACE pg_default;

create table public.ss_enrollments (
  id serial not null,
  account_id integer null,
  course_id integer null,
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  constraint ss_enrollments_pkey primary key (id),
  constraint ss_enrollments_account_id_course_id_key unique (account_id, course_id),
  constraint ss_enrollments_account_id_fkey foreign KEY (account_id) references ss_account (account_id) on delete CASCADE,
  constraint ss_enrollments_course_id_fkey foreign KEY (course_id) references ss_courses (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.ss_group (
  "smallgroupID" serial not null,
  "groupName" text null,
  member1 text null,
  "roleOne" text null,
  member2 text null,
  "roleTwo" text null,
  member3 text null,
  "roleThree" text null,
  member4 text null,
  "roleFour" text null,
  member5 text null,
  "roleFive" text null,
  constraint ss_group_pkey primary key ("smallgroupID"),
  constraint ss_group_groupname_key unique ("groupName")
) TABLESPACE pg_default;

create table public.ss_member_journals (
  id serial not null,
  "courseID" integer not null,
  "groupName" text not null,
  member_email text not null,
  journal_date date not null,
  task_updates jsonb not null default '[]'::jsonb,
  action_plans jsonb not null default '[]'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  minutes_date date null,
  minutes_adviser text null,
  minutes_key_points text null,
  minutes_action_items text null,
  minutes_action_deadlines text null,
  next_consultation date null,
  constraint ss_member_journals_pkey primary key (id),
  constraint ss_member_journals_courseid_fkey foreign KEY ("courseID") references ss_courses (id) on delete CASCADE,
  constraint ss_member_journals_member_email_fkey foreign KEY (member_email) references ss_account ("accountEmail") on delete CASCADE
) TABLESPACE pg_default;

create table public.ss_participation (
  part_id serial not null,
  "conID" integer null,
  mem1 integer null,
  part1 text null,
  mem2 integer null,
  part2 text null,
  mem3 integer null,
  part3 text null,
  mem4 integer null,
  part4 text null,
  mem5 integer null,
  part5 text null,
  constraint ss_participation_pkey primary key (part_id),
  constraint ss_participation_conid_fkey foreign KEY ("conID") references ss_consultation ("conID")
) TABLESPACE pg_default;

create table public.ss_consultation_bookings (
  booking_id serial not null,
  slot_id integer not null,
  course_id integer not null,
  group_id integer not null,
  group_name text not null,
  booked_by_email text not null,
  status text not null default 'BOOKED'::text,
  consultation_id integer null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint ss_consultation_bookings_pkey primary key (booking_id),
  constraint ss_consultation_bookings_consultation_id_fkey foreign KEY (consultation_id) references ss_consultation ("conID") on delete set null,
  constraint ss_consultation_bookings_course_id_fkey foreign KEY (course_id) references ss_courses (id) on delete CASCADE,
  constraint ss_consultation_bookings_group_id_fkey foreign KEY (group_id) references ss_group ("smallgroupID") on delete CASCADE,
  constraint ss_consultation_bookings_slot_id_fkey foreign KEY (slot_id) references ss_consultation_slots (slot_id) on delete CASCADE,
  constraint ss_consultation_bookings_status_check check (
    (
      status = any (
        array[
          'BOOKED'::text,
          'CANCELLED'::text,
          'RESCHEDULED'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_consultation_bookings_slot_status on public.ss_consultation_bookings using btree (slot_id, status) TABLESPACE pg_default;

create index IF not exists idx_consultation_bookings_group_status on public.ss_consultation_bookings using btree (group_id, status) TABLESPACE pg_default;


create table public.ss_consultation_slots (
  slot_id serial not null,
  course_id integer not null,
  owner_account_id integer not null,
  owner_role text not null,
  slot_date date not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  slot_type text not null,
  max_groups integer not null default 1,
  allowed_group_id integer null,
  google_event_id text null,
  created_at timestamp with time zone not null default now(),
  constraint ss_consultation_slots_pkey primary key (slot_id),
  constraint ss_consultation_slots_course_id_fkey foreign KEY (course_id) references ss_courses (id) on delete CASCADE,
  constraint ss_consultation_slots_allowed_group_id_fkey foreign KEY (allowed_group_id) references ss_group ("smallgroupID") on delete set null,
  constraint ss_consultation_slots_owner_account_id_fkey foreign KEY (owner_account_id) references ss_account (account_id) on delete CASCADE,
  constraint ss_consultation_slots_slot_type_check check (
    (
      slot_type = any (
        array[
          'FIRST_COME_FIRST_SERVE'::text,
          'SPECIFIC_GROUP'::text
        ]
      )
    )
  ),
  constraint ss_consultation_slots_owner_role_check check (
    (
      owner_role = any (array['Admin'::text, 'Adviser'::text])
    )
  ),
  constraint ss_consultation_slots_check check ((start_time < end_time)),
  constraint ss_consultation_slots_max_groups_check check ((max_groups > 0))
) TABLESPACE pg_default;

create index IF not exists idx_consultation_slots_course_date on public.ss_consultation_slots using btree (course_id, slot_date, start_time) TABLESPACE pg_default;

create index IF not exists idx_consultation_slots_owner_date on public.ss_consultation_slots using btree (owner_account_id, slot_date, start_time) TABLESPACE pg_default;



