-- Seed – 3 fictitious users (passwords come from SEED_PASSWORD_HASH env var)
-- Generate a hash first: node -e "const b=require('bcrypt'); b.hash(process.env.SEED_PASSWORD,12).then(h=>console.log(h))"
-- Then set SEED_PASSWORD_HASH in your .env.

DO $$
DECLARE
  h TEXT := current_setting('app.seed_password_hash', true);
BEGIN
  -- Fall back to a placeholder hash when setting is absent (dev only)
  IF h IS NULL OR h = '' THEN
    -- bcrypt hash of "Seed@1234" (12 rounds) – CHANGE IN PRODUCTION
    h := '$2b$12$placeholder_replace_in_production_000000000000000000000';
  END IF;

  INSERT INTO users (id, name, username, email, password_hash, active, created_at)
  VALUES
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Alice Silva',   'alice',   'alice@example.com',   h, true, now()),
    ('b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Bruno Souza',  'bsouza',  'bruno@example.com',   h, true, now()),
    ('c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Carla Lima',   'climalima','carla@example.com',  h, true, now())
  ON CONFLICT DO NOTHING;
END $$;

