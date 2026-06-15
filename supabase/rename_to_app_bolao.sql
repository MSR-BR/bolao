-- Data-preserving migration from the original bolao_* table names to the
-- shared-pilots naming convention app_bolao_*.

alter table public.bolao_pools rename to app_bolao_pools;
alter table public.bolao_participants rename to app_bolao_participants;

alter table public.app_bolao_pools rename constraint bolao_pools_pkey to app_bolao_pools_pkey;
alter table public.app_bolao_pools rename constraint bolao_pools_code_key to app_bolao_pools_code_key;
alter table public.app_bolao_pools rename constraint bolao_pools_code_check to app_bolao_pools_code_check;
alter table public.app_bolao_pools rename constraint bolao_pools_search_days_check to app_bolao_pools_search_days_check;

alter table public.app_bolao_participants rename constraint bolao_participants_pkey to app_bolao_participants_pkey;
alter table public.app_bolao_participants rename constraint bolao_participants_pool_id_fkey to app_bolao_participants_pool_id_fkey;
alter table public.app_bolao_participants rename constraint bolao_participants_home_goals_check to app_bolao_participants_home_goals_check;
alter table public.app_bolao_participants rename constraint bolao_participants_away_goals_check to app_bolao_participants_away_goals_check;

alter index public.bolao_participants_pool_created_idx rename to app_bolao_participants_pool_created_idx;
alter function public.set_bolao_updated_at() rename to set_app_bolao_updated_at;

alter trigger set_bolao_pools_updated_at on public.app_bolao_pools rename to set_app_bolao_pools_updated_at;
alter trigger set_bolao_participants_updated_at on public.app_bolao_participants rename to set_app_bolao_participants_updated_at;

revoke all on public.app_bolao_pools from anon, authenticated;
revoke all on public.app_bolao_participants from anon, authenticated;
revoke all on function public.set_app_bolao_updated_at() from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.app_bolao_pools to service_role;
grant select, insert, update, delete on public.app_bolao_participants to service_role;
grant execute on function public.set_app_bolao_updated_at() to service_role;
