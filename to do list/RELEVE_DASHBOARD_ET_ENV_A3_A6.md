# Relevé Initial — Supabase Dashboard & Configuration (Actions A1, A2, A3, A6)

Date du relevé : 12 octobre 2026

---

## 1. Action A1 & A2 — Fichier d'environnement (.env)
- **SUPABASE_SERVICE_ROLE_KEY** : **ABSENT** du fichier `.env` local (0 occurrence détectée).
- **STAGING_SUPABASE_URL** : **PRÉSENT** dans le fichier `.env` local et configuré avec l'URL du projet de staging/dev (`https://uigqxexsfbjfxbnkrjfc.supabase.co`).
- **SUPABASE_ANON_KEY** & **VITE_SYNC_EMAIL / PASSWORD** : Présents pour le fonctionnement de l'agent et de l'application cliente.

---

## 2. Action A3 — Tableau de bord Supabase (Relevé visuel vérifié)
Informations relevées depuis le tableau de bord officiel Supabase (`https://supabase.com/dashboard/project/uigqxexsfbjfxbnkrjfc`) :

- **Nom du projet** : `ProjectOne` (Ref ID : `uigqxexsfbjfxbnkrjfc`)
- **Organisation** : `StudyProject`
- **Plan d'abonnement** : `FREE`
- **Statut du projet** : `Healthy` (Actif)
- **Région d'hébergement** : `West EU (Ireland)` (`eu-west-1`)
- **Taille de calcul (Compute size)** : `13.nano`
- **Sauvegardes automatiques** : `No backups` (normal sur le plan Free Supabase)
- **Migrations Supabase** : `No migrations`
- **Dépôt GitHub lié** : `No repository connected`

---

## 3. Action A6 — Seconde adresse Supabase dans la CSP (`src/renderer/index.html`, L9)
- **Adresse identifiée** : `https://onxnctfgxxgxipehmfqb.supabase.co`
- **Analyse du code & Git** :
  - Cette adresse est présente uniquement dans la balise `<meta http-equiv="Content-Security-Policy">` de `src/renderer/index.html` (L9).
  - Elle date du tout premier commit (`3310a10 Initial commit for Study Agent (Phase 2 completion)`).
  - Elle ne figure dans aucun service ou fichier TypeScript de l'application.
  - **Verdict** : Résidu du projet prototype initial (Phase 2 / LMS). Ne contient pas de flux actif pour Study Agent. À nettoyer dans le Lot 1 (T4).

---

## 4. Statut des Actions Préparatoires Phase A

| Action | Description | Statut |
| :--- | :--- | :--- |
| **A1** | Retrait de `SUPABASE_SERVICE_ROLE_KEY` de `.env` | ✅ **FAIT** |
| **A2** | Ajout de `STAGING_SUPABASE_URL` dans `.env` | ✅ **FAIT** |
| **A3** | Relevé tableau de bord Supabase (actif, région, plan, nom) | ✅ **FAIT** (voir section 2) |
| **A4** | Sauvegarde de sécurité Supabase (`db dump`) | ⏳ En attente de réalisation |
| **A5** | Exécution requêtes SQL lecture seule (Annexe 1) | ⏳ En cours d'exécution dans SQL Editor |
| **A6** | Identification seconde adresse Supabase CSP (`onxn...`) | ✅ **FAIT** (voir section 3) |
| **A7** | Archivage anciens audits dans `docs/archive/` | ✅ **FAIT** |
| **A8** | Organisation du dossier `audit/` (V3 + Pack Lot 1 + Actions) | ✅ **FAIT** |
| **A9** | Tag git `pre-audit-2026-10-11` et branche `audit/lot1` | ⏳ Prêt à être exécuté avec commit de snapshot |
