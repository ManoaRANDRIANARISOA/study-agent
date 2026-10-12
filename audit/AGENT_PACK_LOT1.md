# PACK AGENT — LOT 1 (Study Agent v2.3.8)

**À qui s'adresse ce fichier :** à l'agent qui implémente. **Tu travailles uniquement à partir de ce pack.** Le rapport `rapport_maitre_consolide_study_agent_v3.md` explique le « pourquoi » (fiches `QA-xxx`) ; ce pack dit « quoi faire, dans quel ordre, comment prouver que c'est fini ».

---

## 0. Règles non négociables
1. **Production interdite.** Tu ne te connectes jamais à un projet Supabase de production et tu n'exécutes aucun script SQL sur Supabase. Seul le propriétaire le fait. Tu travailles sur le dépôt local, avec SQLite en mémoire pour les tests.
2. **Une tâche = une branche = un commit** (`T3 QA-015: verrou d'instance unique`). Ne commence pas la tâche suivante avant que la précédente soit terminée et validée.
3. **Test d'abord.** Écris le test, constate qu'il échoue (rouge), corrige, constate qu'il passe (vert).
4. **Après chaque tâche :** `npm run typecheck` et `npm run lint` passent, `npm test` passe.
5. **Hors périmètre = tu notes, tu ne touches pas.** Tout ce que tu remarques d'autre va dans `OBSERVATIONS.md` (fichier, ligne, ce que tu vois).
6. **Si ce pack contredit le code réel** (ligne qui a bougé, fonction absente, comportement différent) : **arrête**, écris la contradiction dans `OBSERVATIONS.md` et demande au propriétaire. Ne devine pas.
7. **Jamais de secret** dans un fichier, un log, un test, un commit ou un message.
8. **Aucune nouvelle dépendance** sauf `vitest` (T0) et celles que la tâche cite. `zod` est déjà dans `package.json`.
9. **Ne modifie pas** les fichiers de migration SQLite existants (`src/main/database/migrations/*.sql`). Une évolution de schéma = nouvelle migration (hors Lot 1).
10. **Ne lance pas** `npm audit fix --force`, ne renomme pas de fichiers, ne reformate pas des fichiers entiers.
11. Les numéros de ligne ci-dessous valent pour la v2.3.8 fournie. S'ils ont bougé, retrouve la fonction par son nom.

## 1. Carte du code (à connaître)
- Process principal : `src/main/index.ts`. Base : `src/main/database/db.ts` (SQLite `better-sqlite3`, migrations au démarrage).
- Synchronisation : `src/main/services/sync.service.ts` (2 839 lignes : file d'envoi `sync_queue`, `pushLocalChanges`, `pullRemoteChanges`, `syncWithCloud`).
- Handlers IPC : `src/main/ipc/*.handler.ts`. Droits : `src/main/auth/rbac.service.ts` (`canRead(resource)`, `canWrite(resource)`, `getCurrentUser()`). Audit : `src/main/auth/audit.service.ts`.
- Pont : `src/preload/index.ts`. Interface : `src/renderer/src`. Config de build : `electron-builder.yml`, `electron.vite.config.ts`.

## 2. Définition de « terminé » (commune à toutes les tâches)
Test automatisé écrit et vert · `typecheck` et `lint` verts · critère de validation de la tâche prouvé (commande donnée) · `OBSERVATIONS.md` mis à jour · rapport de fin de tâche (gabarit en section 5) · rien d'autre n'a changé (`git diff --stat` vérifié).

---

## 3. Tâches (dans cet ordre)

### T0 — Outillage de test
**Pourquoi :** sans test, aucune correction n'est prouvable.
1. `npm i -D vitest`. Ajouter le script `"test": "vitest run"`.
2. Créer `vitest.config.ts` (environnement `node`, fichiers `tests/**/*.test.ts`).
3. Créer `tests/helpers/memdb.ts` : ouvre `new Database(':memory:')` et exécute les migrations `src/main/database/migrations/*.sql` dans l'ordre de la liste de `db.ts` (lignes 107-150). **N'importe pas `db.ts`** (il ouvre la vraie base à l'import).
4. **Piège connu :** `postinstall` recompile `better-sqlite3` pour Electron ; sous Node simple il peut échouer (« NODE_MODULE_VERSION »). Solution à essayer en premier : lancer vitest avec le Node d'Electron (`ELECTRON_RUN_AS_NODE=1` et le binaire `electron`). Si ça échoue, `npm rebuild better-sqlite3` pour les tests. Documente la solution retenue dans `README.md` (3 lignes).
5. Écrire `tests/smoke.test.ts` : base en mémoire, `INSERT` puis `SELECT` sur `students`.
**Validation :** `npm test` affiche 1 test vert.
**Ne pas faire :** modifier `db.ts`.

### T1 — SQL à guillemets doubles (QA-028)
**Pourquoi :** `better-sqlite3` refuse `"synced"` (erreur « no such column ») : les routines d'auto-réparation plantent.
**Fichiers :** `sync.service.ts` lignes 598, 603, 607, 796, 1147, 1151, 1155, 1159, 1192, 1216, 1219, 2082, 2302 ; `student.repository.ts` ligne 1591.
1. Test d'abord, `tests/sql-literals.test.ts` : lit tous les `.ts` de `src/main`, retire les commentaires, et échoue si une chaîne SQL contient un motif `(sync_status|status|deleted|action|table_name)\s*(=|!=|<>)\s*"[A-Za-z0-9_]+"` ou `IN\s*\(\s*"`. Il doit lister les occurrences (rouge).
2. Corrige chaque occurrence : `"synced"` devient `'synced'`, `"subjects"` devient `'subjects'`. **Dans une template string SQL uniquement.**
3. Test complémentaire : pour 3 des requêtes corrigées, exécute-les avec `db.prepare(...)` sur la base mémoire (elles doivent se préparer sans erreur).
**Validation :** `npx vitest run tests/sql-literals.test.ts` vert.
**Ne pas faire :** changer la logique des routines (elles seront revues plus tard).

### T2 — Verrou de synchronisation atomique (QA-025)
**Pourquoi :** le test du verrou précède un `await` (lignes 1305-1323) : deux synchros peuvent tourner ; un autre appel remet le verrou à `false` (lignes 1348, 1389, 1460).
1. Créer `src/main/services/sync-lock.ts` avec une fonction pure `runExclusive(fn)` : si une exécution est en cours, renvoie `{ ran: false, reason: 'already_syncing' }` **sans** attendre ; sinon pose le verrou **avant tout `await`**, exécute `fn`, libère le verrou dans un `finally` **dans l'appel propriétaire seulement**.
2. Test d'abord, `tests/sync-lock.test.ts` : 10 appels simultanés d'une `fn` lente = **1** exécution et 9 refus ; le verrou est libre après la fin ; une `fn` qui lève une erreur libère aussi le verrou.
3. Dans `syncWithCloud`, remplacer la variable `isSyncing` et ses remises à `false` par `runExclusive(...)`. Déplacer l'appel `executeRemoteCommandsIfAny()` **à l'intérieur** de la section protégée.
**Validation :** `npx vitest run tests/sync-lock.test.ts` vert ; plus aucune écriture `isSyncing = false` dans `sync.service.ts`.
**Ne pas faire :** modifier l'ordre push/pull.

### T3 — Instance unique (QA-015)
**Pourquoi :** deux processus peuvent ouvrir le même fichier SQLite.
1. Dans `index.ts`, appeler `app.requestSingleInstanceLock()`. Si le verrou n'est pas obtenu : quitter immédiatement (`app.quit()`).
2. **Piège :** `db.ts` ouvre la base et lance les migrations **à l'import**. La vérification du verrou doit donc s'exécuter **avant** l'import de `db.ts` (par exemple dans un petit module `single-instance.ts` importé en premier dans `index.ts`, qui appelle `app.exit(0)` si le verrou est refusé). Vérifie-le : la seconde instance ne doit ni migrer ni ouvrir la base.
3. Écouter `second-instance` : restaurer et focaliser la fenêtre existante.
**Validation (manuelle, à décrire dans le rapport) :** lancer l'application deux fois : la seconde se ferme en moins de 2 secondes et la première prend le focus ; aucun message de migration dans la console de la seconde.
**Ne pas faire :** toucher à la logique de synchro.

### T4 — Durcissement Electron (QA-010)
**Fichiers :** `index.ts` lignes 50-54 (`sandbox: false`), 62-65 (`setWindowOpenHandler`), 125-162 (`local-resource`) ; `src/renderer/index.html` ligne 9 (CSP) ; `src/renderer/src/lib/image-utils.ts` (génère les URL `local-resource://`).
1. **`local-resource`** : créer une fonction pure `isPathAllowed(allowedDirs, requestedPath)` (dans un fichier dédié) qui : normalise, résout avec `fs.realpathSync` (suit les liens), compare au préfixe d'un dossier autorisé (en tenant compte de la casse Windows et du séparateur final), refuse tout le reste. **Dossiers autorisés :** ceux où l'application enregistre réellement les images (cherche où les photos et logos sont écrits : `app.getPath('userData')` et ses sous-dossiers). Le handler renvoie 403 si le chemin n'est pas autorisé.
2. Tests d'abord, `tests/path-allow.test.ts` : accepte un fichier sous le dossier autorisé ; refuse `..\\..\\Windows\\win.ini`, `C:\\Windows\\win.ini`, un chemin avec `..` encodé, un lien symbolique sortant (si le système de test le permet), un préfixe trompeur (`...\\userData-evil\\x.png`).
3. **`openExternal`** : n'autoriser que les URL `https:` (parser avec `new URL`). Sinon, ignorer.
4. **Navigation :** ajouter un gestionnaire `will-navigate` qui refuse toute navigation hors de la page de l'application.
5. **`sandbox: true`** : l'activer, puis **vérifier que l'application démarre** et que le pont (`window.api`) fonctionne (le préchargement utilise `@electron-toolkit/preload`). Si le préchargement échoue en mode sandbox, **arrête** et note-le dans `OBSERVATIONS.md`.
6. **CSP :** retirer `'unsafe-inline'` de `script-src` **uniquement**. Garder `style-src` tel quel. Vérifier que l'application s'affiche.
7. **Hôtes Supabase de la CSP :** la ligne 9 autorise **deux** adresses Supabase. **Ne supprime pas** la seconde : note-la dans `OBSERVATIONS.md` et demande au propriétaire à quoi elle sert.
**Validation :** `npx vitest run tests/path-allow.test.ts` vert ; démarrage manuel réussi ; une requête `local-resource:///C:/Windows/win.ini` renvoie 403 (à vérifier avec les outils de développement).
**Ne pas faire :** réécrire le protocole entier ; modifier les URL générées par `image-utils.ts` sans nécessité.

### T5 — Supprimer la remise à zéro destructrice (QA-004)
1. Supprimer `wipeRemoteData` (`sync.service.ts` lignes 1465-1523) et son import dans `student.repository.ts` (ligne 2).
2. Dans `student.repository.ts`, supprimer le paramètre `includeRemote` de `resetDatabase` (ligne 999) et l'appel de la ligne 1002.
3. Supprimer le canal `db:reset` : handler (`student.handler.ts` ~lignes 199-205), préchargement (`preload/index.ts` ligne 51), type (`renderer/src/env.d.ts` ligne 214), et l'option « effacer aussi le cloud » de `renderer/src/pages/Settings.tsx` (ligne ~195). **Si** une remise à zéro locale est utile en développement : la conserver **uniquement** si `!app.isPackaged`.
**Test d'abord :** `tests/no-wipe.test.ts` qui échoue tant que le texte `wipeRemoteData` apparaît dans `src/`.
**Validation :** test vert ; `typecheck` vert ; l'écran Paramètres s'affiche.
**Ne pas faire :** ajouter une autre fonction de suppression distante.

### T6 — Filtre de tenant au pull (QA-002)
**Pourquoi :** les lectures cloud n'ont pas de filtre `ecole_id`.
**Lieux :** `sync.service.ts` lignes 2438-2443 (pull générique), 1201-1204, 2294-2298 (matières), 2641-2646 (`users`), 2708-2711 (`settings`).
1. Extraire une fonction pure `buildPullQuery(client, table, tenantId, lastSync)` qui applique `.eq('ecole_id', tenantId)` ; l'utiliser aux lieux ci-dessus.
2. Après réception, **rejeter** toute ligne dont `ecole_id` ≠ tenant actif : ne pas l'insérer, l'ajouter à un compteur `rejectedForeignTenant`, afficher un avertissement visible dans le journal.
3. Tests d'abord, `tests/pull-tenant.test.ts` avec un faux client (qui enregistre les appels) : la requête contient le filtre ; une ligne d'un autre tenant est rejetée ; une ligne du bon tenant passe.
**Validation :** test vert ; recherche dans `sync.service.ts` : aucune lecture `from(...).select(` sans filtre de tenant, hors exceptions listées dans `OBSERVATIONS.md`.
**Ne pas faire :** corriger les unicités ni la logique d'alignement par nom (c'est un autre lot).

### T7 — Audit métier toujours actif (QA-016)
**Pourquoi :** `audit.service.ts:53-68` n'active l'audit que pour l'offre « sérénité » ; la migration 004 met « sécurité » par défaut : aucune action métier n'est journalisée.
1. Modifier `isAuditEnabled()` pour qu'elle renvoie toujours `true` (la restriction commerciale ne doit pas toucher la collecte). Conserver une éventuelle restriction d'**affichage** dans l'interface, si elle existe.
2. Test d'abord, `tests/audit.test.ts` : avec `rbac_offer_level = "securite"`, un appel `logAction(user, 'payment_create', 'student_payments', id, null, '{}')` ajoute une ligne dans `audit_logs`. (Aide : moquer `../database/db` pour fournir la base en mémoire.)
**Validation :** test vert.
**Ne pas faire :** changer le contenu des journaux ou leur durée de conservation.

### T8 — Enveloppe IPC à refus par défaut (QA-011, QA-030)
**Pourquoi :** des canaux sensibles n'ont aucun contrôle de rôle (`sync.handler.ts` : 18 canaux ; `tenant`, `log`, `assessment`, `updater`, `student:repairSync`) ; `superadmin` et `builder` ne doivent pas être dans l'application cliente.
1. Lire `rbac.service.ts` (type `Resource` lignes ~42-76, fonctions `canRead`, `canWrite`, `getCurrentUser`). Créer `src/main/ipc/secure-handle.ts` : `secureHandle(canal, { resource, level: 'read' | 'write' }, schemaZod?, fn)` qui : refuse si aucun utilisateur n'est connecté, refuse si `canRead/canWrite` est faux, valide les arguments avec `zod` si un schéma est fourni, puis appelle `fn`. Erreur renvoyée = objet `{ success: false, error: 'access_denied' }` (cohérent avec les autres handlers).
2. Appliquer l'enveloppe à : tous les canaux de `sync.handler.ts` (ressource à choisir avec le propriétaire si aucune ne convient : consigne-le), `tenant.handler.ts` (sauf `tenant:setup` au premier lancement, voir exception), `log.handler.ts`, `assessment.handler.ts`, `updater.handler.ts`, `student:repairSync`.
3. **`superadmin` et `builder` :** ne les enregistrer **que** si `!app.isPackaged` (dans `index.ts`, lignes ~28-31 et leur appel). En production ils n'existent pas.
4. Test d'abord, `tests/ipc-wrapped.test.ts` : parcourt les fichiers `src/main/ipc/*.ts` et échoue si un appel direct `ipcMain.handle(` existe en dehors de `secure-handle.ts`, **sauf** une liste blanche explicite (`auth:login`, `auth:logout`, `auth:getCurrentUser`, `tenant:setup`, `tenant:check`). Le test affiche les canaux fautifs.
5. Migrer d'abord les canaux listés à l'étape 2 ; le test doit donc afficher le reste comme « à migrer » (liste dans `OBSERVATIONS.md`) sans échouer : prévoir un mode `allowlist` temporaire. Le Lot 2 finira la migration.
**Validation :** test vert ; un appel `window.api.sync...` sans session renvoie `access_denied` (à vérifier manuellement).
**Ne pas faire :** réécrire la logique métier des handlers.

### T9 — Retirer la clé d'administration du client (QA-001)
**Pourquoi :** `electron-builder.yml` ligne 17 copie `.env` (avec la clé `service_role`) dans l'installateur ; le code préfère cette clé (`sync.service.ts` lignes 26, 32, 50).
**Préalable :** T8 terminée (superadmin et builder absents du paquet).
1. **Configuration à la compilation, pas à l'exécution :** `sync.service.ts` lignes 12-14 charge `.env` depuis `process.resourcesPath`. Remplacer par des valeurs injectées au **build** (électron-vite expose les variables préfixées `MAIN_VITE_` au process principal : vérifie la documentation de la version installée). Variables autorisées : l'URL Supabase, la clé **anon** (publique par conception), l'identifiant d'école. **Interdit :** toute clé `service_role`.
2. Supprimer le bloc `extraResources` qui copie `.env` dans `electron-builder.yml`.
3. Supprimer le repli sur `SUPABASE_SERVICE_ROLE_KEY` (lignes 26, 32, 50) et la fonction `getSupabaseAdmin`. Si la clé anon manque : **échec explicite** avec message clair (pas de repli).
4. Remplacer les usages de `getSupabaseAdmin()` par le client normal (qui utilise le JWT du compte de sync, soumis à la RLS) : `sync.service.ts:1984` (synchro de `users`), `tenant.handler.ts:41` (lecture de `ecoles` : la policy `allow_read_own_ecole` existe), `auth.handler.ts:129 et 207` (lis ce qu'ils font ; si une opération exige un droit d'administration, **arrête** et demande : ne remets pas la clé).
5. Écrire `scripts/scan-installer.mjs` : parcourt un dossier (par défaut le dossier de sortie `dist/win-unpacked`), cherche tout JWT (`eyJ…\.….\.…`), le décode et **échoue si `role` vaut `service_role`** ; échoue aussi si un fichier `.env` est présent. Ajouter `"scan:installer": "node scripts/scan-installer.mjs"`.
6. Test d'abord, `tests/no-service-role.test.ts` : échoue si `service_role`, `SERVICE_ROLE` ou `getSupabaseAdmin` apparaît dans `src/` ou `electron-builder.yml` (hors commentaires de ce test).
**Validation :** test vert ; `npm run build:unpack` puis `npm run scan:installer` sans alerte ; la synchronisation fonctionne **sur la préparation (staging)** avec le compte de sync (le propriétaire fournit l'accès).
**Ne pas faire :** supprimer `scripts/provision-tenant.mjs` (le propriétaire l'utilise sur sa machine) ; mettre une clé dans un nouveau fichier.

### T10 — Signature de code (QA-017) — **avec le propriétaire**
**Part de l'agent :** préparer la configuration `electron-builder` pour lire le certificat par variables d'environnement (jamais dans le dépôt), documenter la procédure dans `docs/SIGNATURE.md`, ajouter une vérification (`Get-AuthenticodeSignature`) dans la documentation de publication.
**Part du propriétaire :** obtenir et fournir le certificat. **Ne pas activer** tant que le certificat n'existe pas ; ne rien inventer.
**Validation :** configuration sans secret ; `docs/SIGNATURE.md` complet.

### T11 — Electron supporté et dépendances (QA-039)
1. Branche dédiée. Consulter le calendrier officiel des versions d'Electron et choisir la **version majeure supportée la plus récente** (pas de version « de mémoire »).
2. Mettre à jour `electron`, lancer `npm run postinstall` (reconstruction de `better-sqlite3`), puis `npm run typecheck`, `npm run lint`, `npm test`, démarrage manuel.
3. `npm audit --omit=dev` : corriger ce qui est exploitable en production sans `--force` ; lister dans `OBSERVATIONS.md` ce qui est limité à l'outillage de build.
4. Parcours de fumée complet (section 4) à la main.
**Validation :** `npm audit --omit=dev --audit-level=high` sans résultat (ou exceptions documentées) ; parcours de fumée réussi.
**Ne pas faire :** `npm audit fix --force`.

---

## 4. Parcours de fumée (à rejouer après T3, T4, T9 et T11)
1. Lancer l'application ; se connecter avec un compte de test.
2. Créer un élève (avec photo).
3. Enregistrer un paiement ; imprimer le reçu.
4. Voir la ligne correspondante dans le journal de caisse.
5. Lancer une synchronisation ; vérifier qu'elle se termine sans erreur (sur la préparation).
6. Fermer et rouvrir : les données sont présentes.
7. Lancer deux fois l'application : la seconde se ferme (T3).

## 5. Gabarit de rapport de fin de tâche
```
Tâche : Tn — titre (QA-xxx)
Fichiers modifiés : (liste)
Test écrit : (chemin) — rouge avant, vert après : oui/non
Commande de validation et résultat : (copier la sortie utile)
Typecheck / lint / tests : OK / KO
Écarts avec le pack : (aucun / détails)
Observations ajoutées : (oui/non)
```

## 6. Actions du propriétaire (hors agent)
1. **Ne pas exécuter** le script de trigger `handle_updated_at()` proposé précédemment : il est dangereux appliqué seul (rapport, R20).
2. Créer un projet Supabase de **préparation** (le plan gratuit suffit) pour les essais de synchro ; ne jamais tester sur le projet existant.
3. Après validation de T9 sur la machine de développement : **régénérer la clé `service_role`** et **changer le mot de passe du compte de sync** (valeur aléatoire forte) ; mettre à jour le `.env` local.
4. Dire à quoi sert la **seconde adresse Supabase** présente dans la CSP (`index.html` ligne 9).
5. Fournir le certificat de signature (T10).
6. Prendre un export `pg_dump` du projet existant avant toute migration.
7. Faire valider avec un juriste local et un expert-comptable les points de la section 13.3 du rapport.

## 7. Après le Lot 1
Les lots suivants (intégrité financière, isolation, cœur de synchronisation, bas débit) sont décrits dans la section 10 du rapport. **Aucune école réelle n'est onboardée tant que la porte GO/NO-GO de la section 10 n'est pas franchie.**
