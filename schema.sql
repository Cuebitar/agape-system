CREATE TABLE IF NOT EXISTS artworks (
 id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'General', description TEXT NOT NULL DEFAULT '', image_url TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 1 AND 100), minimum_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(minimum_amount >= 0), active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS offers (
 id BIGSERIAL PRIMARY KEY, artwork_id BIGINT REFERENCES artworks(id), guest_name TEXT NOT NULL, phone TEXT NOT NULL, table_no TEXT NOT NULL DEFAULT '', amount NUMERIC(12,2) NOT NULL CHECK(amount > 0), donate_if_unsuccessful BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS allocations (
 artwork_id BIGINT NOT NULL REFERENCES artworks(id), slot INTEGER NOT NULL, offer_id BIGINT NOT NULL UNIQUE REFERENCES offers(id), amount NUMERIC(12,2) NOT NULL, payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','cancelled')), PRIMARY KEY(artwork_id,slot)
);
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), is_open BOOLEAN NOT NULL DEFAULT FALSE, closed_at TIMESTAMPTZ);
INSERT INTO settings(id,is_open) VALUES(1,FALSE) ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS offers_artwork_idx ON offers(artwork_id);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS stage_name TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS allow_stage_name BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS rounds (
 category TEXT PRIMARY KEY CHECK(category IN ('Personal','Family','Church','General')),
 started_at TIMESTAMPTZ,
 ends_at TIMESTAMPTZ,
 closed_at TIMESTAMPTZ,
 CHECK (ends_at IS NULL OR started_at IS NOT NULL)
);
INSERT INTO rounds(category) VALUES ('Personal'),('Family'),('Church'),('General') ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS offers_category_idx ON offers(category,created_at,id);
-- The app connects with its server-side PostgreSQL credentials. Enable RLS so
-- these tables remain inaccessible through the public Supabase REST API.
ALTER TABLE artworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
