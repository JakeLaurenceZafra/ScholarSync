-- Create consultation_slots table
CREATE TABLE IF NOT EXISTS consultation_slots (
  slot_id SERIAL PRIMARY KEY,
  adviser_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_type VARCHAR(50) DEFAULT 'FIRST_COME_FIRST_SERVE',
  max_groups INTEGER DEFAULT 2,
  status VARCHAR(20) DEFAULT 'available',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (adviser_id) REFERENCES ss_account(account_id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES ss_courses(id) ON DELETE CASCADE
);

-- Create consultation_bookings table
CREATE TABLE IF NOT EXISTS consultation_bookings (
  booking_id SERIAL PRIMARY KEY,
  slot_id INTEGER NOT NULL,
  group_id INTEGER,
  group_name VARCHAR(255),
  student_email VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  booked_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (slot_id) REFERENCES consultation_slots(slot_id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_consultation_slots_adviser ON consultation_slots(adviser_id);
CREATE INDEX IF NOT EXISTS idx_consultation_slots_course ON consultation_slots(course_id);
CREATE INDEX IF NOT EXISTS idx_consultation_slots_date ON consultation_slots(slot_date);
CREATE INDEX IF NOT EXISTS idx_consultation_bookings_slot ON consultation_bookings(slot_id);
