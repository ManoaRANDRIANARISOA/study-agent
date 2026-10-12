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
(Collez le résultat ici ou CSV/JSON exporté depuis Supabase)
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
(Collez le résultat ici)
```

---

## 3. Triggers existants
*Requête exécutée :*
```sql
select event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers where trigger_schema = 'public' order by 1, 2;
```

*Résultats :*
```
(Collez le résultat ici)
```

---

## 4. Index et contraintes d'unicité
*Requête exécutée :*
```sql
select tablename, indexname, indexdef
from pg_indexes where schemaname = 'public' and indexdef ilike '%unique%' order by 1, 2;
```

*Résultats :*
```
(Collez le résultat ici)
```

---

## 5. Colonnes de toutes les tables
*Requête exécutée :*
```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position;
```

*Résultats :*
```
(Collez le résultat ici)
```

---

## 6. Fonctions et mode d'exécution (security definer ?)
*Requête exécutée :*
```sql
select p.proname, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';
```

*Résultats :*
```
(Collez le résultat ici)
```

---

## 7. Buckets de stockage et leur visibilité
*Requête exécutée :*
```sql
select id, name, public, file_size_limit from storage.buckets;
```

*Résultats :*
```
(Collez le résultat ici)
```

---

## 8. Policies de stockage
*Requête exécutée :*
```sql
select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage';
```

*Résultats :*
```
(Collez le résultat ici)
```

---

## 9. Écoles et comptes de synchronisation
*Requête exécutée :*
```sql
select id, nom from public.ecoles;
select id, email, raw_app_meta_data from auth.users;
```

*Résultats :*
```
(Collez le résultat ici)
```
