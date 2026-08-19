/*
# Add increment_room_totals RPC

1. Purpose
- Atomically increments total_study_sec and total_sessions on a study_rooms row.
- Called from the frontend after a focus session completes while the user is
  in a study room. Using an RPC avoids a read-modify-write race when multiple
  members finish sessions concurrently.

2. New Functions
- `increment_room_totals(p_room_id uuid, p_study_sec integer, p_sessions integer)`
  - SECURITY DEFINER, runs as owner (bypasses RLS).
  - SET search_path = public.
  - Bounds p_study_sec and p_sessions to >= 0 to reject negative inputs.
  - UPDATEs the room row, adding the deltas.
  - Returns void.

3. Security
- EXECUTE granted to anon, authenticated (no-auth mini app, anon-key client).
- No auth.uid() dependency; the app has no sign-in.
*/

CREATE OR REPLACE FUNCTION increment_room_totals(
  p_room_id uuid,
  p_study_sec integer,
  p_sessions integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_study_sec < 0 OR p_sessions < 0 THEN
    RAISE EXCEPTION 'Invalid increment values';
  END IF;

  UPDATE study_rooms
  SET total_study_sec = total_study_sec + p_study_sec,
      total_sessions = total_sessions + p_sessions
  WHERE id = p_room_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION increment_room_totals FROM anon;
GRANT EXECUTE ON FUNCTION increment_room_totals TO anon, authenticated;
