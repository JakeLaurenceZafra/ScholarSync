-- Create member_journals table for individual student journal entries
CREATE TABLE IF NOT EXISTS member_journals (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL,
    group_id VARCHAR(255) NOT NULL,
    member_email VARCHAR(255) NOT NULL,
    member_name VARCHAR(255) NOT NULL,
    task_updates TEXT[] DEFAULT '{}',
    action_plans TEXT[] DEFAULT '{}',
    issues TEXT[] DEFAULT '{}',
    minutes_date VARCHAR(255),
    minutes_adviser TEXT,
    minutes_key_points TEXT,
    minutes_action_items TEXT,
    minutes_action_deadlines TEXT,
    next_consultation VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_member_journals_course_group ON member_journals(course_id, group_id);
CREATE INDEX IF NOT EXISTS idx_member_journals_member_email ON member_journals(member_email);
