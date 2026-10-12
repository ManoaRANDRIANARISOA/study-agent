# Observations — Lot 1 (Study Agent v2.3.8)

Ce fichier consigne les constatations au fil de l'eau, les contradictions éventuelles, les éléments hors périmètre et les décisions prises pendant le chantier.

---

## 1. Contradictions avec le pack ou le rapport
*(Aucune contradiction pour le moment. Les numéros de ligne et la structure des fichiers correspondent aux attendus).*

---

## 2. Constats hors périmètre
- **Lint Prettier / CRLF** : 25 321 warnings `Delete ␍ prettier/prettier` dus aux fins de ligne Windows (CRLF). Non bloquant pour l'exécution applicative, à traiter lors d'une passe de formatage globale.
- **Seconde adresse CSP** : `https://onxnctfgxxgxipehmfqb.supabase.co` présente dans `src/renderer/index.html` (L9) depuis le commit initial `3310a10` ; confirmée comme résidu du template prototype Phase 2. Sera nettoyée en T4.
- **Scripts de test** : Absence de script `test` dans `package.json` (sera ajouté en T0 avec Vitest).

---

## 3. Questions pour le propriétaire
*(Toutes les questions préparatoires ont été répondues).*

---

## 4. Décisions prises
- **Conservation du diagnostic Supabase réel** : Le fichier `docs/diagnostic_supabase_2026-10.md` a été rempli directement par le propriétaire avec les résultats réels du projet Supabase `ProjectOne` (`uigqxexsfbjfxbnkrjfc`), fournissant les preuves directes pour RLS, absence de trigger `updated_at`, et contraintes uniques globales.
- **Action A4 (Sauvegarde Supabase)** : Déclarée dispensée en Phase A car le projet est un environnement de dev/démo avec 0 client réel.
- **Tag et branche** : Tag `pre-audit-2026-10-11` posé et branche `audit/lot1` initialisée.
