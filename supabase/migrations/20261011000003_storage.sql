-- Private document bucket. Object paths must be "<organization_id>/<document_id>/<filename>".
-- Skipped automatically where the Supabase storage schema is absent (e.g. the PGlite test harness).
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping storage setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('documents', 'documents', false, 20971520, array[
    'application/pdf', 'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
  on conflict (id) do nothing;

  execute $p$
    create policy documents_bucket_read on storage.objects
      for select to authenticated using (
        bucket_id = 'documents'
        and private.has_org_role(((storage.foldername(name))[1])::uuid, array['OWNER', 'ADMIN', 'MANAGER'])
      )
  $p$;
  -- Uploads are performed by the API with signed upload URLs; no direct client insert policy.
end;
$$;
