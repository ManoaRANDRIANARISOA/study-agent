-- AUTOMATICALLY GENERATED POSTGRES SCHEMA FROM SQLITE

DROP TABLE IF EXISTS students CASCADE;

CREATE TABLE students (
    -- Metadata
    id TEXT PRIMARY KEY,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    last_synced_at timestamptz,
    deleted boolean DEFAULT false,
    
    -- Identification
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    gender TEXT CHECK(gender IN ('M', 'F')),
    photo_path TEXT,                    -- Local file path or cloud URL
    date_of_birth DATE,
    place_of_birth TEXT,
    class TEXT NOT NULL,                -- "3ème A", "CM2 B", etc.
    registration_number TEXT UNIQUE,     -- Auto-generated: YEAR-XXXXX
    enrollment_date DATE NOT NULL,
    departure_date DATE,
    previous_school TEXT,
    
    -- Family Information
    father_name TEXT,
    mother_name TEXT,
    guardian_name TEXT,
    guardian_contact TEXT,      -- Phone number (Optional)
    guardian_profession TEXT,
    address TEXT,
    
    -- Siblings (stored as JSON array of IDs)
    siblings TEXT DEFAULT '[]',          -- ["id1", "id2"]
    
    -- Contact
    email TEXT,

    -- Search optimization
    search_text TEXT GENERATED ALWAYS AS (
        lower(first_name || ' ' || last_name || ' ' || registration_number)
    ) STORED
, father_contact TEXT, mother_contact TEXT, father_profession TEXT, mother_profession TEXT, parent_personnel_id TEXT, ecole_id TEXT, is_personnel_child TEXT);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS student_fees CASCADE;

CREATE TABLE student_fees (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    school_year TEXT NOT NULL,           -- "2025-2026"
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    last_synced_at timestamptz,
    deleted boolean DEFAULT false,
    
    -- Enrollment Fees
    enrollment_fee numeric DEFAULT 0,
    reenrollment_fee numeric DEFAULT 0,
    notebook_fee numeric DEFAULT 0,
    fram_fee numeric DEFAULT 0,
    fram_paid_by_parent boolean DEFAULT false,  -- For siblings
    
    -- Tuition
    tuition_level TEXT,                  -- preschool, primary, middle, high, staff
    monthly_tuition numeric DEFAULT 0,
    
    -- Bus
    bus_subscribed boolean DEFAULT false,
    bus_route TEXT,
    bus_monthly_fee numeric DEFAULT 0,
    
    -- Canteen
    canteen_subscribed boolean DEFAULT false,
    canteen_days_per_week INTEGER DEFAULT 0,
    canteen_days TEXT,                   -- JSON array ["Monday", "Tuesday"]
    canteen_daily_rate numeric DEFAULT 0,
    
    -- Uniforms
    uniform_tshirt_purchased boolean DEFAULT false,
    uniform_apron_purchased boolean DEFAULT false,
    uniform_shorts_purchased boolean DEFAULT false,
    uniform_badge_purchased boolean DEFAULT false, class_name TEXT, uniform_items_purchased TEXT DEFAULT '[]', is_reenrollment boolean DEFAULT false, ecole_id TEXT,
    
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    UNIQUE(student_id, school_year)
);

ALTER TABLE student_fees ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS student_payments CASCADE;

CREATE TABLE student_payments (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    last_synced_at timestamptz,
    deleted boolean DEFAULT false,
    
    payment_date DATE NOT NULL,
    amount numeric NOT NULL,
    payment_type TEXT NOT NULL,          -- tuition, bus, canteen, enrollment, uniform, event
    month TEXT,                          -- For tuition (e.g., "2025-09")
    description TEXT,
    payment_method TEXT,                 -- cash, check, transfer, mobile_money
    receipt_number TEXT, school_year TEXT, ecole_id TEXT,
    
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

ALTER TABLE student_payments ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS bus_attendance CASCADE;

CREATE TABLE bus_attendance (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    
    attendance_date DATE NOT NULL,
    present boolean DEFAULT true, ecole_id TEXT,
    
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    UNIQUE(student_id, attendance_date)
);

ALTER TABLE bus_attendance ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS canteen_attendance CASCADE;

CREATE TABLE canteen_attendance (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    
    attendance_date DATE NOT NULL,
    present boolean DEFAULT true, ecole_id TEXT,
    
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    UNIQUE(student_id, attendance_date)
);

ALTER TABLE canteen_attendance ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS parent_events CASCADE;

CREATE TABLE parent_events (
    id TEXT PRIMARY KEY,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    last_synced_at timestamptz,
    deleted boolean DEFAULT false,
    
    name TEXT NOT NULL,                  -- "École des parents", "Fête de Noël"
    event_date DATE,
    amount_per_parent numeric DEFAULT 0,
    description TEXT,
    status TEXT DEFAULT 'planned'        -- planned, ongoing, completed
, ecole_id TEXT, school_year TEXT);

ALTER TABLE parent_events ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS event_payments CASCADE;

CREATE TABLE event_payments (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    parent_id TEXT,                      -- If tracking by parent (for siblings)
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    
    amount_due numeric NOT NULL,
    amount_paid numeric DEFAULT 0,
    paid boolean DEFAULT false,
    payment_date DATE, ecole_id TEXT,
    
    FOREIGN KEY (event_id) REFERENCES parent_events(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

ALTER TABLE event_payments ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS personnel CASCADE;

CREATE TABLE personnel (
    id TEXT PRIMARY KEY,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    last_synced_at timestamptz,
    deleted boolean DEFAULT false,
    
    -- Identification
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    photo_path TEXT,
    date_of_birth DATE,
    contact TEXT,
    email TEXT,
    address TEXT,
    
    -- Professional
    status TEXT,                         -- fulltime, parttime
    position TEXT,                       -- teacher, admin, direction, maintenance
    hire_date DATE NOT NULL,
    departure_date DATE,
    
    -- Teacher Specifics
    teacher_level TEXT,                  -- preschool, primary, middle, high, multi
    teacher_subjects TEXT DEFAULT '[]',  -- JSON array of subjects
    
    -- Salary
    salary_type TEXT,                    -- monthly, hourly
    monthly_salary numeric,
    hourly_rate numeric,
    
    -- Deductions Config
    has_droit boolean DEFAULT false,
    droit_amount numeric DEFAULT 0,
    cnaps_rate numeric DEFAULT 0.01,        -- 1% (verify Madagascar norms)
    irsa_rate numeric DEFAULT 0.01          -- 1% (verify Madagascar norms)
, expected_monthly_hours numeric, work_pattern TEXT DEFAULT 'daily', work_days TEXT DEFAULT '["Monday","Tuesday","Wednesday","Thursday","Friday"]', daily_hours numeric DEFAULT 8, cnaps_amount numeric, irsa_amount numeric, payroll_start_date TEXT, ecole_id TEXT);

ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS time_tracking CASCADE;

CREATE TABLE time_tracking (
    id TEXT PRIMARY KEY,
    personnel_id TEXT NOT NULL,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    
    month TEXT NOT NULL,                 -- "2025-09"
    hours_worked numeric NOT NULL,
    manually_edited boolean DEFAULT false,
    edited_by TEXT,
    edit_reason TEXT, deleted boolean DEFAULT false, ecole_id TEXT,
    
    FOREIGN KEY (personnel_id) REFERENCES personnel(id) ON DELETE CASCADE,
    UNIQUE(personnel_id, month)
);

ALTER TABLE time_tracking ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS personnel_absences CASCADE;

CREATE TABLE personnel_absences (
    id TEXT PRIMARY KEY,
    personnel_id TEXT NOT NULL,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,                         -- leave, sick, unjustified, other
    justified boolean DEFAULT true,
    document_path TEXT, deleted boolean DEFAULT false, ecole_id TEXT,
    
    FOREIGN KEY (personnel_id) REFERENCES personnel(id) ON DELETE CASCADE
);

ALTER TABLE personnel_absences ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS salary_advances CASCADE;

CREATE TABLE salary_advances (
    id TEXT PRIMARY KEY,
    personnel_id TEXT NOT NULL,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    
    amount numeric NOT NULL,
    advance_date DATE NOT NULL,
    reason TEXT,
    repaid boolean DEFAULT false,
    repayment_date DATE, deleted boolean DEFAULT false, ecole_id TEXT,
    
    FOREIGN KEY (personnel_id) REFERENCES personnel(id) ON DELETE CASCADE
);

ALTER TABLE salary_advances ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS custom_deductions CASCADE;

CREATE TABLE custom_deductions (
    id TEXT PRIMARY KEY,
    personnel_id TEXT NOT NULL,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    
    month TEXT NOT NULL,                 -- "2025-09"
    label TEXT NOT NULL,                 -- "School fees for child"
    amount numeric NOT NULL, deleted boolean DEFAULT false, ecole_id TEXT,
    
    FOREIGN KEY (personnel_id) REFERENCES personnel(id) ON DELETE CASCADE
);

ALTER TABLE custom_deductions ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS cash_journal CASCADE;

CREATE TABLE cash_journal (
    id TEXT PRIMARY KEY,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    last_synced_at timestamptz,
    deleted boolean DEFAULT false,
    
    transaction_date DATE NOT NULL,
    type TEXT NOT NULL,                  -- income, expense
    category TEXT NOT NULL,              -- scolarite, entretien, salaire, banque, autre
    subcategory TEXT,
    amount numeric NOT NULL,
    description TEXT,
    payment_method TEXT,                 -- cash, check, transfer, mobile_money
    
    -- Links
    related_student_id TEXT,
    related_personnel_id TEXT, department TEXT NOT NULL DEFAULT 'ecole', ecole_id TEXT,
    
    FOREIGN KEY (related_student_id) REFERENCES students(id) ON DELETE SET NULL,
    FOREIGN KEY (related_personnel_id) REFERENCES personnel(id) ON DELETE SET NULL
);

ALTER TABLE cash_journal ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS subjects CASCADE;

CREATE TABLE subjects (
    id TEXT PRIMARY KEY,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    deleted boolean DEFAULT false,
    
    name TEXT NOT NULL UNIQUE,           -- "Mathématiques", "Français"
    default_coefficient numeric DEFAULT 1
, ecole_id TEXT);

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS grades CASCADE;

CREATE TABLE grades (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    teacher_id TEXT,
    subject_id TEXT NOT NULL,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    
    school_year TEXT NOT NULL,           -- "2025-2026"
    term INTEGER NOT NULL,               -- 1, 2, or 3
    grade numeric NOT NULL,                 -- 0-20
    coefficient numeric DEFAULT 1,
    teacher_comment TEXT,
    behavior_note TEXT, deleted boolean DEFAULT false, grade_journalier numeric, grade_exam numeric, ecole_id TEXT,                  -- none, warning, praise
    
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (teacher_id) REFERENCES personnel(id) ON DELETE SET NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    UNIQUE(student_id, subject_id, school_year, term)
);

ALTER TABLE grades ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,         -- bcrypt hash
    role TEXT NOT NULL,                  -- admin, secretariat, accounting, direction
    full_name TEXT,
    email TEXT,
    active boolean DEFAULT true,
    last_login timestamptz
, version INTEGER DEFAULT 1, sync_status TEXT DEFAULT 'pending', last_synced_at timestamptz, deleted boolean DEFAULT false, ecole_id TEXT,
    UNIQUE(username, ecole_id)
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS settings CASCADE;

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT,                          -- JSON value
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS daily_attendance CASCADE;

CREATE TABLE daily_attendance (
    id TEXT PRIMARY KEY,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',

    personnel_id TEXT NOT NULL,
    attendance_date DATE NOT NULL,      -- "2025-09-15"
    status TEXT NOT NULL,               -- present, absent, late, half_day, excused
    hours_worked numeric DEFAULT 0,        -- heures réellement faites ce jour
    expected_hours numeric DEFAULT 0,      -- heures prévues ce jour (copié de daily_hours ou autre)
    notes TEXT,                         -- observations libres
    session_info TEXT, deleted boolean DEFAULT false, ecole_id TEXT,                  -- JSON optionnel : [{subject:"Maths",hours:2}]

    FOREIGN KEY (personnel_id) REFERENCES personnel(id) ON DELETE CASCADE,
    UNIQUE(personnel_id, attendance_date)
);

ALTER TABLE daily_attendance ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS class_subjects CASCADE;

CREATE TABLE class_subjects (
    id TEXT PRIMARY KEY,
    class_name TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    coefficient numeric DEFAULT 1,
    position INTEGER DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    deleted boolean DEFAULT false, ecole_id TEXT,

    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    UNIQUE(class_name, subject_id)
);

ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS assessments CASCADE;

CREATE TABLE assessments (
    id TEXT PRIMARY KEY,
    school_year TEXT NOT NULL,
    class_name TEXT, -- NULL means it applies to all classes
    name TEXT NOT NULL,
    term_value INTEGER NOT NULL,
    weight numeric DEFAULT 1.0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(school_year, class_name, term_value)
);

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS payroll_ignores CASCADE;

CREATE TABLE payroll_ignores (
  id TEXT PRIMARY KEY,
  personnel_id TEXT NOT NULL,
  month TEXT NOT NULL, -- Format 'YYYY-MM'
  reason TEXT,
  created_at timestamptz DEFAULT now(),
  FOREIGN KEY(personnel_id) REFERENCES personnel(id) ON DELETE CASCADE
);

ALTER TABLE payroll_ignores ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS ecoles CASCADE;

CREATE TABLE ecoles (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  parametrage TEXT, -- JSON configuration (canteen, bus, cnaps_rate, etc.)
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ecoles ENABLE ROW LEVEL SECURITY;


-- Fonction utilitaire pour récupérer l'ecole_id du token JWT
DROP FUNCTION IF EXISTS auth_ecole_id();

CREATE OR REPLACE FUNCTION auth_ecole_id()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT current_setting('request.jwt.claim.app_metadata', true)::jsonb->>'ecole_id';
$$;
