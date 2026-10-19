-- Fresh installation only. No compatibility with the former record schema.
create table public.app_users(id uuid primary key references auth.users(id), display_name text not null check(length(trim(display_name))>0), role text not null default 'member' check(role in ('admin','member')), disabled_at timestamptz);
create table public.activity_kinds(id uuid primary key default gen_random_uuid(), name text not null unique, display_order integer not null, archived_at timestamptz);
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
  trade_status text not null default 'prospect' check(trade_status in ('prospect','active','inactive')),
  sales_user_id uuid references public.app_users(id),
  notes text check(notes is null or length(trim(notes)) between 1 and 20000)
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
  customer_id uuid references public.customers(id) not null,
  name text not null check(name is null or length(trim(name)) between 1 and 20000),
  department text check(department is null or length(trim(department)) between 1 and 20000),
  position text check(position is null or length(trim(position)) between 1 and 20000),
  email text check(email is null or length(trim(email)) between 1 and 20000),
  phone text check(phone is null or length(trim(phone)) between 1 and 20000),
  is_primary boolean not null default false
);
create index on public.customer_contacts(customer_id);
create table public.customer_engineer_relations(
  id uuid primary key default gen_random_uuid(),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  customer_id uuid references public.customers(id) not null,
  engineer_id uuid references public.engineers(id) not null,
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
  customer_id uuid references public.customers(id) not null,
  name text not null check(name is null or length(trim(name)) between 1 and 20000),
  description text check(description is null or length(trim(description)) between 1 and 20000),
  required_skills text check(required_skills is null or length(trim(required_skills)) between 1 and 20000),
  headcount integer check(headcount>=1),
  budget numeric(18,2) check(budget>=0),
  planned_start_on date,
  recruitment_status text not null default 'open' check(recruitment_status in ('open','closed'))
);
create index on public.projects(customer_id);
create table public.deals(
  id uuid primary key default gen_random_uuid(),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  customer_id uuid references public.customers(id) not null,
  title text not null check(title is null or length(trim(title)) between 1 and 20000),
  project_id uuid references public.projects(id),
  relation_id uuid references public.customer_engineer_relations(id),
  sales_user_id uuid references public.app_users(id),
  stage text not null default 'proposing' check(stage in ('proposing','interview','negotiating','won','lost')),
  probability numeric(18,2) check(probability>=0 and probability<=100),
  expected_amount numeric(18,2) check(expected_amount>=0),
  expected_order_on date,
  planned_start_on date,
  planned_end_on date,
  check(planned_start_on<=planned_end_on)
);
create index on public.deals(customer_id);
create index on public.deals(project_id);
create index on public.deals(relation_id);
create index on public.deals(sales_user_id);
create table public.contracts(
  id uuid primary key default gen_random_uuid(),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null check(name is null or length(trim(name)) between 1 and 20000),
  relation_id uuid references public.customer_engineer_relations(id) not null,
  project_id uuid references public.projects(id),
  deal_id uuid references public.deals(id),
  sales_user_id uuid references public.app_users(id)
);
create index on public.contracts(relation_id);
create index on public.contracts(project_id);
create index on public.contracts(deal_id);
create index on public.contracts(sales_user_id);
create table public.contract_periods(
  id uuid primary key default gen_random_uuid(),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  contract_id uuid references public.contracts(id) not null,
  starts_on date not null,
  ends_on date not null,
  billing_rate numeric(18,2) not null check(billing_rate>=0),
  cost numeric(18,2) not null check(cost>=0),
  renewal_status text not null default 'pending' check(renewal_status in ('pending','renew','end')),
  notes text check(notes is null or length(trim(notes)) between 1 and 20000),
  check(starts_on<=ends_on)
);
create index on public.contract_periods(contract_id);
create table public.activities(
  id uuid primary key default gen_random_uuid(),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  customer_id uuid references public.customers(id) not null,
  title text not null check(title is null or length(trim(title)) between 1 and 20000),
  activity_kind_id uuid references public.activity_kinds(id) not null,
  recorded_by uuid references public.app_users(id) not null,
  occurred_at timestamptz not null,
  body text check(body is null or length(trim(body)) between 1 and 20000),
  project_id uuid references public.projects(id),
  deal_id uuid references public.deals(id),
  contract_id uuid references public.contracts(id)
);
create index on public.activities(customer_id);
create index on public.activities(activity_kind_id);
create index on public.activities(recorded_by);
create index on public.activities(project_id);
create index on public.activities(deal_id);
create index on public.activities(contract_id);
create table public.tasks(
  id uuid primary key default gen_random_uuid(),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  customer_id uuid references public.customers(id) not null,
  title text not null check(title is null or length(trim(title)) between 1 and 20000),
  body text check(body is null or length(trim(body)) between 1 and 20000),
  assignee_user_id uuid references public.app_users(id),
  due_at timestamptz,
  status text not null default 'open' check(status in ('open','in_progress','completed','cancelled')),
  project_id uuid references public.projects(id),
  deal_id uuid references public.deals(id),
  contract_id uuid references public.contracts(id),
  contract_period_id uuid references public.contract_periods(id),
  activity_id uuid references public.activities(id),
  automation_key text unique
);
create index on public.tasks(customer_id);
create index on public.tasks(assignee_user_id);
create index on public.tasks(project_id);
create index on public.tasks(deal_id);
create index on public.tasks(contract_id);
create index on public.tasks(contract_period_id);
create index on public.tasks(activity_id);
create table public.activity_contacts(activity_id uuid references public.activities(id), contact_id uuid references public.customer_contacts(id), primary key(activity_id,contact_id));
create table public.activity_engineers(activity_id uuid references public.activities(id), engineer_id uuid references public.engineers(id), primary key(activity_id,engineer_id));
create table public.notifications(id uuid primary key default gen_random_uuid(), task_id uuid references public.tasks(id), contract_period_id uuid references public.contract_periods(id), recipient_user_id uuid not null references public.app_users(id), rule_key text not null, scheduled_at timestamptz not null, status text not null check(status in ('pending','delivered','cancelled')), idempotency_key text not null unique, delivered_at timestamptz, read_at timestamptz, check(num_nonnulls(task_id,contract_period_id)=1));
create index on public.notifications(recipient_user_id,scheduled_at);
create table public.customers_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.customers(id), version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.engineers_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.engineers(id), version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.customer_contacts_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.customer_contacts(id), version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.customer_engineer_relations_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.customer_engineer_relations(id), version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.projects_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.projects(id), version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.deals_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.deals(id), version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.contracts_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.contracts(id), version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.contract_periods_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.contract_periods(id), version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.activities_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.activities(id), version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));
create table public.tasks_revisions(id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.tasks(id), version integer not null, operation text not null, snapshot jsonb not null, changed_by uuid references public.app_users(id), changed_at timestamptz not null default now(), unique(entity_id,version));

create function public.crm_member() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from app_users where id=auth.uid() and disabled_at is null)
$$;
create function public.crm_customer_of(entity_table text, entity_id uuid) returns uuid language plpgsql stable set search_path=public,pg_temp as $$
declare result uuid;
begin
 if entity_table='customers' then return entity_id;
 elsif entity_table='contracts' then select r.customer_id into result from contracts c join customer_engineer_relations r on r.id=c.relation_id where c.id=entity_id;
 elsif entity_table='contract_periods' then select r.customer_id into result from contract_periods p join contracts c on c.id=p.contract_id join customer_engineer_relations r on r.id=c.relation_id where p.id=entity_id;
 elsif entity_table in ('customer_contacts','customer_engineer_relations','projects','deals','activities','tasks') then execute format('select customer_id from %I where id=$1',entity_table) into result using entity_id;
 end if;
 return result;
end $$;

-- All writers hold this transaction lock, including the service reminder job.
-- It also protects parent edits against concurrent reference creation.
create function public.crm_validate() returns void language plpgsql set search_path=public,pg_temp as $$
declare spec record; bad boolean;
begin
 for spec in select * from (values
 ('deals','project_id','projects'),('deals','relation_id','customer_engineer_relations'),
 ('contracts','project_id','projects'),('contracts','deal_id','deals'),
 ('activities','project_id','projects'),('activities','deal_id','deals'),('activities','contract_id','contracts'),
 ('tasks','project_id','projects'),('tasks','deal_id','deals'),('tasks','contract_id','contracts'),('tasks','contract_period_id','contract_periods'),('tasks','activity_id','activities')
 ) as refs(child,col,parent) loop
  execute format('select exists(select 1 from %I a where a.%I is not null and crm_customer_of(%L,a.id) is distinct from crm_customer_of(%L,a.%I))',spec.child,spec.col,spec.child,spec.parent,spec.col) into bad;
  if bad then raise exception '別の顧客のデータは関連付けできません。'; end if;
 end loop;
 if exists(select 1 from contracts c join deals d on d.id=c.deal_id where d.stage<>'won' or (d.relation_id is not null and d.relation_id<>c.relation_id) or (d.project_id is not null and c.project_id is not null and d.project_id<>c.project_id)) then raise exception '受注商談と契約の参画関係・案件が一致しません。'; end if;
 if exists(select 1 from contract_periods a join contract_periods b on a.contract_id=b.contract_id and a.id<b.id and a.deleted_at is null and b.deleted_at is null and a.starts_on<=b.ends_on and b.starts_on<=a.ends_on) then raise exception '同じ契約の期間が重複しています。'; end if;
 if exists(select 1 from tasks t join contract_periods p on p.id=t.contract_period_id where t.contract_id is not null and t.contract_id<>p.contract_id) then raise exception '契約と契約期間が一致しません。'; end if;
 if exists(select 1 from tasks t join activities a on a.id=t.activity_id where (t.project_id is not null and a.project_id is not null and t.project_id<>a.project_id) or (t.deal_id is not null and a.deal_id is not null and t.deal_id<>a.deal_id) or (t.contract_id is not null and a.contract_id is not null and t.contract_id<>a.contract_id)) then raise exception 'タスクと関連活動の関連先が一致しません。'; end if;
 for spec in select * from (values ('activities'),('tasks')) as tables(child) loop
  execute format('select exists(select 1 from %I a join deals d on d.id=a.deal_id where a.project_id is not null and d.project_id is not null and a.project_id<>d.project_id)',spec.child) into bad;
  if bad then raise exception '関連案件と商談が一致しません。'; end if;
  execute format('select exists(select 1 from %I a join contracts c on c.id=a.contract_id where (a.project_id is not null and c.project_id is not null and a.project_id<>c.project_id) or (a.deal_id is not null and c.deal_id is not null and a.deal_id<>c.deal_id))',spec.child) into bad;
  if bad then raise exception '関連案件・商談と契約が一致しません。'; end if;
 end loop;
 if exists(select 1 from tasks t join contract_periods p on p.id=t.contract_period_id join contracts c on c.id=p.contract_id where (t.project_id is not null and c.project_id is not null and t.project_id<>c.project_id) or (t.deal_id is not null and c.deal_id is not null and t.deal_id<>c.deal_id)) then raise exception '関連案件・商談と契約期間が一致しません。'; end if;
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
  snap=snap||jsonb_build_object('participant_labels',coalesce((select jsonb_object_agg(id,name) from (select c.id,c.name from activity_contacts ac join customer_contacts c on c.id=ac.contact_id where ac.activity_id=entity_id union all select e.id,e.name from activity_engineers ae join engineers e on e.id=ae.engineer_id where ae.activity_id=entity_id) participants),'{}'::jsonb));
  snap=snap || jsonb_build_object('contact_ids',coalesce((select jsonb_agg(contact_id order by contact_id) from activity_contacts where activity_id=entity_id),'[]'::jsonb),'engineer_ids',coalesce((select jsonb_agg(engineer_id order by engineer_id) from activity_engineers where activity_id=entity_id),'[]'::jsonb));
 end if;
 execute format('insert into %I(entity_id,version,operation,snapshot,changed_by) values($1,$2,$3,$4,$5)',entity_table||'_revisions') using entity_id,(row_data->>'version')::integer,operation,snap,auth.uid();
end $$;

create function public.crm_mutate(command jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare tbl text; entity_id uuid; current_row jsonb; incoming jsonb; old_version integer; life text; cols text; vals text; updates text; op text; field record; target jsonb; link uuid; actor uuid=auth.uid();
begin
 if not crm_member() then raise exception 'CRMへの利用登録がありません。'; end if;
 perform pg_advisory_xact_lock(104219);
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

create function public.crm_run_reminders(run_at timestamptz default now()) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare day date=(run_at at time zone 'Asia/Tokyo')::date; p record; t tasks%rowtype; task_id uuid; desired jsonb='[]'; n jsonb; wanted text[]='{}'; due date; active boolean; skipped jsonb='[]'; count_sent integer=0;
begin
 perform pg_advisory_xact_lock(104219);
 for p in select cp.*, c.name as contract_name,c.sales_user_id,c.deleted_at as contract_deleted,r.customer_id,r.archived_at as relation_archived,e.archived_at as engineer_archived,cu.archived_at as customer_archived,u.disabled_at as user_disabled,u.id as enabled_user from contract_periods cp join contracts c on c.id=cp.contract_id join customer_engineer_relations r on r.id=c.relation_id join engineers e on e.id=r.engineer_id join customers cu on cu.id=r.customer_id left join app_users u on u.id=c.sales_user_id loop
  active=p.deleted_at is null and p.contract_deleted is null and p.relation_archived is null and p.engineer_archived is null and p.customer_archived is null and p.enabled_user is not null and p.user_disabled is null and p.renewal_status='pending' and p.ends_on>=day;
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
   insert into tasks(customer_id,contract_id,contract_period_id,assignee_user_id,title,due_at,status,automation_key) values(p.customer_id,p.contract_id,p.id,p.sales_user_id,p.contract_name||'の更新確認',(p.ends_on+time '17:00') at time zone 'Asia/Tokyo','open','renewal:'||p.id) returning id into task_id;
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
grant execute on function public.crm_run_reminders(timestamptz) to service_role;
do $$ declare t text; begin
 foreach t in array array['customers','engineers','customer_contacts','customer_engineer_relations','projects','deals','contracts','contract_periods','activities','tasks','activity_kinds','activity_contacts','activity_engineers','app_users'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy member_read on public.%I for select to authenticated using(public.crm_member())',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
 foreach t in array array['customers','engineers','customer_contacts','customer_engineer_relations','projects','deals','contracts','contract_periods','activities','tasks'] loop
  execute format('alter table public.%I enable row level security',t||'_revisions');
  execute format('create policy member_read on public.%I for select to authenticated using(public.crm_member())',t||'_revisions');
  execute format('grant select on public.%I to authenticated',t||'_revisions');
 end loop;
end $$;
alter table public.notifications enable row level security;
create policy own_read on public.notifications for select to authenticated using(public.crm_member() and recipient_user_id=auth.uid());
grant select on public.notifications to authenticated;
grant select on all tables in schema public to service_role;
