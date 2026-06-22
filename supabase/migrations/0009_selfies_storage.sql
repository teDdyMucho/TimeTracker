-- ─── Selfies Storage Bucket ───────────────────────────────────────────────────
-- Folder structure: selfies/{user_id}/{timestamp}.jpg
-- Public bucket so <img> tags work without signed URLs

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'selfies',
  'selfies',
  true,              -- public: browser can load images without auth
  5242880,           -- 5 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public              = true,
      file_size_limit     = 5242880,
      allowed_mime_types  = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Drop any stale policies before recreating
DROP POLICY IF EXISTS "selfies_insert_own"        ON storage.objects;
DROP POLICY IF EXISTS "selfies_read_public"        ON storage.objects;
DROP POLICY IF EXISTS "selfies_upload_own_folder"  ON storage.objects;
DROP POLICY IF EXISTS "selfies_public_read"        ON storage.objects;
DROP POLICY IF EXISTS "selfies_update_own_folder"  ON storage.objects;
DROP POLICY IF EXISTS "selfies_delete_own_folder"  ON storage.objects;

-- Authenticated users may INSERT into their own folder only
-- Path must start with their own auth.uid(), e.g. "abc-123/1719000000.jpg"
CREATE POLICY "selfies_upload_own_folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'selfies'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Public read — anyone with the URL can view (no auth required)
CREATE POLICY "selfies_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'selfies');

-- Users may delete their own files (e.g. re-take selfie)
CREATE POLICY "selfies_delete_own_folder"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'selfies'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
