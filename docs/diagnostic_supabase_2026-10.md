# Diagnostic Supabase — État Initial (12 Octobre 2026)

Projet : `ProjectOne` (`uigqxexsfbjfxbnkrjfc`)  
Organisation : `StudyProject`  
Région : `West EU (Ireland)` (`eu-west-1`)  
Plan : `FREE`  

Ce document compile les résultats des 9 requêtes de diagnostic en lecture seule exécutées dans l'éditeur SQL de Supabase.

---

## 1. Policies de la base publique
*Requête exécutée :*
```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;
```

*Résultats :*
```
schemaname,tablename,policyname,cmd,roles,qual,with_check
public,assessments,isolation_ecole_assessments,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,bus_attendance,isolation_ecole_bus_attendance,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,candidates,Enable insert for anonymous users,INSERT,{public},null,true
public,candidates,Enable read access for all,SELECT,{public},true,null
public,canteen_attendance,isolation_ecole_canteen_attendance,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,cash_closures,isolation_ecole_cash_closures,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,cash_journal,isolation_ecole_cash_journal,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,class_subjects,isolation_ecole_class_subjects,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,custom_deductions,isolation_ecole_custom_deductions,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,daily_attendance,isolation_ecole_daily_attendance,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,ecoles,allow_read_own_ecole,SELECT,{authenticated},(id = auth_ecole_id()),null
public,event_payments,isolation_ecole_event_payments,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,grades,isolation_ecole_grades,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,inscriptions,Allow anonymous inserts for inscriptions,INSERT,{anon},null,true
public,inscriptions,Allow anonymous updates for inscriptions,UPDATE,{anon},true,null
public,inscriptions,Allow read access for all on inscriptions,SELECT,{public},true,null
public,parent_events,isolation_ecole_parent_events,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,payroll_ignores,isolation_ecole_payroll_ignores,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,personnel,isolation_ecole_personnel,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,personnel_absences,isolation_ecole_personnel_absences,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,salary_advances,isolation_ecole_salary_advances,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,settings,isolation_ecole_settings,ALL,{public},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,student_fees,isolation_ecole_student_fees,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,student_payments,isolation_ecole_student_payments,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,students,isolation_ecole_students,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,subjects,isolation_ecole_subjects,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,time_tracking,isolation_ecole_time_tracking,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,users,isolation_ecole_users,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
public,workstations,isolation_ecole_workstations,ALL,{authenticated},(ecole_id = auth_ecole_id()),(ecole_id = auth_ecole_id())
```

---

## 2. Tables SANS sécurité par ligne (RLS)
*Requête exécutée :*
```sql
select c.relname as table_sans_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
```

*Résultats :*
```
Success. No rows returned
```

---

## 3. Triggers existants
*Requête exécutée :*
```sql
select event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers where trigger_schema = 'public' order by 1, 2;
```

*Résultats :*
```csv
event_object_table,trigger_name,action_timing,event_manipulation
inscriptions,Inscriptions-make,AFTER,INSERT
```

---

## 4. Index et contraintes d'unicité
*Requête exécutée :*
```sql
select tablename, indexname, indexdef
from pg_indexes where schemaname = 'public' and indexdef ilike '%unique%' order by 1, 2;
```

*Résultats :*
```csv
tablename,indexname,indexdef
assessments,assessments_pkey,CREATE UNIQUE INDEX assessments_pkey ON public.assessments USING btree (id)
assessments,assessments_school_year_class_name_term_value_key,"CREATE UNIQUE INDEX assessments_school_year_class_name_term_value_key ON public.assessments USING btree (school_year, class_name, term_value)"
bus_attendance,bus_attendance_pkey,CREATE UNIQUE INDEX bus_attendance_pkey ON public.bus_attendance USING btree (id)
bus_attendance,bus_attendance_student_id_attendance_date_key,"CREATE UNIQUE INDEX bus_attendance_student_id_attendance_date_key ON public.bus_attendance USING btree (student_id, attendance_date)"
candidates,candidates_pkey,CREATE UNIQUE INDEX candidates_pkey ON public.candidates USING btree (id)
canteen_attendance,canteen_attendance_pkey,CREATE UNIQUE INDEX canteen_attendance_pkey ON public.canteen_attendance USING btree (id)
canteen_attendance,canteen_attendance_student_id_attendance_date_key,"CREATE UNIQUE INDEX canteen_attendance_student_id_attendance_date_key ON public.canteen_attendance USING btree (student_id, attendance_date)"
cash_closures,cash_closures_pkey,CREATE UNIQUE INDEX cash_closures_pkey ON public.cash_closures USING btree (id)
cash_journal,cash_journal_pkey,CREATE UNIQUE INDEX cash_journal_pkey ON public.cash_journal USING btree (id)
class_subjects,class_subjects_class_name_subject_id_key,"CREATE UNIQUE INDEX class_subjects_class_name_subject_id_key ON public.class_subjects USING btree (class_name, subject_id)"
class_subjects,class_subjects_pkey,CREATE UNIQUE INDEX class_subjects_pkey ON public.class_subjects USING btree (id)
custom_deductions,custom_deductions_pkey,CREATE UNIQUE INDEX custom_deductions_pkey ON public.custom_deductions USING btree (id)
daily_attendance,daily_attendance_personnel_id_attendance_date_key,"CREATE UNIQUE INDEX daily_attendance_personnel_id_attendance_date_key ON public.daily_attendance USING btree (personnel_id, attendance_date)"
daily_attendance,daily_attendance_pkey,CREATE UNIQUE INDEX daily_attendance_pkey ON public.daily_attendance USING btree (id)
ecoles,ecoles_pkey,CREATE UNIQUE INDEX ecoles_pkey ON public.ecoles USING btree (id)
event_payments,event_payments_pkey,CREATE UNIQUE INDEX event_payments_pkey ON public.event_payments USING btree (id)
grades,grades_pkey,CREATE UNIQUE INDEX grades_pkey ON public.grades USING btree (id)
grades,grades_student_id_subject_id_school_year_term_key,"CREATE UNIQUE INDEX grades_student_id_subject_id_school_year_term_key ON public.grades USING btree (student_id, subject_id, school_year, term)"
inscriptions,inscriptions_pkey,CREATE UNIQUE INDEX inscriptions_pkey ON public.inscriptions USING btree (id)
parent_events,parent_events_pkey,CREATE UNIQUE INDEX parent_events_pkey ON public.parent_events USING btree (id)
payroll_ignores,payroll_ignores_pkey,CREATE UNIQUE INDEX payroll_ignores_pkey ON public.payroll_ignores USING btree (id)
personnel,personnel_pkey,CREATE UNIQUE INDEX personnel_pkey ON public.personnel USING btree (id)
personnel_absences,personnel_absences_pkey,CREATE UNIQUE INDEX personnel_absences_pkey ON public.personnel_absences USING btree (id)
salary_advances,salary_advances_pkey,CREATE UNIQUE INDEX salary_advances_pkey ON public.salary_advances USING btree (id)
settings,settings_pkey,CREATE UNIQUE INDEX settings_pkey ON public.settings USING btree (key)
student_fees,student_fees_pkey,CREATE UNIQUE INDEX student_fees_pkey ON public.student_fees USING btree (id)
student_fees,student_fees_student_id_school_year_key,"CREATE UNIQUE INDEX student_fees_student_id_school_year_key ON public.student_fees USING btree (student_id, school_year)"
student_payments,student_payments_pkey,CREATE UNIQUE INDEX student_payments_pkey ON public.student_payments USING btree (id)
students,students_pkey,CREATE UNIQUE INDEX students_pkey ON public.students USING btree (id)
students,students_registration_number_key,CREATE UNIQUE INDEX students_registration_number_key ON public.students USING btree (registration_number)
subjects,subjects_name_key,CREATE UNIQUE INDEX subjects_name_key ON public.subjects USING btree (name)
subjects,subjects_pkey,CREATE UNIQUE INDEX subjects_pkey ON public.subjects USING btree (id)
time_tracking,time_tracking_personnel_id_month_key,"CREATE UNIQUE INDEX time_tracking_personnel_id_month_key ON public.time_tracking USING btree (personnel_id, month)"
time_tracking,time_tracking_pkey,CREATE UNIQUE INDEX time_tracking_pkey ON public.time_tracking USING btree (id)
users,users_pkey,CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)
users,users_username_ecole_id_key,"CREATE UNIQUE INDEX users_username_ecole_id_key ON public.users USING btree (username, ecole_id)"
workstations,workstations_ecole_id_machine_id_key,"CREATE UNIQUE INDEX workstations_ecole_id_machine_id_key ON public.workstations USING btree (ecole_id, machine_id)"
workstations,workstations_ecole_id_station_code_key,"CREATE UNIQUE INDEX workstations_ecole_id_station_code_key ON public.workstations USING btree (ecole_id, station_code)"
workstations,workstations_pkey,CREATE UNIQUE INDEX workstations_pkey ON public.workstations USING btree (id)
```

---

## 5. Colonnes de toutes les tables
*Requête exécutée :*
```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position;
```

*Résultats :*
```csv
table_name,column_name,data_type,is_nullable
assessments,id,text,NO
assessments,school_year,text,NO
assessments,class_name,text,YES
assessments,name,text,NO
assessments,term_value,integer,NO
assessments,weight,numeric,YES
assessments,created_at,timestamp with time zone,YES
assessments,updated_at,timestamp with time zone,YES
assessments,ecole_id,text,YES
bus_attendance,id,text,NO
bus_attendance,student_id,text,NO
bus_attendance,created_at,timestamp with time zone,YES
bus_attendance,updated_at,timestamp with time zone,YES
bus_attendance,version,integer,YES
bus_attendance,sync_status,text,YES
bus_attendance,attendance_date,date,NO
bus_attendance,present,boolean,YES
bus_attendance,ecole_id,text,YES
candidates,id,uuid,NO
candidates,created_at,timestamp with time zone,NO
candidates,nom,text,NO
candidates,prenom,text,NO
candidates,date_naissance,date,NO
candidates,tel,text,NO
candidates,email,text,NO
candidates,adresse,text,NO
candidates,situation_matrimoniale,text,YES
candidates,is_membre_eglise,boolean,YES
candidates,nom_eglise,text,YES
candidates,is_membre_sampana,boolean,YES
candidates,nom_sampana,text,YES
candidates,centres_interet,text,YES
candidates,niveau_etudes,text,YES
candidates,certifications,text,YES
candidates,autres_certifications,text,YES
candidates,annees_experience,integer,YES
candidates,exp_enfants,text,YES
candidates,exp_enfants_age,text,YES
candidates,exp_enfants_duree,text,YES
candidates,exp_enfants_structure,text,YES
candidates,exp_anglais,text,YES
candidates,exp_montessori,text,YES
candidates,exp_montessori_details,text,YES
candidates,disponibilite,text,YES
candidates,disponibilites_horaires,text,YES
candidates,qualites,ARRAY,YES
candidates,defauts,ARRAY,YES
candidates,trois_mots,text,YES
candidates,mots_moins_correspondants,text,YES
candidates,reaction_feedback,text,YES
candidates,qualites_equipe,text,YES
candidates,reaction_difference,text,YES
candidates,reconforter_enfant,text,YES
candidates,accompagner_enfant,text,YES
candidates,situation_pratique,text,YES
candidates,test_anglais,text,YES
candidates,explication_maths,text,YES
candidates,status,text,YES
canteen_attendance,id,text,NO
canteen_attendance,student_id,text,NO
canteen_attendance,created_at,timestamp with time zone,YES
canteen_attendance,updated_at,timestamp with time zone,YES
canteen_attendance,version,integer,YES
canteen_attendance,sync_status,text,YES
canteen_attendance,attendance_date,date,NO
canteen_attendance,present,boolean,YES
canteen_attendance,ecole_id,text,YES
cash_closures,id,text,NO
cash_closures,ecole_id,text,NO
cash_closures,closure_date,date,NO
cash_closures,closure_datetime,timestamp with time zone,YES
cash_closures,cashier_username,text,NO
cash_closures,station_code,text,NO
cash_closures,total_tickets,integer,NO
cash_closures,expected_cash,numeric,YES
cash_closures,expected_check,numeric,YES
cash_closures,expected_mobile,numeric,YES
cash_closures,expected_transfer,numeric,YES
cash_closures,expected_total,numeric,YES
cash_closures,counted_cash,numeric,YES
cash_closures,counted_breakdown,text,YES
cash_closures,cash_difference,numeric,YES
cash_closures,status,text,NO
cash_closures,notes,text,YES
cash_closures,is_locked,integer,NO
cash_closures,sync_status,text,YES
cash_closures,version,integer,YES
cash_closures,deleted,boolean,YES
cash_closures,created_at,timestamp with time zone,YES
cash_closures,updated_at,timestamp with time zone,YES
cash_journal,id,text,NO
cash_journal,created_at,timestamp with time zone,YES
cash_journal,updated_at,timestamp with time zone,YES
cash_journal,version,integer,YES
cash_journal,sync_status,text,YES
cash_journal,last_synced_at,timestamp with time zone,YES
cash_journal,deleted,boolean,YES
cash_journal,transaction_date,date,NO
cash_journal,type,text,NO
cash_journal,category,text,NO
```

---

## 6. Fonctions et mode d'exécution (security definer ?)
*Requête exécutée :*
```sql
select p.proname, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';
```

*Résultats :*
```csv
proname,security_definer
auth_ecole_id,false
```

---

## 7. Buckets de stockage et leur visibilité
*Requête exécutée :*
```sql
select id, name, public, file_size_limit from storage.buckets;
```

*Résultats :*
```csv
id,name,public,file_size_limit
school_files,school_files,true,null
```

---

## 8. Policies de stockage
*Requête exécutée :*
```sql
select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage';
```

*Résultats :*
```csv
policyname,cmd,qual,with_check
Lecture publique,SELECT,(bucket_id = 'school_files'::text),null
Update authentifié,UPDATE,(bucket_id = 'school_files'::text),null
Upload authentifié,INSERT,null,(bucket_id = 'school_files'::text)
```

---

## 9. Écoles et comptes de synchronisation
*Requête exécutée :*
```sql
select id, nom from public.ecoles;
select id, email, raw_app_meta_data from auth.users;
```

*Résultats :*
```csv
id,email,raw_app_meta_data
f8bd7e78-5d2d-452c-ab51-2b68187bb35f,sync-ecole_dev@studyagent.local,"{""role"":""service_account"",""ecole_id"":""ecole_dev"",""provider"":""email"",""providers"":[""email""]}"
```
