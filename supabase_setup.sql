-- ────────────────────────────────────────
-- 착착(ChakChak) Supabase 테이블 설정
-- Supabase → SQL Editor 에 붙여넣고 실행하세요
-- ────────────────────────────────────────

-- 대화 히스토리 테이블
CREATE TABLE IF NOT EXISTS conversations (
  id          BIGSERIAL PRIMARY KEY,
  sender_id   TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_sender ON conversations(sender_id, created_at);

-- 예약 테이블
CREATE TABLE IF NOT EXISTS bookings (
  id               BIGSERIAL PRIMARY KEY,
  sender_id        TEXT NOT NULL,
  customer_name    TEXT,
  service          TEXT,
  booking_time     TEXT,
  photo_agree      BOOLEAN DEFAULT FALSE,
  vibe             TEXT CHECK (vibe IN ('quiet', 'chat', 'pro')),
  special_note     TEXT,
  status           TEXT DEFAULT 'confirmed',
  discount_applied INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bookings_created ON bookings(created_at);
