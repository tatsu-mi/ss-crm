-- Development schema: maintain this single initial migration for a fresh database.
create table public.app_users(id uuid primary key references auth.users(id), display_name text not null check(length(trim(display_name))>0), role text not null default 'member' check(role in ('admin','member')), disabled_at timestamptz);
create table public.activity_kinds(id uuid primary key default gen_random_uuid(), name text not null unique check(name in ('商談','面談','その他')), display_order integer not null, archived_at timestamptz);
create table public.activity_templates(
  id uuid primary key default gen_random_uuid(),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check(length(trim(name)) between 1 and 20000),
  body text not null check(length(trim(body)) between 1 and 20000)
);
create table public.activity_templates_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.activity_templates(id) on delete cascade, version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.customers(
  id uuid primary key default gen_random_uuid(),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  name text not null check(name is null or length(trim(name)) between 1 and 20000),
  website text check(website is null or length(trim(website)) between 1 and 20000),
  phone text check(phone is null or length(trim(phone)) between 1 and 20000),
  address text check(address is null or length(trim(address)) between 1 and 20000),
  industry text check(industry is null or length(trim(industry)) between 1 and 20000),
  trade_status text not null default 'prospect' check(trade_status in ('prospect','proposing','active','inactive')),
  sales_user_id uuid references public.app_users(id),
  notes text check(notes is null or length(trim(notes)) between 1 and 20000),
  name_kana text check(name_kana is null or length(trim(name_kana)) between 1 and 20000),
  employee_size text check(employee_size is null or length(trim(employee_size)) between 1 and 20000),
  established_on date,
  revenue_scale text check(revenue_scale is null or length(trim(revenue_scale)) between 1 and 20000)
);
create index on public.customers(sales_user_id);
create table public.engineers(
  id uuid primary key default gen_random_uuid(),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  name text not null check(name is null or length(trim(name)) between 1 and 20000),
  preferences text check(preferences is null or length(trim(preferences)) between 1 and 20000)
);
create table public.customer_contacts(
  id uuid primary key default gen_random_uuid(),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  customer_id uuid references public.customers(id) on delete cascade not null,
  name text not null check(name is null or length(trim(name)) between 1 and 20000),
  department text check(department is null or length(trim(department)) between 1 and 20000),
  position text check(position is null or length(trim(position)) between 1 and 20000),
  email text check(email is null or length(trim(email)) between 1 and 20000),
  phone text check(phone is null or length(trim(phone)) between 1 and 20000),
  is_primary boolean not null default false
);
create index on public.customer_contacts(customer_id);
create table public.sansan_companies(company_id text primary key, customer_id uuid not null references public.customers(id) on delete cascade);
create table public.sansan_people(person_id text primary key, contact_id uuid not null references public.customer_contacts(id) on delete cascade);
create table public.sansan_cards(card_id text primary key, person_id text references public.sansan_people(person_id) on delete cascade, contact_id uuid not null references public.customer_contacts(id) on delete cascade);
create table public.customer_engineer_relations(
  id uuid primary key default gen_random_uuid(),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  customer_id uuid references public.customers(id) on delete cascade not null,
  engineer_id uuid references public.engineers(id) on delete cascade not null,
  label text not null check(label is null or length(trim(label)) between 1 and 20000)
);
create index on public.customer_engineer_relations(customer_id);
create index on public.customer_engineer_relations(engineer_id);
create table public.projects(
  id uuid primary key default gen_random_uuid(),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  customer_id uuid references public.customers(id) on delete cascade not null,
  name text not null check(name is null or length(trim(name)) between 1 and 20000),
  description text check(description is null or length(trim(description)) between 1 and 20000),
  budget numeric(18,2) check(budget>=0),
  planned_start_on date,
  sales_user_id uuid references public.app_users(id)
);
create index on public.projects(customer_id);
create table public.project_engineers(
  id uuid primary key default gen_random_uuid(),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  project_id uuid not null references public.projects(id) on delete cascade,
  engineer_id uuid not null references public.engineers(id) on delete cascade
);
create index on public.projects(sales_user_id);
create index on public.project_engineers(engineer_id);
create unique index project_engineers_one_per_project on public.project_engineers(project_id) where deleted_at is null;
create table public.contract_periods(
  id uuid primary key default gen_random_uuid(),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  project_engineer_id uuid references public.project_engineers(id) on delete cascade not null,
  starts_on date not null,
  ends_on date not null,
  billing_rate numeric(18,2) not null check(billing_rate>=0),
  cost numeric(18,2) not null check(cost>=0),
  renewal_status text not null default 'pending' check(renewal_status in ('pending','renew','end')),
  notes text check(notes is null or length(trim(notes)) between 1 and 20000),
  check(starts_on<=ends_on)
);
create index on public.contract_periods(project_engineer_id);
create table public.activities(
  id uuid primary key default gen_random_uuid(),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  customer_id uuid references public.customers(id) on delete cascade not null,
  title text not null check(title is null or length(trim(title)) between 1 and 20000),
  activity_kind_id uuid references public.activity_kinds(id) not null,
  recorded_by uuid references public.app_users(id) not null,
  occurred_at timestamptz not null,
  body text check(body is null or length(trim(body)) between 1 and 20000),
  project_id uuid references public.projects(id) on delete cascade
);
create index on public.activities(customer_id);
create index on public.activities(activity_kind_id);
create index on public.activities(recorded_by);
create index on public.activities(project_id);
create table public.activity_relations(
  activity_id uuid references public.activities(id) on delete cascade,
  related_activity_id uuid references public.activities(id) on delete cascade,
  primary key(activity_id,related_activity_id),
  check(activity_id<>related_activity_id)
);
create index on public.activity_relations(related_activity_id);
create table public.tasks(
  id uuid primary key default gen_random_uuid(),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  customer_id uuid references public.customers(id) on delete cascade not null,
  title text not null check(title is null or length(trim(title)) between 1 and 20000),
  body text check(body is null or length(trim(body)) between 1 and 20000),
  assignee_user_id uuid references public.app_users(id),
  due_at timestamptz,
  status text not null default 'open' check(status in ('open','in_progress','completed','cancelled')),
  project_id uuid references public.projects(id) on delete cascade,
  contract_period_id uuid references public.contract_periods(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete cascade,
  automation_key text unique
);
create index on public.tasks(customer_id);
create index on public.tasks(assignee_user_id);
create index on public.tasks(project_id);
create index on public.tasks(contract_period_id);
create index on public.tasks(activity_id);
create table public.activity_contacts(activity_id uuid references public.activities(id) on delete cascade, contact_id uuid references public.customer_contacts(id) on delete cascade, primary key(activity_id,contact_id));
create table public.activity_engineers(activity_id uuid references public.activities(id) on delete cascade, engineer_id uuid references public.engineers(id) on delete cascade, primary key(activity_id,engineer_id));
create table public.notifications(id uuid primary key default gen_random_uuid(), task_id uuid references public.tasks(id) on delete cascade, contract_period_id uuid references public.contract_periods(id) on delete cascade, recipient_user_id uuid not null references public.app_users(id), rule_key text not null, scheduled_at timestamptz not null, status text not null check(status in ('pending','delivered','cancelled')), idempotency_key text not null unique, delivered_at timestamptz, read_at timestamptz, check(num_nonnulls(task_id,contract_period_id)=1));
create index on public.notifications(recipient_user_id,scheduled_at);
create table public.customers_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.customers(id) on delete cascade, version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.engineers_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.engineers(id) on delete cascade, version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.customer_contacts_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.customer_contacts(id) on delete cascade, version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.customer_engineer_relations_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.customer_engineer_relations(id) on delete cascade, version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.projects_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.projects(id) on delete cascade, version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.project_engineers_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.project_engineers(id) on delete cascade, version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.contract_periods_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.contract_periods(id) on delete cascade, version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.activities_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.activities(id) on delete cascade, version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.tasks_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.tasks(id) on delete cascade, version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));



create function public.crm_member() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from app_users where id=auth.uid() and disabled_at is null)
$$;


create function public.crm_customer_of(entity_table text, entity_id uuid) returns uuid language plpgsql stable set search_path=public,pg_temp as $$
declare result uuid;
begin
 if entity_table='customers' then return entity_id;
 elsif entity_table='project_engineers' then select p.customer_id into result from project_engineers e join projects p on p.id=e.project_id where e.id=entity_id;
 elsif entity_table='contract_periods' then select p.customer_id into result from contract_periods cp join project_engineers e on e.id=cp.project_engineer_id join projects p on p.id=e.project_id where cp.id=entity_id;
 elsif entity_table in ('customer_contacts','customer_engineer_relations','projects','activities','tasks') then execute format('select customer_id from %I where id=$1',entity_table) into result using entity_id;
 end if;
 return result;
end $$;

create function public.crm_validate() returns void language plpgsql set search_path=public,pg_temp as $$
declare spec record; bad boolean;
begin
 for spec in select * from (values
 ('activities','project_id','projects'),
 ('tasks','project_id','projects'),('tasks','contract_period_id','contract_periods'),('tasks','activity_id','activities')
 ) as refs(child,col,parent) loop
  execute format('select exists(select 1 from %I a where a.%I is not null and crm_customer_of(%L,a.id) is distinct from crm_customer_of(%L,a.%I))',spec.child,spec.col,spec.child,spec.parent,spec.col) into bad;
  if bad then raise exception '別の顧客のデータは関連付けできません。'; end if;
 end loop;
 if exists(select 1 from contract_periods a join contract_periods b on a.project_engineer_id=b.project_engineer_id and a.id<b.id and a.deleted_at is null and b.deleted_at is null and a.starts_on<=b.ends_on and b.starts_on<=a.ends_on) then raise exception '同じ参画エンジニアの期間が重複しています。'; end if;
 if exists(select 1 from tasks t join contract_periods cp on cp.id=t.contract_period_id join project_engineers e on e.id=cp.project_engineer_id where t.project_id is not null and t.project_id<>e.project_id) then raise exception '契約と契約期間が一致しません。'; end if;
 if exists(select 1 from tasks t join contract_periods cp on cp.id=t.contract_period_id join project_engineers pe on pe.id=cp.project_engineer_id join activities a on a.id=t.activity_id where a.project_id is not null and a.project_id<>pe.project_id) then raise exception 'タスクの契約・契約期間・活動が一致しません。'; end if;
 if exists(select 1 from tasks t join activities a on a.id=t.activity_id where (t.project_id is not null and a.project_id is not null and t.project_id<>a.project_id)) then raise exception 'タスクと関連活動の関連先が一致しません。'; end if;
 if exists(select 1 from activity_relations r join activities a on a.id=r.activity_id join activities b on b.id=r.related_activity_id where a.customer_id<>b.customer_id) then raise exception '関連活動は同じ顧客の別の活動を選択してください。'; end if;
 if exists(select 1 from activity_contacts ac join activities a on a.id=ac.activity_id join customer_contacts c on c.id=ac.contact_id where a.customer_id<>c.customer_id) then raise exception '参加者の顧客が異なります。'; end if;
end $$;

create function public.crm_revision(entity_table text, entity_id uuid, operation text) returns void language plpgsql set search_path=public,pg_temp as $$
declare row_data jsonb; snap jsonb; labels jsonb='{}'; field record; target jsonb;
begin
 execute format('select to_jsonb(t) from %I t where id=$1',entity_table) into row_data using entity_id;
 for field in select a.attname as col,c.confrelid::regclass as parent from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.conrelid=('public.'||entity_table)::regclass and c.contype='f' loop
  if row_data->>field.col is not null then
   execute format('select to_jsonb(t) from %s t where id=$1',field.parent) into target using (row_data->>field.col)::uuid;
   labels=labels||jsonb_build_object(field.col,coalesce(target->>'display_name',target->>'name',target->>'title',target->>'label',case when target ? 'starts_on' then (target->>'starts_on')||' 〜 '||(target->>'ends_on') end,row_data->>field.col));
  end if;
 end loop;
 -- Serialize exact decimal columns as strings in the JSON history too.
 for field in select attname as col from pg_attribute where attrelid=('public.'||entity_table)::regclass and atttypid='numeric'::regtype and attnum>0 loop
  if row_data->>field.col is not null then row_data=jsonb_set(row_data,array[field.col],to_jsonb(row_data->>field.col)); end if;
 end loop;
 snap=jsonb_build_object('row',row_data,'reference_labels',labels);
 if entity_table='activities' then
  snap=snap||jsonb_build_object(
   'related_activity_ids',coalesce((select jsonb_agg(related_activity_id order by related_activity_id) from activity_relations where activity_id=entity_id),'[]'::jsonb),
   'related_activity_labels',coalesce((select jsonb_object_agg(a.id,a.title) from activity_relations r join activities a on a.id=r.related_activity_id where r.activity_id=entity_id),'{}'::jsonb));
  snap=snap||jsonb_build_object('participant_labels',coalesce((select jsonb_object_agg(id,name) from (select c.id,c.name from activity_contacts ac join customer_contacts c on c.id=ac.contact_id where ac.activity_id=entity_id union all select e.id,e.name from activity_engineers ae join engineers e on e.id=ae.engineer_id where ae.activity_id=entity_id) participants),'{}'::jsonb));
  snap=snap || jsonb_build_object('contact_ids',coalesce((select jsonb_agg(contact_id order by contact_id) from activity_contacts where activity_id=entity_id),'[]'::jsonb),'engineer_ids',coalesce((select jsonb_agg(engineer_id order by engineer_id) from activity_engineers where activity_id=entity_id),'[]'::jsonb));
 end if;
 if entity_table='projects' then
  snap=snap||jsonb_build_object('engineer_ids',coalesce((select jsonb_agg(engineer_id order by engineer_id) from project_engineers where project_id=entity_id and deleted_at is null),'[]'::jsonb),
   'participant_labels',coalesce((select jsonb_object_agg(e.id,e.name) from project_engineers pe join engineers e on e.id=pe.engineer_id where pe.project_id=entity_id and pe.deleted_at is null),'{}'::jsonb));
 end if;
 execute format('insert into %I(entity_id,version,operation,snapshot,changed_by) values($1,$2,$3,$4,$5)',entity_table||'_revisions') using entity_id,(row_data->>'version')::integer,operation,snap,auth.uid();
end $$;

create function public.crm_mutate(command jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare tbl text; entity_id uuid; current_row jsonb; incoming jsonb; old_version integer; life text; cols text; vals text; updates text; op text; field record; target jsonb; link uuid; actor uuid=auth.uid(); child_command jsonb; membership record; requested uuid[]; membership_id uuid; purge_ids uuid[]; rev_table text;
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
 if tbl is null or tbl<>all(array['activity_templates','customers','engineers','customer_contacts','customer_engineer_relations','projects','project_engineers','contract_periods','activities','tasks']) or command->>'kind' is null or command->>'kind' not in ('save','lifecycle','purge') then raise exception '操作が不正です。'; end if;
 life=case when tbl='activity_templates' then null when tbl in ('customers','engineers','customer_contacts','customer_engineer_relations') then 'archived_at' else 'deleted_at' end;
 entity_id=case when command->>'kind'='save' then (command->'row'->>'id')::uuid else (command->>'id')::uuid end;
 if entity_id is null then raise exception 'IDが不正です。'; end if;
 execute format('select to_jsonb(t) from %I t where id=$1 for update',tbl) into current_row using entity_id;
 old_version=coalesce((current_row->>'version')::integer,0);
 if (command->>'expected_version')::integer is distinct from old_version then raise exception '他の利用者が変更しました。再読み込みしてください。'; end if;
 if command->>'kind'='purge' then
  if current_row is null or (tbl<>'activity_templates' and current_row->>life is null) then raise exception '削除済みのデータのみ完全に削除できます。'; end if;
  -- Collect all dependent business rows before the cascading delete, including
  -- active rows. Historical snapshots elsewhere may contain their identifiers.
  with recursive doomed(t,id) as (
   select tbl,entity_id
   union
   select child.t,child.id from doomed d cross join lateral (
    select 'customer_contacts'::text t,id from customer_contacts where d.t='customers' and customer_id=d.id
    union all select 'customer_engineer_relations',id from customer_engineer_relations where (d.t='customers' and customer_id=d.id) or (d.t='engineers' and engineer_id=d.id)
    union all select 'projects',id from projects where d.t='customers' and customer_id=d.id
    union all select 'project_engineers',id from project_engineers where (d.t='projects' and project_id=d.id) or (d.t='engineers' and engineer_id=d.id)
    union all select 'contract_periods',id from contract_periods where d.t='project_engineers' and project_engineer_id=d.id
    union all select 'activities',id from activities where (d.t='customers' and customer_id=d.id) or (d.t='projects' and project_id=d.id)
    union all select 'tasks',id from tasks where (d.t='customers' and customer_id=d.id) or (d.t='projects' and project_id=d.id) or (d.t='contract_periods' and contract_period_id=d.id) or (d.t='activities' and activity_id=d.id)
   ) child
  ) select array_agg(id) into purge_ids from doomed;
  foreach rev_table in array array['activity_templates','customers','engineers','customer_contacts','customer_engineer_relations','projects','project_engineers','contract_periods','activities','tasks'] loop
   execute format('delete from %I where entity_id=any($1) or exists(select 1 from unnest($1) x where position(x::text in snapshot::text)>0)',rev_table||'_revisions') using purge_ids;
  end loop;
  execute format('delete from %I where id=$1',tbl) using entity_id;
  return;
 end if;
 if command->>'kind'='lifecycle' then
  if life is null then raise exception '操作が不正です。'; end if;
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
  if tbl='project_engineers' and current_row is not null and
   ((incoming->>'project_id') is distinct from (current_row->>'project_id') or (incoming->>'engineer_id') is distinct from (current_row->>'engineer_id')) then
   raise exception '参画先・エンジニアは変更できません。紐づけを解除して追加してください。';
  end if;
  incoming=incoming || jsonb_build_object('id',entity_id,'version',old_version+1,'created_at',coalesce(current_row->'created_at',to_jsonb(now())),'updated_at',now());
  if life is not null then incoming=incoming || jsonb_build_object(life,null); end if;
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
  if tbl='projects' and command ? 'engineer_ids' then
   if jsonb_typeof(command->'engineer_ids') is distinct from 'array' then raise exception 'エンジニアが不正です。'; end if;
   select coalesce(array_agg(value::uuid),'{}'::uuid[]) into requested from jsonb_array_elements_text(command->'engineer_ids');
   if cardinality(requested)<>(select count(distinct x) from unnest(requested) x) then raise exception '契約のエンジニアが重複しています。'; end if;
   if cardinality(requested)>1 then raise exception '1契約に紐づけられるエンジニアは1人です。'; end if;
   for membership in select * from project_engineers where project_id=entity_id and deleted_at is null and not(engineer_id=any(requested)) loop
    perform crm_mutate(jsonb_build_object('kind','lifecycle','table','project_engineers','id',membership.id,'expected_version',membership.version,'restore',false));
   end loop;
   foreach link in array requested loop
    if not exists(select 1 from engineers e where e.id=link and (e.archived_at is null or exists(select 1 from project_engineers pe where pe.project_id=entity_id and pe.engineer_id=link and pe.deleted_at is null))) then raise exception '利用可能なエンジニアを選択してください。'; end if;
    if exists(select 1 from project_engineers where project_id=entity_id and engineer_id=link and deleted_at is null) then continue; end if;
    select * into membership from project_engineers where project_id=entity_id and engineer_id=link order by created_at,id limit 1;
    if found then
     perform crm_mutate(jsonb_build_object('kind','lifecycle','table','project_engineers','id',membership.id,'expected_version',membership.version,'restore',true));
    else
     membership_id=gen_random_uuid();
     perform crm_mutate(jsonb_build_object('kind','save','table','project_engineers','row',jsonb_build_object('id',membership_id,'project_id',entity_id,'engineer_id',link),'expected_version',0));
    end if;
   end loop;

  end if;
  if tbl='activities' then
   if command ? 'related_activity_ids' then
    if jsonb_typeof(command->'related_activity_ids') is distinct from 'array' then raise exception '関連活動が不正です。'; end if;
    for link in select jsonb_array_elements_text(command->'related_activity_ids')::uuid loop
     if not exists(select 1 from activities a where a.id=link and (a.deleted_at is null or exists(select 1 from activity_relations r where r.activity_id=entity_id and r.related_activity_id=link))) then raise exception '利用可能な関連活動を選択してください。'; end if;
    end loop;
    delete from activity_relations where activity_id=entity_id;
    insert into activity_relations select entity_id,jsonb_array_elements_text(command->'related_activity_ids')::uuid;
   end if;
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

create function public.crm_import_sansan(payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare company text; customer uuid; contact uuid; item jsonb; person text; card text; row_data jsonb;
begin
 if not crm_member() then raise exception 'CRMへの利用登録がありません。'; end if;
 perform pg_advisory_xact_lock(104219);
 company=nullif(trim(payload->>'company_id'),'');
 if company is null or length(company)>500 or jsonb_typeof(payload->'contacts') is distinct from 'array' then raise exception '取込データが不正です。'; end if;
 if exists(select 1 from sansan_companies where company_id=company) then raise exception 'この会社は取り込み済みです。'; end if;
 customer=nullif(payload->>'customer_id','')::uuid;
 if customer is null then
  customer=gen_random_uuid();
  row_data=jsonb_build_object('id',customer,'name',nullif(trim(payload->>'name'),''),'website',nullif(trim(payload->>'website'),''),'phone',nullif(trim(payload->>'phone'),''),'address',nullif(trim(payload->>'address'),''),'trade_status','prospect');
  perform crm_mutate(jsonb_build_object('kind','save','table','customers','row',row_data,'expected_version',0));
 elsif not exists(select 1 from customers where id=customer and archived_at is null) then raise exception '取引先が利用できません。'; end if;
 insert into sansan_companies values(company,customer);
 for item in select * from jsonb_array_elements(payload->'contacts') loop
  person=nullif(trim(item->>'person_id'),''); card=nullif(trim(item->>'card_id'),'');
  if person is null or card is null or length(person)>500 or length(card)>500 then raise exception '担当者の識別子が不正です。'; end if;
  if exists(select 1 from sansan_people where person_id=person) or exists(select 1 from sansan_cards where card_id=card) then raise exception '担当者は別の会社に連携済みです。確認してください。'; end if;
  contact=nullif(item->>'contact_id','')::uuid;
  if contact is null then
   contact=gen_random_uuid();
   row_data=jsonb_build_object('id',contact,'customer_id',customer,'name',nullif(trim(item->>'name'),''),'department',nullif(trim(item->>'department'),''),'position',nullif(trim(item->>'position'),''),'email',nullif(trim(item->>'email'),''),'phone',nullif(trim(item->>'phone'),''),'is_primary',false);
   perform crm_mutate(jsonb_build_object('kind','save','table','customer_contacts','row',row_data,'expected_version',0));
  elsif not exists(select 1 from customer_contacts where id=contact and customer_id=customer and archived_at is null) then raise exception '担当者が利用できません。'; end if;
  insert into sansan_people values(person,contact);
  insert into sansan_cards values(card,person,contact);
 end loop;
 return customer;
end $$;

create function public.crm_run_reminders(run_at timestamptz default now()) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare day date=(run_at at time zone 'Asia/Tokyo')::date; p record; t tasks%rowtype; task_id uuid; desired jsonb='[]'; n jsonb; wanted text[]='{}'; due date; active boolean; skipped jsonb='[]'; count_sent integer=0;
begin
 perform pg_advisory_xact_lock(104219);
 for p in select cp.*,pr.id as project_id,pr.name as project_name,pr.sales_user_id,pr.deleted_at as project_deleted,pe.deleted_at as assignment_deleted,e.archived_at as engineer_archived,cu.id as customer_id,cu.archived_at as customer_archived,u.disabled_at as user_disabled,u.id as enabled_user from contract_periods cp join project_engineers pe on pe.id=cp.project_engineer_id join projects pr on pr.id=pe.project_id join engineers e on e.id=pe.engineer_id join customers cu on cu.id=pr.customer_id left join app_users u on u.id=pr.sales_user_id loop
  active=p.deleted_at is null and p.project_deleted is null and p.assignment_deleted is null and p.engineer_archived is null and p.customer_archived is null and p.enabled_user is not null and p.user_disabled is null and p.renewal_status='pending' and p.ends_on>=day;
  select * into t from tasks where automation_key='renewal:'||p.id;
  if not active then
   if t.id is not null and t.deleted_at is null and t.status in ('open','in_progress') then
    update tasks set status='cancelled',version=version+1,updated_at=run_at where id=t.id;
    perform crm_revision('tasks',t.id,'update');
   end if;
   if p.sales_user_id is null and p.deleted_at is null then skipped=skipped||jsonb_build_array(jsonb_build_object('contract_period_id',p.id,'reason','営業担当未設定')); end if;
   continue;
  end if;
  if p.ends_on-30>day and t.id is null then continue; end if;
  if t.id is null then
   insert into tasks(customer_id,project_id,contract_period_id,assignee_user_id,title,due_at,status,automation_key) values(p.customer_id,p.project_id,p.id,p.sales_user_id,p.project_name||'の更新確認',(p.ends_on+time '17:00') at time zone 'Asia/Tokyo','open','renewal:'||p.id) returning id into task_id;
   perform crm_revision('tasks',task_id,'create');
  elsif t.deleted_at is null and t.status in ('open','in_progress') and (t.assignee_user_id is distinct from p.sales_user_id or t.due_at is distinct from ((p.ends_on+time '17:00') at time zone 'Asia/Tokyo')) then
   update tasks set assignee_user_id=p.sales_user_id,due_at=(p.ends_on+time '17:00') at time zone 'Asia/Tokyo',version=version+1,updated_at=run_at where id=t.id;
   perform crm_revision('tasks',t.id,'update');
  end if;
  if p.ends_on-30<=day then desired=desired||jsonb_build_array(jsonb_build_object('task_id',null,'contract_period_id',p.id,'recipient_user_id',p.sales_user_id,'rule_key','contract_renewal','key',p.id||':contract_renewal:'||p.sales_user_id||':'||p.ends_on)); end if;
 end loop;
 for t in select ta.* from tasks ta join customers c on c.id=ta.customer_id join app_users u on u.id=ta.assignee_user_id where ta.deleted_at is null and ta.status in ('open','in_progress') and ta.due_at is not null and c.archived_at is null and u.disabled_at is null loop
  due=(t.due_at at time zone 'Asia/Tokyo')::date;
  if day between due-7 and due then desired=desired||jsonb_build_array(jsonb_build_object('task_id',t.id,'contract_period_id',null,'recipient_user_id',t.assignee_user_id,'rule_key',case when day=due then 'task_due' else 'task_before' end,'key',t.id||':'||case when day=due then 'task_due' else 'task_before' end||':'||t.assignee_user_id||':'||to_char(t.due_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'))); end if;
 end loop;
 for n in select jsonb_array_elements(desired) loop
  wanted=array_append(wanted,n->>'key');
  insert into notifications(task_id,contract_period_id,recipient_user_id,rule_key,scheduled_at,status,idempotency_key) values((n->>'task_id')::uuid,(n->>'contract_period_id')::uuid,(n->>'recipient_user_id')::uuid,n->>'rule_key',run_at,'pending',n->>'key') on conflict(idempotency_key) do update set status='pending' where notifications.delivered_at is null;
 end loop;
 update notifications set status='cancelled' where status='pending' and not(idempotency_key=any(wanted));
 -- Re-evaluating and delivering occur in the same locked transaction.
 update notifications set status='delivered',delivered_at=run_at where status='pending' and idempotency_key=any(wanted);
 get diagnostics count_sent=row_count;
 perform crm_validate();
 return jsonb_build_object('delivered',count_sent,'skipped',skipped);
end $$;

-- Shared workspace: registered active members may read business data and mutate
-- only through the validating transaction. Notifications are private to recipients.
revoke all on all tables in schema public from anon,authenticated;
revoke all on all functions in schema public from public,anon,authenticated;
grant usage on schema public to authenticated,service_role;
grant execute on function public.crm_member() to authenticated;
grant execute on function public.crm_mutate(jsonb) to authenticated;
grant execute on function public.crm_import_sansan(jsonb) to authenticated;
grant execute on function public.crm_run_reminders(timestamptz) to service_role;
do $$ declare t text; begin
 foreach t in array array['activity_templates','customers','engineers','customer_contacts','customer_engineer_relations','projects','project_engineers','contract_periods','activities','tasks','activity_kinds','activity_contacts','activity_engineers','activity_relations','app_users','sansan_companies','sansan_people','sansan_cards'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy member_read on public.%I for select to authenticated using(public.crm_member())',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
 foreach t in array array['activity_templates','customers','engineers','customer_contacts','customer_engineer_relations','projects','project_engineers','contract_periods','activities','tasks'] loop
  execute format('alter table public.%I enable row level security',t||'_revisions');
  execute format('create policy member_read on public.%I for select to authenticated using(public.crm_member())',t||'_revisions');
  execute format('grant select on public.%I to authenticated',t||'_revisions');
 end loop;
end $$;
alter table public.notifications enable row level security;
create policy own_read on public.notifications for select to authenticated using(public.crm_member() and recipient_user_id=auth.uid());
grant select on public.notifications to authenticated;
grant select on all tables in schema public to service_role;
