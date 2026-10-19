-- デモモード（src/lib/demo.ts）と同じ業務サンプルを投入します。
-- 初期マイグレーション → seed.sql の後、そのままSQL Editorで実行してください。
-- デモ用AuthアカウントとCRM利用者も作成します（既存アカウントは変更しません）。
-- ログイン: sato@example.com / tanaka@example.com、共通パスワード: DemoCrm123!
-- 日付は実行時の日本時間の日付を基準とします。
-- 同じIDの既存レコードは変更しません。全件が1トランザクションで投入されます。
-- 最後にDB全体の更新確認タスク・通知を再計算するため、サンプル確認用DBで使ってください。

begin;
set local search_path = public, extensions, pg_temp;
create extension if not exists pgcrypto with schema extensions;

do $sample$
declare
  first_user_email text := 'sato@example.com';
  second_user_email text := 'tanaka@example.com';
  demo_password text := 'DemoCrm123!';
  demo_user record;
  demo_user_id uuid;
  first_user_id uuid;
  second_user_id uuid;
  demo_day date := (now() at time zone 'Asia/Tokyo')::date;
  previous_actor text := current_setting('request.jwt.claim.sub', true);
begin
  if (select count(*) from public.activity_kinds where id in (
    '00000000-0000-4000-8000-000000000014',
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000015'
  )) <> 3 then
    raise exception '先にsupabase/seed.sqlを実行してください。';
  end if;
  for demo_user in
    select * from (values
      (first_user_email, '佐藤 花子', 'admin'),
      (second_user_email, '田中 健', 'member')
    ) as demo_users(email, display_name, role)
  loop
    select id into demo_user_id from auth.users where lower(email) = lower(demo_user.email);
    if demo_user_id is null then
      demo_user_id := gen_random_uuid();
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        demo_user_id, '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', demo_user.email,
        crypt(demo_password, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('display_name', demo_user.display_name), now(), now(),
        '', '', '', ''
      );
      insert into auth.identities (
        id, user_id, provider_id, provider, identity_data, created_at, updated_at
      ) values (
        gen_random_uuid(), demo_user_id, demo_user_id::text, 'email',
        jsonb_build_object('sub', demo_user_id::text, 'email', demo_user.email, 'email_verified', true),
        now(), now()
      );
    end if;
    insert into public.app_users(id, display_name, role)
    values (demo_user_id, demo_user.display_name, demo_user.role)
    on conflict (id) do nothing;
    if exists (select 1 from public.app_users where id = demo_user_id and disabled_at is not null) then
      raise exception 'デモ用利用者 % は停止中です。', demo_user.email;
    end if;
  end loop;
  select id into first_user_id from auth.users where lower(email) = lower(first_user_email);
  select id into second_user_id from auth.users where lower(email) = lower(second_user_email);
  perform set_config('request.jwt.claim.sub', first_user_id::text, true);

  -- customers
  if not exists (select 1 from public.customers where id = '00000000-0000-4000-8000-000000000100') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customers', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000100",
  "archived_at": null,
  "name": "株式会社BLUEPRINT",
  "name_kana": "ぶるーぷりんと",
  "website": "https://example.com",
  "phone": "03-1234-5678",
  "address": "〒105-0001 東京都港区芝公園1-2-3 BLUEPRINTビル",
  "industry": "SIer",
  "employee_size": "500〜1,000名",
  "established_on": "2010-04-01",
  "revenue_scale": "100億〜500億円",
  "trade_status": "active",
  "notes": "基幹システムの開発をご支援。"
}'::jsonb || jsonb_build_object('sales_user_id', first_user_id)
    ));
  end if;
  if not exists (select 1 from public.customers where id = '00000000-0000-4000-8000-000000000101') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customers', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000101",
  "archived_at": null,
  "name": "青空システム株式会社",
  "name_kana": null,
  "website": null,
  "phone": null,
  "address": "東京都千代田区",
  "industry": null,
  "employee_size": null,
  "established_on": null,
  "revenue_scale": null,
  "trade_status": "prospect",
  "notes": null
}'::jsonb || jsonb_build_object('sales_user_id', second_user_id)
    ));
  end if;
  if not exists (select 1 from public.customers where id = '00000000-0000-4000-8000-000000000102') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customers', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000102",
  "archived_at": null,
  "name": "株式会社グリーンワークス",
  "name_kana": null,
  "website": null,
  "phone": null,
  "address": null,
  "industry": null,
  "employee_size": null,
  "established_on": null,
  "revenue_scale": null,
  "trade_status": "active",
  "notes": null
}'::jsonb || jsonb_build_object('sales_user_id', first_user_id)
    ));
  end if;
  if not exists (select 1 from public.customers where id = '00000000-0000-4000-8000-000000000112') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customers', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000112",
  "archived_at": null,
  "name": "株式会社テクノフロント",
  "name_kana": null,
  "website": null,
  "phone": "03-2345-6789",
  "address": "東京都千代田区",
  "industry": "ソフトウェア",
  "employee_size": null,
  "established_on": null,
  "revenue_scale": null,
  "trade_status": "proposing",
  "notes": null
}'::jsonb || jsonb_build_object('sales_user_id', second_user_id)
    ));
  end if;
  if not exists (select 1 from public.customers where id = '00000000-0000-4000-8000-000000000113') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customers', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000113",
  "archived_at": null,
  "name": "グローバルシステムズ株式会社",
  "name_kana": null,
  "website": null,
  "phone": "03-2345-6789",
  "address": "神奈川県横浜市",
  "industry": "製造",
  "employee_size": null,
  "established_on": null,
  "revenue_scale": null,
  "trade_status": "proposing",
  "notes": null
}'::jsonb || jsonb_build_object('sales_user_id', second_user_id)
    ));
  end if;
  if not exists (select 1 from public.customers where id = '00000000-0000-4000-8000-000000000114') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customers', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000114",
  "archived_at": null,
  "name": "株式会社ネクストソリューション",
  "name_kana": null,
  "website": null,
  "phone": "03-2345-6789",
  "address": "大阪府大阪市",
  "industry": "情報通信",
  "employee_size": null,
  "established_on": null,
  "revenue_scale": null,
  "trade_status": "proposing",
  "notes": null
}'::jsonb || jsonb_build_object('sales_user_id', second_user_id)
    ));
  end if;
  if not exists (select 1 from public.customers where id = '00000000-0000-4000-8000-000000000115') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customers', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000115",
  "archived_at": null,
  "name": "アドバンスソフト株式会社",
  "name_kana": null,
  "website": null,
  "phone": "03-2345-6789",
  "address": "愛知県名古屋市",
  "industry": "SIer",
  "employee_size": null,
  "established_on": null,
  "revenue_scale": null,
  "trade_status": "proposing",
  "notes": null
}'::jsonb || jsonb_build_object('sales_user_id', second_user_id)
    ));
  end if;
  if not exists (select 1 from public.customers where id = '00000000-0000-4000-8000-000000000116') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customers', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000116",
  "archived_at": null,
  "name": "株式会社ハーモニー",
  "name_kana": null,
  "website": null,
  "phone": "03-2345-6789",
  "address": "福岡県福岡市",
  "industry": "サービス",
  "employee_size": null,
  "established_on": null,
  "revenue_scale": null,
  "trade_status": "proposing",
  "notes": null
}'::jsonb || jsonb_build_object('sales_user_id', second_user_id)
    ));
  end if;
  if not exists (select 1 from public.customers where id = '00000000-0000-4000-8000-000000000117') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customers', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000117",
  "archived_at": null,
  "name": "株式会社イノベーションIT",
  "name_kana": null,
  "website": null,
  "phone": "03-2345-6789",
  "address": "東京都新宿区",
  "industry": "情報通信",
  "employee_size": null,
  "established_on": null,
  "revenue_scale": null,
  "trade_status": "proposing",
  "notes": null
}'::jsonb || jsonb_build_object('sales_user_id', second_user_id)
    ));
  end if;
  if not exists (select 1 from public.customers where id = '00000000-0000-4000-8000-000000000118') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customers', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000118",
  "archived_at": null,
  "name": "クラウドテクノロジー株式会社",
  "name_kana": null,
  "website": null,
  "phone": "03-2345-6789",
  "address": "東京都中央区",
  "industry": "SIer",
  "employee_size": null,
  "established_on": null,
  "revenue_scale": null,
  "trade_status": "proposing",
  "notes": null
}'::jsonb || jsonb_build_object('sales_user_id', second_user_id)
    ));
  end if;
  if not exists (select 1 from public.customers where id = '00000000-0000-4000-8000-000000000119') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customers', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000119",
  "archived_at": null,
  "name": "株式会社データワークス",
  "name_kana": null,
  "website": null,
  "phone": "03-2345-6789",
  "address": "大阪府吹田市",
  "industry": "情報通信",
  "employee_size": null,
  "established_on": null,
  "revenue_scale": null,
  "trade_status": "proposing",
  "notes": null
}'::jsonb || jsonb_build_object('sales_user_id', second_user_id)
    ));
  end if;
  if not exists (select 1 from public.customers where id = '00000000-0000-4000-8000-000000000120') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customers', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000120",
  "archived_at": null,
  "name": "スマートソリューション株式会社",
  "name_kana": null,
  "website": null,
  "phone": "03-2345-6789",
  "address": "東京都新宿区",
  "industry": "ソフトウェア",
  "employee_size": null,
  "established_on": null,
  "revenue_scale": null,
  "trade_status": "proposing",
  "notes": null
}'::jsonb || jsonb_build_object('sales_user_id', second_user_id)
    ));
  end if;

  -- engineers
  if not exists (select 1 from public.engineers where id = '00000000-0000-4000-8000-000000000103') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'engineers', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000103",
  "archived_at": null,
  "name": "山田 太郎",
  "preferences": "週3日のリモート勤務を希望"
}'::jsonb
    ));
  end if;
  if not exists (select 1 from public.engineers where id = '00000000-0000-4000-8000-000000000104') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'engineers', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000104",
  "archived_at": null,
  "name": "高橋 美咲",
  "preferences": null
}'::jsonb
    ));
  end if;

  -- customer_contacts
  if not exists (select 1 from public.customer_contacts where id = '00000000-0000-4000-8000-000000000105') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customer_contacts', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000105",
  "archived_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "name": "鈴木 一郎",
  "department": "情報システム部",
  "position": "課長",
  "email": "suzuki@example.com",
  "phone": "03-1234-5679",
  "is_primary": true
}'::jsonb
    ));
  end if;
  if not exists (select 1 from public.customer_contacts where id = '00000000-0000-4000-8000-000000000121') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customer_contacts', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000121",
  "archived_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "name": "田中 一郎",
  "department": "IT事業部",
  "position": "部長",
  "email": "tanaka@example.com",
  "phone": "080-1234-5678",
  "is_primary": false
}'::jsonb
    ));
  end if;
  if not exists (select 1 from public.customer_contacts where id = '00000000-0000-4000-8000-000000000122') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customer_contacts', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000122",
  "archived_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "name": "佐藤 花子",
  "department": "開発部",
  "position": "課長",
  "email": "sato@example.com",
  "phone": "080-1234-5678",
  "is_primary": false
}'::jsonb
    ));
  end if;
  if not exists (select 1 from public.customer_contacts where id = '00000000-0000-4000-8000-000000000123') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customer_contacts', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000123",
  "archived_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "name": "高橋 美咲",
  "department": "人事部",
  "position": "担当",
  "email": "takahashi@example.com",
  "phone": "080-1234-5678",
  "is_primary": false
}'::jsonb
    ));
  end if;
  if not exists (select 1 from public.customer_contacts where id = '00000000-0000-4000-8000-000000000124') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customer_contacts', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000124",
  "archived_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "name": "伊藤 大輔",
  "department": "営業部",
  "position": "担当",
  "email": "ito@example.com",
  "phone": "080-1234-5678",
  "is_primary": false
}'::jsonb
    ));
  end if;

  -- customer_engineer_relations
  if not exists (select 1 from public.customer_engineer_relations where id = '00000000-0000-4000-8000-000000000106') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'customer_engineer_relations', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000106",
  "archived_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "engineer_id": "00000000-0000-4000-8000-000000000103",
  "label": "基幹システム刷新への提案・参画"
}'::jsonb
    ));
  end if;

  -- projects
  if not exists (select 1 from public.projects where id = '00000000-0000-4000-8000-000000000107') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'projects', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000107",
  "deleted_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "name": "基幹システム刷新",
  "description": "販売管理システムの刷新",
  "budget": "800000"
}'::jsonb || jsonb_build_object('planned_start_on', (demo_day - 30), 'sales_user_id', first_user_id)
    ));
  end if;

  -- project_engineers
  if not exists (select 1 from public.project_engineers where id = '00000000-0000-4000-8000-000000000108') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'project_engineers', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000108",
  "deleted_at": null,
  "project_id": "00000000-0000-4000-8000-000000000107",
  "engineer_id": "00000000-0000-4000-8000-000000000103"
}'::jsonb
    ));
  end if;

  -- contract_periods
  if not exists (select 1 from public.contract_periods where id = '00000000-0000-4000-8000-000000000109') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'contract_periods', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000109",
  "deleted_at": null,
  "project_engineer_id": "00000000-0000-4000-8000-000000000108",
  "billing_rate": "800000",
  "cost": "600000",
  "renewal_status": "pending",
  "notes": "初回契約"
}'::jsonb || jsonb_build_object('starts_on', (demo_day - 30), 'ends_on', (demo_day + 20))
    ));
  end if;

  -- activities
  if not exists (select 1 from public.activities where id = '00000000-0000-4000-8000-000000000110') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'activities', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000110",
  "deleted_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "title": "山田さんの参画面談",
  "activity_kind_id": "00000000-0000-4000-8000-000000000012",
  "body": "参画に向けて、顧客の担当者と山田さんのスキル・担当業務・参画条件を確認しました。",
  "project_id": "00000000-0000-4000-8000-000000000107"
}'::jsonb || jsonb_build_object('recorded_by', first_user_id, 'occurred_at', to_char((demo_day - 1), 'YYYY-MM-DD') || 'T14:00:00+09:00'),
      'contact_ids', '["00000000-0000-4000-8000-000000000105"]'::jsonb,
      'engineer_ids', '["00000000-0000-4000-8000-000000000103"]'::jsonb
    ));
  end if;
  if not exists (select 1 from public.activities where id = '00000000-0000-4000-8000-000000000125') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'activities', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000125",
  "deleted_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "title": "追加要員のご相談",
  "activity_kind_id": "00000000-0000-4000-8000-000000000014",
  "body": "来期に向けた追加要員について顧客と相談しました。",
  "project_id": "00000000-0000-4000-8000-000000000107"
}'::jsonb || jsonb_build_object('recorded_by', first_user_id, 'occurred_at', to_char((demo_day - 2), 'YYYY-MM-DD') || 'T14:00:00+09:00'),
      'contact_ids', '["00000000-0000-4000-8000-000000000105"]'::jsonb,
      'engineer_ids', '["00000000-0000-4000-8000-000000000103"]'::jsonb
    ));
  end if;
  if not exists (select 1 from public.activities where id = '00000000-0000-4000-8000-000000000126') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'activities', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000126",
  "deleted_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "title": "見積書の提出",
  "activity_kind_id": "00000000-0000-4000-8000-000000000014",
  "body": "開発体制の見積書を提出しました。",
  "project_id": "00000000-0000-4000-8000-000000000107"
}'::jsonb || jsonb_build_object('recorded_by', second_user_id, 'occurred_at', to_char((demo_day - 3), 'YYYY-MM-DD') || 'T14:00:00+09:00'),
      'contact_ids', '["00000000-0000-4000-8000-000000000105"]'::jsonb,
      'engineer_ids', '["00000000-0000-4000-8000-000000000103"]'::jsonb
    ));
  end if;
  if not exists (select 1 from public.activities where id = '00000000-0000-4000-8000-000000000127') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'activities', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000127",
  "deleted_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "title": "田中様との定例商談",
  "activity_kind_id": "00000000-0000-4000-8000-000000000014",
  "body": "顧客の田中様と今後の開発体制について相談しました。",
  "project_id": "00000000-0000-4000-8000-000000000107"
}'::jsonb || jsonb_build_object('recorded_by', first_user_id, 'occurred_at', to_char((demo_day - 4), 'YYYY-MM-DD') || 'T14:00:00+09:00'),
      'contact_ids', '["00000000-0000-4000-8000-000000000105"]'::jsonb,
      'engineer_ids', '["00000000-0000-4000-8000-000000000103"]'::jsonb
    ));
  end if;
  if not exists (select 1 from public.activities where id = '00000000-0000-4000-8000-000000000128') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'activities', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000128",
  "deleted_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "title": "山田さんの参画後フォロー",
  "activity_kind_id": "00000000-0000-4000-8000-000000000015",
  "body": "参画後の業務状況を確認し、顧客からのフィードバックを共有しました。",
  "project_id": "00000000-0000-4000-8000-000000000107"
}'::jsonb || jsonb_build_object('recorded_by', second_user_id, 'occurred_at', to_char((demo_day - 5), 'YYYY-MM-DD') || 'T14:00:00+09:00'),
      'contact_ids', '["00000000-0000-4000-8000-000000000105"]'::jsonb,
      'engineer_ids', '["00000000-0000-4000-8000-000000000103"]'::jsonb
    ));
  end if;
  if not exists (select 1 from public.activities where id = '00000000-0000-4000-8000-000000000129') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'activities', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000129",
  "deleted_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "title": "契約更新",
  "activity_kind_id": "00000000-0000-4000-8000-000000000014",
  "body": "次期契約の期間と単価を顧客と調整しました。",
  "project_id": "00000000-0000-4000-8000-000000000107"
}'::jsonb || jsonb_build_object('recorded_by', first_user_id, 'occurred_at', to_char((demo_day - 6), 'YYYY-MM-DD') || 'T14:00:00+09:00'),
      'contact_ids', '["00000000-0000-4000-8000-000000000105"]'::jsonb,
      'engineer_ids', '["00000000-0000-4000-8000-000000000103"]'::jsonb
    ));
  end if;
  if not exists (select 1 from public.activities where id = '00000000-0000-4000-8000-000000000130') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'activities', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000130",
  "deleted_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "title": "新規プロジェクトの打診",
  "activity_kind_id": "00000000-0000-4000-8000-000000000014",
  "body": "新規開発の予定と必要な体制を確認しました。",
  "project_id": "00000000-0000-4000-8000-000000000107"
}'::jsonb || jsonb_build_object('recorded_by', second_user_id, 'occurred_at', to_char((demo_day - 7), 'YYYY-MM-DD') || 'T14:00:00+09:00'),
      'contact_ids', '["00000000-0000-4000-8000-000000000105"]'::jsonb,
      'engineer_ids', '["00000000-0000-4000-8000-000000000103"]'::jsonb
    ));
  end if;
  if not exists (select 1 from public.activities where id = '00000000-0000-4000-8000-000000000131') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'activities', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000131",
  "deleted_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "title": "人材提案（Javaエンジニア）",
  "activity_kind_id": "00000000-0000-4000-8000-000000000014",
  "body": "開発体制の候補となるエンジニアを提案しました。",
  "project_id": "00000000-0000-4000-8000-000000000107"
}'::jsonb || jsonb_build_object('recorded_by', first_user_id, 'occurred_at', to_char((demo_day - 8), 'YYYY-MM-DD') || 'T14:00:00+09:00'),
      'contact_ids', '["00000000-0000-4000-8000-000000000105"]'::jsonb,
      'engineer_ids', '["00000000-0000-4000-8000-000000000103"]'::jsonb
    ));
  end if;
  if not exists (select 1 from public.activities where id = '00000000-0000-4000-8000-000000000132') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'activities', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000132",
  "deleted_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "title": "高橋さんの参画面談",
  "activity_kind_id": "00000000-0000-4000-8000-000000000012",
  "body": "参画候補の高橋さんと顧客の担当者が、経験・スキルと参画条件を確認しました。",
  "project_id": null
}'::jsonb || jsonb_build_object('recorded_by', second_user_id, 'occurred_at', to_char((demo_day - 9), 'YYYY-MM-DD') || 'T14:00:00+09:00'),
      'contact_ids', '["00000000-0000-4000-8000-000000000105"]'::jsonb,
      'engineer_ids', '["00000000-0000-4000-8000-000000000104"]'::jsonb
    ));
  end if;
  if not exists (select 1 from public.activities where id = '00000000-0000-4000-8000-000000000133') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'activities', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000133",
  "deleted_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "title": "問い合わせ対応",
  "activity_kind_id": "00000000-0000-4000-8000-000000000015",
  "body": "顧客からの問い合わせに回答しました。",
  "project_id": "00000000-0000-4000-8000-000000000107"
}'::jsonb || jsonb_build_object('recorded_by', first_user_id, 'occurred_at', to_char((demo_day - 10), 'YYYY-MM-DD') || 'T14:00:00+09:00'),
      'contact_ids', '["00000000-0000-4000-8000-000000000105"]'::jsonb,
      'engineer_ids', '["00000000-0000-4000-8000-000000000103"]'::jsonb
    ));
  end if;
  if not exists (select 1 from public.activities where id = '00000000-0000-4000-8000-000000000134') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'activities', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000134",
  "deleted_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "title": "次年度計画について",
  "activity_kind_id": "00000000-0000-4000-8000-000000000014",
  "body": "顧客と次年度の開発計画と支援体制について相談しました。",
  "project_id": "00000000-0000-4000-8000-000000000107"
}'::jsonb || jsonb_build_object('recorded_by', second_user_id, 'occurred_at', to_char((demo_day - 11), 'YYYY-MM-DD') || 'T14:00:00+09:00'),
      'contact_ids', '["00000000-0000-4000-8000-000000000105"]'::jsonb,
      'engineer_ids', '["00000000-0000-4000-8000-000000000103"]'::jsonb
    ));
  end if;

  -- tasks
  if not exists (select 1 from public.tasks where id = '00000000-0000-4000-8000-000000000111') then
    perform public.crm_mutate(jsonb_build_object(
      'kind', 'save', 'table', 'tasks', 'expected_version', 0,
      'row', '{
  "id": "00000000-0000-4000-8000-000000000111",
  "deleted_at": null,
  "customer_id": "00000000-0000-4000-8000-000000000100",
  "title": "次期開発体制の提案書を送付",
  "body": null,
  "status": "open",
  "project_id": "00000000-0000-4000-8000-000000000107",
  "contract_period_id": null,
  "activity_id": "00000000-0000-4000-8000-000000000110",
  "automation_key": null
}'::jsonb || jsonb_build_object('assignee_user_id', first_user_id, 'due_at', to_char((demo_day + 3), 'YYYY-MM-DD') || 'T17:00:00+09:00')
    ));
  end if;

  -- 自動生成の更新確認タスクと通知も、アプリと同じロジックで作成します。
  perform public.crm_run_reminders();
  perform set_config('request.jwt.claim.sub', coalesce(previous_actor, ''), true);
end $sample$;

commit;
