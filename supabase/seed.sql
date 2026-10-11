-- Development seed data. Local/dev only: never run against production.
-- Creates one organization with the Atrium/L70 scenario locations and five staff, one manager, one owner.
-- Password for every seeded user: TeamPilot!dev1

do $$
declare
  org uuid := '00000000-0000-4000-8000-000000000001';
  users jsonb := '[
    {"id":"10000000-0000-4000-8000-000000000001","email":"owner@teampilot.dev","name":"Olivia Owner","role":"OWNER"},
    {"id":"10000000-0000-4000-8000-000000000002","email":"manager@teampilot.dev","name":"Marcus Manager","role":"MANAGER"},
    {"id":"10000000-0000-4000-8000-000000000003","email":"ana@teampilot.dev","name":"Ana Staff","role":"STAFF"},
    {"id":"10000000-0000-4000-8000-000000000004","email":"ben@teampilot.dev","name":"Ben Staff","role":"STAFF"},
    {"id":"10000000-0000-4000-8000-000000000005","email":"chen@teampilot.dev","name":"Chen Staff","role":"STAFF"},
    {"id":"10000000-0000-4000-8000-000000000006","email":"dana@teampilot.dev","name":"Dana Staff","role":"STAFF"},
    {"id":"10000000-0000-4000-8000-000000000007","email":"eli@teampilot.dev","name":"Eli Staff","role":"STAFF"}
  ]';
  u jsonb;
begin
  insert into public.organizations (id, name, slug, timezone)
  values (org, 'Demo Venue Operations', 'demo-venue', 'America/New_York')
  on conflict (id) do nothing;

  for u in select * from jsonb_array_elements(users) loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', (u->>'id')::uuid, 'authenticated', 'authenticated',
      u->>'email', extensions.crypt('TeamPilot!dev1', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', u->>'name'), now(), now(),
      '', '', '', ''
    ) on conflict (id) do nothing;

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), (u->>'id')::uuid, u->>'id',
      jsonb_build_object('sub', u->>'id', 'email', u->>'email', 'email_verified', true),
      'email', now(), now(), now())
    on conflict do nothing;

    insert into public.memberships (organization_id, user_id, role)
    values (org, (u->>'id')::uuid, u->>'role')
    on conflict (organization_id, user_id) do nothing;
  end loop;

  insert into public.locations (organization_id, name, description) values
    (org, 'Atrium', 'Main atrium event space'),
    (org, 'L70', 'Level 70 conference rooms')
  on conflict do nothing;
end;
$$;
