-- Run this in your Supabase SQL editor to create the schema

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null,
  stage text not null default 'uploaded',
  audio_url text,
  video_url text,
  analysis jsonb,
  treatment jsonb,
  elements jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  asset_type text not null,
  name text not null,
  url text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

create index on assets (project_id, asset_type);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at();
