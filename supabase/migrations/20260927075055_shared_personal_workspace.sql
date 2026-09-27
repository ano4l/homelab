-- One private workspace, shared by the owner's authenticated devices.
-- This project must be dedicated to VK: the auth trigger closes further signup.
begin;
do $$ begin
  if exists(select 1 from auth.users) then
    raise exception 'VK first-owner setup requires a dedicated Auth project with no existing users. No changes applied.';
  end if;
end $$;
create schema if not exists vk_private;
revoke all on schema vk_private from public, anon, authenticated;

create table public.vk_registration (
  id boolean primary key default true check (id),
  is_open boolean not null default true
);
insert into public.vk_registration (id) values (true);
alter table public.vk_registration enable row level security;
revoke all on public.vk_registration from anon, authenticated;
grant select on public.vk_registration to anon, authenticated;
create policy registration_status on public.vk_registration for select to anon, authenticated using (true);

create table vk_private.bootstrap (
  id boolean primary key default true check (id),
  setup_hash text not null,
  document jsonb not null check (jsonb_typeof(document) = 'object')
);
revoke all on vk_private.bootstrap from public, anon, authenticated;

create table public.vk_workspace (
  id boolean primary key default true check (id),
  owner_id uuid not null references auth.users(id) on delete restrict,
  document jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint workspace_document check (
    jsonb_typeof(document) = 'object' and document->>'version' = '2'
    and document ?& array['version','projects','tasks','captures','background','directions','debtors','events','alerts','connections','settings']
    and octet_length(document::text) <= 20971520
    and jsonb_typeof(document->'projects') = 'array'
    and jsonb_typeof(document->'tasks') = 'array'
    and jsonb_typeof(document->'captures') = 'array'
    and jsonb_typeof(document->'background') = 'array'
    and jsonb_typeof(document->'directions') = 'array'
    and jsonb_typeof(document->'debtors') = 'array'
    and jsonb_typeof(document->'events') = 'array'
    and jsonb_typeof(document->'alerts') = 'array'
    and jsonb_typeof(document->'connections') = 'array'
    and jsonb_typeof(document->'settings') = 'object'
  )
);
alter table public.vk_workspace enable row level security;
revoke all on public.vk_workspace from anon, authenticated;
grant select on public.vk_workspace to authenticated;
grant update (document, revision) on public.vk_workspace to authenticated;
create policy owner_read on public.vk_workspace for select to authenticated using (owner_id = (select auth.uid()));
create policy owner_update on public.vk_workspace for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create function vk_private.check_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.revision <> old.revision + 1 then
    raise exception 'A workspace save must increment the revision by one.' using errcode = '40001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger vk_revision before update on public.vk_workspace for each row execute function vk_private.check_revision();

-- SECURITY DEFINER is necessary ONLY here: GoTrue cannot access our private
-- seed. This is a trigger, not an RPC. EXECUTE is revoked from client roles.
-- auth.uid() is intentionally unavailable during first account creation;
-- authorization is the one-use random setup secret AND a locked singleton.
create function vk_private.claim_first_account() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  signup_open boolean;
  setup vk_private.bootstrap%rowtype;
begin
  select is_open into signup_open from public.vk_registration where id = true for update;
  if signup_open is distinct from true then
    raise exception 'VK registration is closed. Sign in with the existing owner account.';
  end if;
  select * into setup from vk_private.bootstrap where id = true;
  if new.email is null or coalesce(new.is_anonymous, false) or setup.setup_hash is null
     or encode(sha256(convert_to(coalesce(new.raw_user_meta_data->>'vk_setup_code', ''), 'UTF8')), 'hex') <> setup.setup_hash then
    raise exception 'Use your private setup link to create the owner account.';
  end if;
  update public.vk_registration set is_open = false where id = true;
  insert into public.vk_workspace (id, owner_id, document) values (true, new.id, setup.document);
  update auth.users set raw_user_meta_data = raw_user_meta_data - 'vk_setup_code' where id = new.id;
  -- Keep the seed as an administrative recovery copy, but invalidate the code.
  update vk_private.bootstrap set setup_hash = 'consumed' where id = true;
  return new;
end;
$$;
revoke all on function vk_private.claim_first_account() from public, anon, authenticated;
revoke all on function vk_private.check_revision() from public, anon, authenticated;
create trigger vk_first_account after insert on auth.users for each row execute function vk_private.claim_first_account();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.vk_workspace;
  end if;
end $$;
commit;
