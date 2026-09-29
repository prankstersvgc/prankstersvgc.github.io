-- Migration inicial (baseline) do site do Team Pranksters.
-- Representa tudo que já existia no banco antes de adotarmos migrations com a CLI do
-- Supabase — por isso é idempotente (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / DROP
-- POLICY IF EXISTS antes de recriar): rodar em cima do banco de produção, que já tinha
-- boa parte disso criado manualmente, não apaga nem duplica nada.
--
-- A partir daqui, qualquer mudança de schema vira uma migration NOVA (nunca edite esta).
-- Veja o README na seção "Mudanças no banco (migrations)" pra saber como.

-- ============ TABELAS ============

create table if not exists public.league_players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Uma temporada é um período de N rodadas (ex: "Temporada 1", 8 rodadas).
-- As rodadas de uma temporada não precisam acontecer toda semana (pula quando tem
-- evento oficial da Pokémon Company, por exemplo) — round_date é livre, só a
-- sequência de round_number importa pra pontuação.
create table if not exists public.league_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  total_rounds int not null check (total_rounds > 0),
  is_active boolean not null default true,
  started_at date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.league_rounds (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  round_number int not null check (round_number > 0),
  round_date date not null,
  created_at timestamptz not null default now(),
  unique (season_id, round_number)
);

-- Pontuação: 3 pontos por vitória + 1 ponto de participação (por ter jogado a rodada).
-- Empates/derrotas não somam além disso. É calculado automaticamente pelo banco —
-- o formulário do site só pede vitórias e derrotas.
create table if not exists public.league_results (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.league_rounds(id) on delete cascade,
  player_id uuid not null references public.league_players(id) on delete cascade,
  wins int not null default 0 check (wins >= 0),
  losses int not null default 0 check (losses >= 0),
  points int generated always as (wins * 3 + 1) stored,
  paste_url text,
  created_at timestamptz not null default now(),
  unique (round_id, player_id)
);

-- paste_url foi adicionado depois — ADD COLUMN IF NOT EXISTS cobre quem já tinha a tabela
-- criada sem essa coluna.
alter table public.league_results add column if not exists paste_url text;

-- "Amistosos" e "Fotos" (galeria avulsa) saíram do site — o conteúdo delas agora vira
-- posts no feed de notícias. As tabelas ficam aqui sem uso, sem risco, caso precisem
-- voltar um dia; não são mais referenciadas pelo app.
create table if not exists public.friendlies (
  id uuid primary key default gen_random_uuid(),
  opponent_team text not null,
  played_at date not null,
  our_score int not null default 0,
  their_score int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  image_path text not null,
  caption text,
  event_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  location text,
  format text,
  link text,
  notes text,
  created_at timestamptz not null default now()
);

-- Feed de notícias (a home do site). Um post pode ter texto, uma foto de capa e,
-- opcionalmente, uma tabela de resultados avulsa (post_results) — pra eventos que não
-- são rodada da liga, tipo um Challenge da loja.
create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  cover_image_path text,
  post_date date not null default current_date,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.post_results (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.news_posts(id) on delete cascade,
  player_id uuid not null references public.league_players(id) on delete cascade,
  wins int not null default 0 check (wins >= 0),
  losses int not null default 0 check (losses >= 0),
  points int generated always as (wins * 3 + 1) stored,
  paste_url text,
  created_at timestamptz not null default now(),
  unique (post_id, player_id)
);

-- Classificação acumulada, agrupada por temporada.
create or replace view public.league_standings as
select
  s.id as season_id,
  s.name as season_name,
  s.total_rounds,
  s.is_active as season_is_active,
  p.id as player_id,
  p.name as player_name,
  count(res.id) as rounds_played,
  coalesce(sum(res.wins), 0) as total_wins,
  coalesce(sum(res.losses), 0) as total_losses,
  coalesce(sum(res.points), 0) as total_points
from public.league_seasons s
join public.league_rounds lr on lr.season_id = s.id
join public.league_results res on res.round_id = lr.id
join public.league_players p on p.id = res.player_id
group by s.id, s.name, s.total_rounds, s.is_active, p.id, p.name
order by s.id, total_points desc, total_wins desc, p.name asc;

-- ============ PERMISSÕES ============

grant usage on schema public to anon, authenticated;

grant select on
  public.league_players,
  public.league_seasons,
  public.league_rounds,
  public.league_results,
  public.friendlies,
  public.tournaments,
  public.gallery_photos,
  public.news_posts,
  public.post_results,
  public.league_standings
to anon, authenticated;

grant insert, update, delete on
  public.league_players,
  public.league_seasons,
  public.league_rounds,
  public.league_results,
  public.friendlies,
  public.tournaments,
  public.gallery_photos,
  public.news_posts,
  public.post_results
to authenticated;

-- ============ ROW LEVEL SECURITY ============
-- Leitura liberada pra qualquer visitante; escrita só pra quem estiver logado
-- (as 4 contas do time, criadas manualmente em Authentication > Users).
-- news_posts/post_results são a exceção: rascunho (is_published = false) só aparece
-- pra quem está logado, até alguém publicar.
-- Os "drop policy if exists" deixam este arquivo seguro de rodar mais de uma vez.

alter table public.league_players enable row level security;
alter table public.league_seasons enable row level security;
alter table public.league_rounds enable row level security;
alter table public.league_results enable row level security;
alter table public.friendlies enable row level security;
alter table public.tournaments enable row level security;
alter table public.gallery_photos enable row level security;
alter table public.news_posts enable row level security;
alter table public.post_results enable row level security;

drop policy if exists "public read" on public.league_players;
drop policy if exists "public read" on public.league_seasons;
drop policy if exists "public read" on public.league_rounds;
drop policy if exists "public read" on public.league_results;
drop policy if exists "public read" on public.friendlies;
drop policy if exists "public read" on public.tournaments;
drop policy if exists "public read" on public.gallery_photos;
drop policy if exists "published or own" on public.news_posts;
drop policy if exists "results of visible posts" on public.post_results;

create policy "public read" on public.league_players for select using (true);
create policy "public read" on public.league_seasons for select using (true);
create policy "public read" on public.league_rounds for select using (true);
create policy "public read" on public.league_results for select using (true);
create policy "public read" on public.friendlies for select using (true);
create policy "public read" on public.tournaments for select using (true);
create policy "public read" on public.gallery_photos for select using (true);

create policy "published or own" on public.news_posts for select
  using (is_published = true or auth.role() = 'authenticated');

create policy "results of visible posts" on public.post_results for select
  using (
    exists (
      select 1 from public.news_posts p
      where p.id = post_results.post_id
        and (p.is_published = true or auth.role() = 'authenticated')
    )
  );

drop policy if exists "team write" on public.league_players;
drop policy if exists "team write" on public.league_seasons;
drop policy if exists "team write" on public.league_rounds;
drop policy if exists "team write" on public.league_results;
drop policy if exists "team write" on public.friendlies;
drop policy if exists "team write" on public.tournaments;
drop policy if exists "team write" on public.gallery_photos;
drop policy if exists "team write" on public.news_posts;
drop policy if exists "team write" on public.post_results;

create policy "team write" on public.league_players for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "team write" on public.league_seasons for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "team write" on public.league_rounds for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "team write" on public.league_results for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "team write" on public.friendlies for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "team write" on public.tournaments for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "team write" on public.gallery_photos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "team write" on public.news_posts for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "team write" on public.post_results for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============ STORAGE (fotos) ============
-- O mesmo bucket "gallery" é usado pra imagem de capa dos posts do feed.

insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do nothing;

drop policy if exists "public read gallery" on storage.objects;
drop policy if exists "team write gallery" on storage.objects;
drop policy if exists "team delete gallery" on storage.objects;

create policy "public read gallery" on storage.objects for select
  using (bucket_id = 'gallery');

create policy "team write gallery" on storage.objects for insert
  with check (bucket_id = 'gallery' and auth.role() = 'authenticated');

create policy "team delete gallery" on storage.objects for delete
  using (bucket_id = 'gallery' and auth.role() = 'authenticated');
