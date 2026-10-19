-- Initial activity kinds and editable Markdown templates for a fresh database.
insert into public.activity_kinds(id,name,display_order) values
('00000000-0000-4000-8000-000000000014','商談',1),
('00000000-0000-4000-8000-000000000012','面談',2),
('00000000-0000-4000-8000-000000000015','その他',3)
on conflict(id) do nothing;

insert into public.activity_templates(id,name,body) values
('00000000-0000-4000-8000-000000000021','商談',E'## 相談・提案内容\n\n\n## 確認事項\n\n- \n\n## 決定事項\n\n\n## 次のアクション\n\n- [ ] '),
('00000000-0000-4000-8000-000000000022','面談',E'## 面談内容\n\n\n## 顧客の評価・意向\n\n\n## エンジニアの意向\n\n\n## 結果・次のアクション\n\n- [ ] '),
('00000000-0000-4000-8000-000000000023','その他',E'## 記録内容\n\n\n## 確認事項\n\n- \n\n## 次のアクション\n\n- [ ] ')
on conflict(id) do nothing;

insert into public.activity_templates_revisions(entity_id,version,operation,snapshot)
select id,version,'create',jsonb_build_object('row',to_jsonb(t),'reference_labels','{}'::jsonb)
from public.activity_templates t
on conflict(entity_id,version) do nothing;
