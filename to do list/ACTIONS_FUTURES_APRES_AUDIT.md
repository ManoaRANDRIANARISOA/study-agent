# ACTIONS FUTURES APRÈS L'AUDIT — Study Agent

**Pour qui :** le propriétaire du projet. Ce fichier liste **tout ce qui reste à faire**, dans l'ordre, et **qui** le fait.
**Documents liés :** `rapport_maitre_consolide_study_agent_v3.md` (le « pourquoi »), `AGENT_PACK_LOT1.md` (l'exécution du Lot 1).
**Date de rédaction :** 11 octobre 2026.

**Légende « Qui »** : **P** = vous (propriétaire) · **AG** = Antigravity · **EC** = expert-comptable · **J** = juriste · **C** = Claude (relecture, rédaction des packs suivants).

**Règle d'or :** l'agent n'exécute **jamais** une action marquée **P**, **EC** ou **J**. Il n'a ni la clé `service_role`, ni accès au tableau de bord Supabase, ni accès à votre argent.

---

## PHASE A — Avant d'envoyer le prompt à Antigravity (1 à 2 heures)

| # | Qui | Action | Fait quand… |
|---|---|---|---|
| A1 | P | Retirer la ligne `SUPABASE_SERVICE_ROLE_KEY` du `.env` du dépôt. Conserver sa valeur dans un gestionnaire de mots de passe (elle sert à vous, pas à l'agent). | ✅ FAIT (.env assaini, 0 occurrence) |
| A2 | P | Préparer le fichier d'environnement **de l'agent** : URL du projet, clé **anon**, identifiants du compte de synchronisation, et `STAGING_SUPABASE_URL` (l'URL exacte du projet actuel, qui sert de garde dans les tests). | ✅ FAIT (STAGING_SUPABASE_URL configuré) |
| A3 | P | Ouvrir le tableau de bord Supabase : le projet est-il **actif** ou en pause ? Noter la **région**, le **plan**, le nom du projet et de l'organisation. | ✅ FAIT (Healthy, West EU Ireland eu-west-1, FREE, ProjectOne / StudyProject) |
| A4 | P | Sauvegarder le projet actuel : `supabase db dump` (schéma) et `supabase db dump --data-only` (données) avec la CLI Supabase, ou un export équivalent. Stocker **hors du dépôt**. | ⏳ À faire |
| A5 | P | Exécuter les **requêtes SQL en lecture seule** de l'annexe 1 dans l'éditeur SQL de Supabase, et enregistrer les résultats dans `docs/diagnostic_supabase_2026-10.md`. Ce sont les preuves que les audits n'ont pas pu exporter. | ⏳ En cours (SQL Editor) |
| A6 | P | Identifier la **seconde adresse Supabase** de la CSP (`src/renderer/index.html`, ligne 9, hôte commençant par `onxn`). Est-ce un autre projet à vous ? Contient-il des données réelles (par exemple celles du projet LMS) ? **Ne rien modifier.** | ✅ FAIT (Résidu initial commit 3310a10, aucun flux actif) |
| A7 | P | Archiver dans `docs/archive/` : `audit_technique_et_qa_complet.md` (ancien rapport d'Antigravity) et `rapport_maitre_consolide_study_agent.md` (v2). Tout leur contenu est repris dans la v3. | ✅ FAIT (archivés dans docs/archive/) |
| A8 | P | Placer dans `audit/` du dépôt : le rapport v3, `AGENT_PACK_LOT1.md` et ce fichier. | ✅ FAIT (audit/ contient les 3 fichiers) |
| A9 | AG | Créer un tag git `pre-audit-2026-10-11` et une branche `audit/lot1` (déjà prévu dans le prompt). | ⏳ Prêt après snapshot git |

---

## PHASE B — Pendant le Lot 1 : vos actions

| # | Qui | Quand | Action |
|---|---|---|---|
| B1 | P | à chaque point d'arrêt | Lire le rapport de l'agent et répondre « GO » ou corriger. Points d'arrêt : fin de l'étape 0, T0, T4, T8, avant T9, après T9, avant T11. |
| B2 | P | **après la validation de T9** | Régénérer la clé `service_role` dans le tableau de bord. **Attention :** selon la méthode de rotation, la clé **anon** peut changer aussi : mettre à jour le `.env` de développement et celui de l'agent. Vérifier la procédure actuelle dans la documentation Supabase avant d'agir. |
| B3 | P | après T9 | Changer le **mot de passe du compte de synchronisation** (Authentication → Users). Valeur aléatoire forte, dans le gestionnaire de mots de passe. **Ne jamais réutiliser** le mot de passe par défaut du script `provision-tenant.mjs`. |
| B4 | P | dès maintenant (délai long) | Choisir et commander un **certificat de signature de code** pour Windows (T10). La validation du certificat peut prendre des jours. Tant qu'il n'existe pas : **aucune distribution à un client**. |
| B5 | P | après T9 | Lire le résultat du scan d'installateur : il ne doit trouver ni `.env`, ni JWT `service_role`. |
| B6 | AG puis P | après l'étape 0 | L'agent mesure le réseau depuis votre machine (annexe du prompt) ; vous lisez `docs/mesure_reseau.md` pour choisir la région (décision C7). |
| B7 | P | à la fin du Lot 1 | Envoyer à Claude : les rapports de tâche, `OBSERVATIONS.md` et le résultat des diagnostics de A5, pour rédiger le **pack du Lot 2** sur le code réel. |

---

## PHASE C — Décisions à prendre avant le Lot 2

| # | Qui | Décision | Pourquoi / critère |
|---|---|---|---|
| C1 | P | **Quel projet devient la production ?** Le projet actuel, **nettoyé et reconstruit par migrations**, ou un **nouveau** projet. | Région correcte et acceptable après mesure : projet actuel possible. Sinon : nouveau projet. Dans les deux cas, un projet reste réservé au développement. |
| C2 | P | **Organisation Supabase de production** : plan Pro, double authentification, au moins 2 propriétaires, alerte de dépense. | Un seul compte sans 2FA est le point faible n° 1 d'un hébergement. |
| C3 | EC | **Numérotation des reçus et journal de caisse** (questions en annexe 2). | La base légale n'est pas vérifiée. Conditionne QA-007 et QA-009. |
| C4 | J | **Protection des données** : loi n° 2014-038, déclaration à la CMIL, hébergement à l'étranger, contrat de sous-traitance (questions en annexe 2). | Conditionne QA-041. À faire **avant** le premier client. |
| C5 | P | **Profils de durée hors ligne** par offre (par défaut 30 jours ; longue coupure ; illimité sur acceptation écrite du risque). | Conditionne QA-040. |
| C6 | P | **Offres standard et « excellence »** : seuils qui déclenchent un projet dédié (nombre de postes, taille, exigence contractuelle). | Conditionne l'activation par école (rapport 13.1, D2 et D4). |
| C7 | P | **Région d'hébergement**, d'après les mesures de B6. | Le choix est définitif pour un projet. |
| C8 | P | **École pilote** : laquelle, avec quel débit, quel plan de retour arrière, quelles règles de support. | Choisir une école à connexion difficile, pas la meilleure. |
| C9 | P | Outil de **rapports de plantage** avec masquage des données personnelles. | Évite d'envoyer des noms d'élèves à un tiers. |
| C10 | P | **Budget** : Pro, récupération à un instant donné (PITR), stockage externe des sauvegardes, certificat, temps d'un juriste et d'un expert-comptable. | |

---

## PHASE D — Lot 2 : intégrité, finance, isolation (2 à 6 semaines)
**Préalable :** pack du Lot 2 rédigé (B7) et décisions C1 à C4 prises.

| Fiche | Résultat attendu | Dépend de |
|---|---|---|
| QA-003, QA-038 | schéma Supabase **versionné** (migrations numérotées), RLS complète, aucune table sans policy | A5, C1 |
| QA-022 | unicités **par école** (matricule, matières, réglages), fin de l'alignement par nom | QA-003 |
| QA-007, QA-008 | journal de caisse **en insertion seule** avec contrepassation ; montants **entiers** | C3 |
| QA-009 | reçus uniques par école, code de poste enregistré, compteur dérivé des données | C3, QA-007 |
| QA-014, QA-013 | fiches de paie figées, décaissement unique ; notes verrouillées avec historique | |
| QA-023 | lignes en erreur visibles (jamais abandonnées en silence) | QA-022 |
| QA-029, QA-031 | identité de l'école attachée aux données locales ; migrations SQLite transactionnelles | |
| QA-019 | sauvegardes locales, `synchronous=FULL`, procédure de restauration | |
| QA-012 | photos et fichiers dans des buckets **privés**, chemins par école | QA-003 |
| QA-034, QA-036 | gestion centrale des erreurs ; scripts sans `DROP` | |

**Fin du Lot 2 :** tous les critères de validation de ces fiches sont automatisés et verts ; vous avez relu le rapport de chaque tâche financière.

## PHASE E — Lot 3 : synchronisation robuste et bas débit (4 à 10 semaines)
Horodatage et séquence **côté serveur** livrés **avec** le client (jamais le trigger seul) : QA-021, QA-026, QA-027 · deltas par champ et versions : QA-005, QA-006 · curseurs par table et par page, lots transactionnels, financier envoyé avant le pull, quarantaine des lignes invalides : QA-020, QA-037 · un compte par poste : QA-024, QA-032 · abonnement et bail signés par le serveur : QA-033, QA-040.
**Fin du Lot 3 :** budgets de performance du rapport (7.2) tenus à 256 kbps ; tests de pannes (coupure, horloge à ±5 jours, 3 semaines hors ligne) verts.

## PHASE F — Lot 4 : industrialisation
Tests de caractérisation puis découpage de `sync.service.ts` (QA-018) · intégration continue bloquante (typecheck, lint, tests, isolation, scan de secrets, audit de dépendances, scan d'installateur) · **T10 signature** et **T11 Electron** si ce n'est pas déjà fait · worker de synchronisation **seulement si une mesure l'exige**.

---

## PHASE G — Porte GO/NO-GO avant le premier client réel
Cochez tout. Un seul « non » = pas d'installation chez un client.

- [ ] Lot 1 terminé et validé (y compris T9, rotation faite)
- [ ] Lot 2 terminé : caisse en insertion seule, montants entiers, reçus uniques, unicités par école
- [ ] Noyau du Lot 3 terminé : QA-021, QA-026, QA-027, QA-005
- [ ] Sauvegardes quotidiennes **testées par une restauration réelle**
- [ ] Photos privées ; aucun bucket public
- [ ] Installateur **signé** ; scan sans secret
- [ ] Electron sur une version supportée ; audit des dépendances de production sans faille haute ou critique
- [ ] Projet de production créé, plan Pro, 2FA, récupération à un instant donné active
- [ ] Test d'isolation à deux écoles réussi sur la production
- [ ] Avis de l'expert-comptable obtenu sur les reçus et la caisse
- [ ] Avis du juriste obtenu ; contrat de sous-traitance prêt ; déclaration CMIL traitée selon son avis
- [ ] Procédure d'incident écrite ; contact support défini
- [ ] École pilote choisie, plan de retour arrière écrit

## PHASE H — Mise en production et premier client
1. Mesurer le réseau, choisir la région (C7).
2. Créer l'organisation et le projet de production ; plan Pro ; 2FA ; alerte de dépense.
3. Appliquer **les migrations versionnées** (jamais de copier-coller).
4. Créer l'école, puis son compte de synchronisation (mot de passe aléatoire fort).
5. Lancer les tests d'isolation et les contrôles de QA-038.
6. Renseigner le profil `production` du build (URL, clé anon, identifiant d'école). **Aucune modification de code.**
7. Programmer les exports `pg_dump` quotidiens hors de Supabase ; tester une restauration.
8. Installer chez l'école pilote ; former ; surveiller la première semaine ; confirmer les sauvegardes locales.

## PHASE I — Exploitation continue
| Rythme | Action | Qui |
|---|---|---|
| Quotidien | vérifier que la sauvegarde du jour existe | P |
| Hebdomadaire | alertes de plantage, synchros en erreur, lignes `blocked` | P |
| Mensuel | Dependabot/Renovate : traiter les mises à jour de sécurité | AG |
| Toutes les 8 semaines | nouvelle version majeure d'Electron : planifier la mise à jour avant la fin de support | AG |
| Trimestriel | **test de restauration** de la production ; revue des accès et des clés | P |
| Annuel | rotation des secrets ; revue de sécurité ; relecture du dossier de conformité | P, J |
| Avant la 10e école | test d'intrusion par un tiers indépendant | P |

---

## Annexe 1 — Requêtes SQL **en lecture seule** (à exécuter par vous dans l'éditeur SQL)
*Ce sont uniquement des `SELECT`. Copiez les résultats dans `docs/diagnostic_supabase_2026-10.md`.*

```sql
-- 1. Policies de la base publique
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;

-- 2. Tables SANS sécurité par ligne (RLS)
select c.relname as table_sans_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- 3. Triggers existants
select event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers where trigger_schema = 'public' order by 1, 2;

-- 4. Index et contraintes d'unicité
select tablename, indexname, indexdef
from pg_indexes where schemaname = 'public' and indexdef ilike '%unique%' order by 1, 2;

-- 5. Colonnes de toutes les tables
select table_name, column_name, data_type, is_nullable
from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position;

-- 6. Fonctions et mode d'exécution (security definer ?)
select p.proname, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';

-- 7. Buckets de stockage et leur visibilité
select id, name, public, file_size_limit from storage.buckets;

-- 8. Policies de stockage
select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage';

-- 9. Écoles et comptes de synchronisation (l'ecole_id doit figurer dans app_metadata)
select id, nom from public.ecoles;
select id, email, raw_app_meta_data from auth.users;
```
**À relever dans le tableau de bord (pas en SQL) :** réglage « Max rows » de l'API, région, plan, état (actif ou en pause).

## Annexe 2 — Questions à poser

**À l'expert-comptable (OECFM) :**
1. Une école doit-elle avoir **une seule série** de reçus continue, ou plusieurs séries (une par guichet) sont-elles admises ?
2. Comment annuler ou corriger un reçu émis ? (annulation numérotée, contrepassation, mention obligatoire)
3. Un numéro **sauté** (échec technique, bloc de numéros non utilisé) est-il admis s'il est documenté ?
4. Durée de conservation des reçus et du journal de caisse ; format accepté (papier, numérique).
5. Mentions obligatoires sur un reçu d'écolage ; traitement de la TVA éventuelle.
6. Les clôtures de caisse (Ticket Z) ont-elles une valeur probante ? Quelles conditions ?

**Au juriste :**
1. Qui doit déclarer à la CMIL : l'école (responsable du traitement) ou l'éditeur (sous-traitant) ? Quels formulaires, quels délais ?
2. L'hébergement des données dans une région hors de Madagascar est-il admis, et à quelles conditions (garanties, consentement, autorisation) ?
3. Un **délégué à la protection des données** résident est-il exigé aujourd'hui ?
4. Modèle de **contrat de sous-traitance** et mentions d'information pour les parents.
5. Régime du consentement et de l'information pour les données d'**élèves mineurs** et leurs photos.
6. Procédure de **notification d'une violation** de données.
7. Durées de conservation recommandées (élèves partis, paie, journaux).

## Annexe 3 — Quel fichier pour quoi
| Fichier | Rôle | Statut |
|---|---|---|
| `rapport_maitre_consolide_study_agent_v3.md` | référence complète (41 fiches, plan, décisions) | **à conserver** |
| `AGENT_PACK_LOT1.md` | exécution du Lot 1 par l'agent | **à conserver** |
| `ACTIONS_FUTURES_APRES_AUDIT.md` (ce fichier) | ce qui reste à faire, par qui | **à conserver** |
| `audit_technique_et_qa_complet.md` (ancien rapport d'Antigravity) | historique | archiver dans `docs/archive/` |
| `rapport_maitre_consolide_study_agent.md` (v2) | historique, contenu repris dans la v3 | archiver ou supprimer |
