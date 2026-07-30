# Plan d'Architecture SaaS et Marque Blanche (Study Agent)

Ce document résume la stratégie d'architecture logicielle et cloud pour le déploiement multi-tenant de Study Agent.

## 1. Stratégie Cloud (Supabase Partagé)

L'objectif est d'utiliser le projet Supabase existant (celui hébergeant déjà `candidat-web`) sans créer de conflit.

**Analyse de Sécurité :**
- `candidat-web` utilise la table `candidates`.
- `Study Agent` utilisera des tables distinctes (`students`, `personnel`, `ecoles`, etc.).
- Il n'y a donc aucun risque de chevauchement de données si les noms de tables diffèrent.

**Action (À faire par le client dans Supabase) :**
Exécuter la requête suivante dans l'éditeur SQL de Supabase pour confirmer qu'il n'y a pas de conflit de nom :
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

**Déploiement du Schéma :**
L'ancien script `setup_multi_tenant.sql` sera remplacé par un nouveau script `supabase_full_schema.sql`. Ce nouveau script se chargera de :
1. Créer de zéro les 18 tables métiers.
2. Intégrer nativement la colonne `ecole_id` sur toutes les tables.
3. Activer et configurer les politiques `Row Level Security` (RLS) pour garantir l'étanchéité totale entre les établissements.

## 2. Génération de Build Dynamique (Marque Blanche)

Le SuperAdmin doit pouvoir générer un fichier exécutable (`.exe`) personnalisé pour chaque établissement.

**Implémentation requise :**

1. **Frontend (SuperAdminBuilder.tsx) :**
   - Ajout d'un champ texte pour le "Nom de l'application".
   - Ajout d'un champ d'upload de fichier `.png` pour le "Logo officiel".
   - Conversion de l'image en Base64 avant l'envoi via IPC.

2. **Backend (builder.handler.ts) :**
   - Réception du flux Base64 et écriture dans `resources/icon.png` (utilisé par le compilateur).
   - Copie vers `resources/logo.png` (pour utilisation dans l'interface React).
   - Injection dynamique de la variable `VITE_APP_NAME` dans le fichier `.env`.
   - Lancement du build (`npm run build:win`) en passant cette variable dans l'environnement du processus (`spawn`).

3. **Configuration Electron (electron-builder.yml) :**
   - Modification des clés `productName` et `executableName` pour utiliser l'interpolation : `${env.VITE_APP_NAME}`.

4. **Interface Utilisateur (React) :**
   - Remplacement des mentions textuelles "Study Agent" par la lecture de `import.meta.env.VITE_APP_NAME`.

## Résumé des objectifs atteints
Cette architecture garantit :
- Zéro surcoût d'infrastructure (réutilisation du Supabase actuel).
- Zéro risque de corruption des données de `candidat-web`.
- Une isolation parfaite des données des clients (écoles) via RLS.
- Une expérience client premium avec un `.exe` à leur propre nom et logo.
