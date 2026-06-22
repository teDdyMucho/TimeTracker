-- Create (or fix) the selfies storage bucket as public
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('selfies', 'selfies', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880;

-- Allow authenticated users to upload their own selfie folder
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'selfies_insert_own'
  ) THEN
    CREATE POLICY "selfies_insert_own" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'selfies' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

-- Public read (bucket is public so this is a belt-and-suspenders safety net)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'selfies_read_public'
  ) THEN
    CREATE POLICY "selfies_read_public" ON storage.objects
      FOR SELECT USING (bucket_id = 'selfies');
  END IF;
END $$;
