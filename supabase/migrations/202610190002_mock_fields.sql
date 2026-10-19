-- Preserve the standard customer fields shown in docs/mock.png.
alter table public.customers
 add column name_kana text check(name_kana is null or length(trim(name_kana)) between 1 and 20000),
 add column employee_size text check(employee_size is null or length(trim(employee_size)) between 1 and 20000),
 add column established_on date,
 add column revenue_scale text check(revenue_scale is null or length(trim(revenue_scale)) between 1 and 20000);
alter table public.customers drop constraint customers_trade_status_check;
alter table public.customers add constraint customers_trade_status_check check(trade_status in ('prospect','proposing','active','inactive'));
insert into public.activity_kinds(id,name,display_order) values
 ('00000000-0000-4000-8000-000000000016','提案',7),
 ('00000000-0000-4000-8000-000000000017','契約',8)
on conflict(id) do nothing;

-- Save the joined contract-engineer form as one transaction.
create or replace function public.crm_mutate(command jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare tbl text; entity_id uuid; current_row jsonb; incoming jsonb; old_version integer; life text; cols text; vals text; updates text; op text; field record; target jsonb; link uuid; actor uuid=auth.uid(); child_command jsonb;
begin
 if not crm_member() then raise exception 'CRMへの利用登録がありません。'; end if;
 perform pg_advisory_xact_lock(104219);
 if command->>'kind'='batch' then
  if jsonb_typeof(command->'commands') is distinct from 'array' then raise exception '一括保存の操作が不正です。'; end if;
  if jsonb_array_length(command->'commands') not between 1 and 10 then raise exception '一括保存の操作が不正です。'; end if;
  for child_command in select jsonb_array_elements(command->'commands') loop
   if coalesce(child_command->>'kind','') not in ('save','lifecycle') then raise exception '一括保存の操作が不正です。'; end if;
   perform crm_mutate(child_command);
  end loop;
  return;
 end if;

 if command->>'kind'='read_notification' then
  update notifications set read_at=coalesce(read_at,now()) where id=(command->>'id')::uuid and recipient_user_id=actor;
  if not found then raise exception '通知が見つかりません。'; end if; return;
 end if;
 tbl=command->>'table';
 if tbl is null or tbl<>all(array['customers','engineers','customer_contacts','customer_engineer_relations','projects','deals','contracts','contract_periods','activities','tasks']) or command->>'kind' is null or command->>'kind' not in ('save','lifecycle') then raise exception '操作が不正です。'; end if;
 life=case when tbl in ('customers','engineers','customer_contacts','customer_engineer_relations') then 'archived_at' else 'deleted_at' end;
 entity_id=case when command->>'kind'='save' then (command->'row'->>'id')::uuid else (command->>'id')::uuid end;
 if entity_id is null then raise exception 'IDが不正です。'; end if;
 execute format('select to_jsonb(t) from %I t where id=$1 for update',tbl) into current_row using entity_id;
 old_version=coalesce((current_row->>'version')::integer,0);
 if (command->>'expected_version')::integer is distinct from old_version then raise exception '他の利用者が変更しました。再読み込みしてください。'; end if;
 if command->>'kind'='lifecycle' then
  if current_row is null or jsonb_typeof(command->'restore') is distinct from 'boolean' then raise exception '操作が不正です。'; end if;
  execute format('update %I set %I=$1, version=version+1,updated_at=now() where id=$2',tbl,life) using case when (command->>'restore')::boolean then null else now() end,entity_id;
  op=case when (command->>'restore')::boolean then 'restore' else 'delete' end;
 else
  if current_row->>life is not null then raise exception '復元してから編集してください。'; end if;
  incoming=command->'row';
  if jsonb_typeof(incoming)<>'object' then raise exception '入力が不正です。'; end if;
  if exists(select 1 from jsonb_object_keys(incoming) k where not exists(select 1 from pg_attribute a where a.attrelid=('public.'||tbl)::regclass and a.attnum>0 and not a.attisdropped and a.attname=k)) then raise exception '未定義の項目です。'; end if;
  for field in select attname as col from pg_attribute where attrelid=('public.'||tbl)::regclass and atttypid='numeric'::regtype and attnum>0 loop
   if incoming->>field.col is not null and (incoming->>field.col) !~ '^-?[0-9]{1,16}([.][0-9]{1,2})?$' then raise exception '数値は整数部16桁・小数部2桁以内で入力してください。'; end if;
  end loop;
  incoming=incoming || jsonb_build_object('id',entity_id,'version',old_version+1,'created_at',coalesce(current_row->'created_at',to_jsonb(now())),'updated_at',now(),life,null);
  if tbl='tasks' then incoming=incoming || jsonb_build_object('automation_key',current_row->'automation_key'); end if;
  -- Existing inactive references may remain, but new references must be usable.
  for field in select a.attname as col,c.confrelid::regclass as parent from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.conrelid=('public.'||tbl)::regclass and c.contype='f' loop
   if incoming->>field.col is not null and (incoming->>field.col) is distinct from (current_row->>field.col) then
    execute format('select to_jsonb(t) from %s t where id=$1',field.parent) into target using (incoming->>field.col)::uuid;
    if target is null or target->>'archived_at' is not null or target->>'deleted_at' is not null or target->>'disabled_at' is not null then raise exception '参照先は利用できません。'; end if;
   end if;
  end loop;
  select string_agg(quote_ident(a.attname),',' order by a.attnum),string_agg('r.'||quote_ident(a.attname),',' order by a.attnum),string_agg(format('%I=excluded.%I',a.attname,a.attname),',' order by a.attnum) into cols,vals,updates from pg_attribute a where a.attrelid=('public.'||tbl)::regclass and a.attnum>0 and not a.attisdropped;
  execute format('insert into %I(%s) select %s from jsonb_populate_record(null::%I,$1) r on conflict(id) do update set %s',tbl,cols,vals,tbl,updates) using incoming;
  if tbl='activities' then
   if command ? 'contact_ids' then
    for link in select jsonb_array_elements_text(command->'contact_ids')::uuid loop
     if not exists(select 1 from customer_contacts c where c.id=link and (c.archived_at is null or exists(select 1 from activity_contacts ac where ac.activity_id=entity_id and ac.contact_id=link))) then raise exception '参加者は利用できません。'; end if;
    end loop;
    delete from activity_contacts where activity_id=entity_id;
    insert into activity_contacts select entity_id,jsonb_array_elements_text(command->'contact_ids')::uuid;
   end if;
   if command ? 'engineer_ids' then
    for link in select jsonb_array_elements_text(command->'engineer_ids')::uuid loop
     if not exists(select 1 from engineers e where e.id=link and (e.archived_at is null or exists(select 1 from activity_engineers ae where ae.activity_id=entity_id and ae.engineer_id=link))) then raise exception '参加者は利用できません。'; end if;
    end loop;
    delete from activity_engineers where activity_id=entity_id;
    insert into activity_engineers select entity_id,jsonb_array_elements_text(command->'engineer_ids')::uuid;
   end if;
  end if;
  op=case when current_row is null then 'create' else 'update' end;
 end if;
 perform crm_validate();
 perform crm_revision(tbl,entity_id,op);
end $$;

