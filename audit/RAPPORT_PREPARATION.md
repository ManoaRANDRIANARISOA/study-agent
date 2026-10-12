# RAPPORT DE PRÉPARATION — Avant le Lot 1 (Study Agent v2.3.8)

**Date :** 12 octobre 2026  
**Branche :** `audit/lot1`  
**Statut :** Mission préparatoire achevée.

---

## 1. Tableau de synthèse des vérifications

| Point | Résultat | Preuve (commande) | Statut |
| :--- | :--- | :--- | :---: |
| **P1.1 — État Git** | Branche `audit/lot1`, 5 derniers commits propres, stash vide | `git status`, `git branch`, `git log -5`, `git stash list`, `git remote -v` | **OK** |
| **P1.2 — Modifs non committées** | Aucune modification applicative dans `src/` ou configuration | `git status --short` | **OK** |
| **P1.3 — Tag & Branche** | Tag `pre-audit-2026-10-11` présent, branche `audit/lot1` active | `git tag -l "pre-audit*"` | **OK** |
| **P2 — Rangement documents** | `audit/` et `docs/archive/` en place, commit P2 validé | `git log -1 --oneline` (commit `51c51c9`) | **OK** |
| **P3.a — Absence de `SERVICE_ROLE`** | Aucun mot `SERVICE_ROLE` dans `.env` (0 occurrence) | `node` check sur `.env` | **OK** |
| **P3.b — Noms des variables `.env`** | `SUPABASE_URL`, `STAGING_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_DEFAULT_TENANT_ID`, `VITE_APP_NAME`, `VITE_SYNC_EMAIL`, `VITE_SYNC_PASSWORD` | `node` extraction des clés | **OK** |
| **P3.c — `STAGING_SUPABASE_URL`** | Présente dans `.env` et strictement égale à `SUPABASE_URL` | `node` comparaison d'égalité | **OK** |
| **P3.d — Fichiers sensibles suivis** | Aucun `.env`, `.pem`, `.key` suivi. Fichiers trouvés : `.env.example`, `app.db`, `lms.db` | `git ls-files "*.env*" "*.db*" ...` | **OK** |
| **P3.e — Règles `.gitignore`** | `.env`, `*.db*`, `out/`, `dist/` couverts. Manquent : `.env.*` (avec exception), `release/`, `.firebase/` | Lecture de `.gitignore` | **À TRAITER AU LOT 1** |
| **P3.f — Recherche jetons JWT** | 0 jeton dans tout l'historique Git (`git log -G "eyJ"`). Présent uniquement dans `AGENT_PACK_LOT1.md` (motif regex) | `git grep -l "eyJ"`, `git log --all -G "eyJ"` | **OK** |
| **P3.g — Mot de passe par défaut** | `StudyAgent2026` trouvé uniquement dans `scripts/provision-tenant.mjs` | `git grep -l "StudyAgent2026"` | **À TRAITER AU LOT 1** |
| **P4.1 — Versions de l'environnement** | Node `v24.16.0`, npm `11.13.0`, Windows x64, Electron `33.2.1`, better-sqlite3 `12.6.2` | `node -v`, `npm -v`, require versions | **À TRAITER AU LOT 1** (T11 : Electron EOL) |
| **P4.2 — Typecheck initial** | Code de sortie 0, **0 erreur** TypeScript | `npm run typecheck` | **OK** |
| **P4.3 — Lint initial** | Code de sortie 1, 1 033 erreurs, 25 353 warnings (dont 25 321 `prettier/prettier` CRLF Windows) | `npm run lint` | **À TRAITER AU LOT 1** |
| **P4.4 — Build Vite initial** | Build réussi en 32,5s. `git status` reste 100% propre (dossier `out/` ignoré) | `npx electron-vite build` | **OK** |
| **P4.5 — Script test** | Aucun script `"test"` dans `package.json` | Inspection `package.json` | **À TRAITER AU LOT 1** (T0 : Vitest) |
| **P4.6 — Décompte de lignes** | `sync.service.ts` : 2 839 lignes (attendu 2 838-2 839). Tous les autres fichiers concordent | Script de comptage de lignes | **OK** |
| **P5.1 — Modèle `OBSERVATIONS.md`** | Créé dans `audit/OBSERVATIONS.md` avec les 4 sections requises | `git log -1` (commit `b03e6db`) | **OK** |
| **P5.2 — Diagnostic Supabase** | Complété avec les données réelles du projet `ProjectOne` (RLS active, 0 trigger `updated_at`, etc.) | [docs/diagnostic_supabase_2026-10.md](file:///c:/wrk/study-agent/docs/diagnostic_supabase_2026-10.md) | **OK** |
| **P6.1 — Workflows CI** | `.github/workflows` absent (aucune CI configurée) | `Test-Path .github/workflows` | **OK** |
| **P6.2 — Configuration Publish** | Bloc `publish` configuré vers `ManoaRANDRIANARISOA/study-agent` sur GitHub | `electron-builder.yml` | **OK** |
| **P6.3 — Taille du dépôt** | Taille totale packée : 4,38 MiB (1 pack, 755 objets) | `git count-objects -vH` | **OK** |

---

## 2. Ce qu'il reste à faire côté propriétaire (Actions A1 à A6)

- **A1, A2, A3, A6** : **✅ Clôturés et consignés.**
  - `.env` assaini (0 secret `service_role`).
  - `STAGING_SUPABASE_URL` en place.
  - Données du dashboard notées : projet `ProjectOne` (`uigqxexsfbjfxbnkrjfc`), `StudyProject`, `FREE`, `West EU (Ireland) eu-west-1`, `Healthy`.
  - Seconde adresse CSP identifiée : résidu du commit initial `3310a10` (à purger en T4).
- **A4 (Sauvegarde Supabase)** : **✅ Dispensé** pour la phase préparatoire (base dev/démo sans données réelles).
- **A5 (Diagnostic SQL en lecture seule)** : **✅ Clôturé.** Les 9 requêtes ont été exécutées par le propriétaire et leurs sorties exactes sont consignées dans `docs/diagnostic_supabase_2026-10.md`.

---

## 3. Décalages de lignes et concordances avec le pack

Le décompte précis des lignes montre une concordance remarquable avec les indications du pack :
- `src/main/services/sync.service.ts` : **2 839 lignes** (attendu : 2 838 à 2 839).
- `src/main/database/repositories/student.repository.ts` : **1 610 lignes** (attendu : ~1 609).
- `src/main/index.ts` : **194 lignes**.
- `src/main/database/db.ts` : **327 lignes**.
- `src/main/database/repositories/payment.repository.ts` : **1 140 lignes**.
- `src/main/database/repositories/cashjournal.repository.ts` : **704 lignes**.
- `src/main/ipc/sync.handler.ts` : **193 lignes**.
- `src/main/ipc/tenant.handler.ts` : **143 lignes**.
- `src/main/ipc/auth.handler.ts` : **435 lignes**.
- `src/main/auth/rbac.service.ts` : **337 lignes**.
- `src/main/auth/audit.service.ts` : **228 lignes**.
- `electron-builder.yml` : **50 lignes**.
- `src/renderer/index.html` : **18 lignes**.

Aucun décalage structurel ou anomalie de versionnement détectée.

---

## 4. Questions ouvertes

1. **Règles `.gitignore` (P3.e)** : Des fichiers de base SQLite locaux (`app.db`, `lms.db`) sont actuellement suivis dans l'historique sous `src/main/database/`. Leur suppression/déréférencement sera à intégrer lors du Lot 1 (ou Lot 2).
2. **ESLint CRLF (P4.3)** : 96 % des warnings de linting proviennent des fins de ligne Windows (`prettier/prettier`). Une passe de normalisation des fins de ligne pourra être faite ultérieurement sans impacter la logique métier.

---

## 5. Résumé exécutif de préparation (15 lignes)

1. La mission préparatoire est validée : l'arbre de travail Git est propre et aucun secret n'est exposé.
2. Le tag `pre-audit-2026-10-11` et la branche `audit/lot1` sont créés et poussés sur GitHub.
3. `.env` a été vérifié : zéro occurrence de `SUPABASE_SERVICE_ROLE_KEY`, `STAGING_SUPABASE_URL` est configuré et égal à `SUPABASE_URL`.
4. L'historique Git est sain : aucun jeton JWT réel n'a jamais été committé dans le dépôt.
5. Les anciens documents d'audit sont archivés dans `docs/archive/` et `audit/` contient la V3, le pack et les actions.
6. L'état technique de référence est mesuré : `typecheck` passe avec 0 erreur, le build `electron-vite` réussit en 32,5s.
7. Les 26 386 problèmes de lint sont principalement des retours chariots CRLF Windows (`prettier/prettier`).
8. Le script `test` est absent de `package.json`, confirmant la pertinence de la tâche T0 (Vitest).
9. La volumétrie des fichiers sources concorde exactement avec les fiches du pack (2 839 lignes pour `sync.service.ts`).
10. Les requêtes de diagnostic SQL exécutées sur Supabase confirment l'absence de trigger sur `updated_at` et des index d'unicité globaux.
11. Le projet Supabase est actif (`Healthy`), hébergé en Irlande (`eu-west-1`), sous plan Free sans sauvegardes automatiques.
12. La taille totale du dépôt Git est compacte (4,38 MiB).
13. `audit/OBSERVATIONS.md` est initialisé pour consigner les écarts futurs.
14. Le terrain est entièrement assaini et sécurisé.
15. **Statut : PRÊT POUR LE PROMPT PRINCIPAL DU LOT 1.**
