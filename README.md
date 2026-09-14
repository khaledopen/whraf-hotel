# Wharf Hôtel — Grand-Bassam

Site React/Vite en français, API Express/MySQL et administration privée. Réalisé à partir des trois maquettes et des photographies fournies. Aucun déploiement public effectué.

## Prérequis et architecture

- Node.js 24 LTS (environnement de développement : 24.11.0), npm 11.
- MySQL 8.0.16 minimum, idéalement MySQL 8.4 LTS, avec une base UTF-8 `utf8mb4`.
- `frontend/` : React 19, React Router 7, Vite 7, Tailwind CSS 4, Lucide React, JavaScript.
- `backend/` : Express 5, mysql2 3.24, bcrypt 6, sessions MySQL persistantes, Nodemailer 10, Zod 4, Multer 2 et Sharp 0.35.
- Les versions exactes installées sont figées dans `package-lock.json`. Utiliser `npm ci` pour les reproduire.

Compatibilité vérifiée dans les documentations officielles : [Vite 7 et Node.js](https://v7.vite.dev/guide/migration), [Express 5 et Node.js](https://expressjs.com/en/guide/migrating-5/).

Les pages publiques lisent `/api/content`. Les formulaires envoient réellement à `/api/reservations`, `/api/events` et `/api/contacts`. L’administration est à `/admin`. Aucune inscription publique, aucun paiement, aucun stock simulé.

Le magasin de sessions utilise directement le même pool mysql2 corrigé que l’API, avec expiration et nettoyage périodique des sessions en base.

## Installation

Depuis la racine :

```powershell
npm ci
Copy-Item backend/.env.example backend/.env
```

Créer une base et un utilisateur MySQL avec votre compte d’administration MySQL (remplacer le mot de passe d’exemple) :

```sql
CREATE DATABASE wharf_hotel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'wharf'@'localhost' IDENTIFIED BY 'CHOISIR_UN_MOT_DE_PASSE_FORT';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, REFERENCES, ALTER ON wharf_hotel.* TO 'wharf'@'localhost';
```

Renseigner `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` et `SESSION_SECRET` dans `backend/.env`. Générer un secret avec `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Ne jamais versionner ce fichier.

Alternative si Docker Desktop est installé : `compose.yaml` fournit MySQL 8.4 avec volume persistant et port local. Définir `DB_PASSWORD` et `MYSQL_ROOT_PASSWORD` dans l’environnement du terminal, puis lancer `docker compose up -d` et attendre l’état sain avant la migration. Le mot de passe `DB_PASSWORD` doit correspondre à celui de `backend/.env`.

```powershell
npm run db:migrate
npm run db:demo
```

La migration est relançable. Le script de démonstration séparé crée des brouillons, une catégorie fictive explicitement identifiée et des coordonnées non validées. Il refuse de s’exécuter en production. `DEMO_MODE=true` permet leur consultation uniquement en développement. Ne pas transformer une catégorie fictive en catégorie officielle sans confirmation de l’hôtel.

## Premier administrateur

Aucun identifiant ni mot de passe par défaut. Le mot de passe doit comporter au moins 14 caractères. Sous PowerShell, le saisir sans affichage, puis lancer la commande interactive :

```powershell
$adminSecurePassword = Read-Host 'Mot de passe administrateur' -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminSecurePassword).Password
npm run admin:create
Remove-Item Env:ADMIN_PASSWORD
```

La commande demande l’adresse e-mail, puis stocke uniquement le hachage bcrypt. Une adresse déjà utilisée est refusée.

## Développement

```powershell
npm run dev
```

Ouvrir http://127.0.0.1:5173. Vite transmet `/api` et `/uploads` à Express sur le port 3001. Utiliser la même origine configurée dans `PUBLIC_ORIGIN` pour les cookies. Sans API disponible, Vite affiche un aperçu local clairement signalé ; les formulaires ne simulent jamais un succès. Ce jeu de secours est absent du build de production.

## Administration

1. Créer les équipements et téléverser les photographies, puis renseigner leurs descriptions et catégories.
2. Créer les catégories de chambres, leurs capacités connues, tarifs entiers en FCFA et conditions. Associer photos et équipements avec les cases de sélection.
3. Compléter les textes (`hotel`, `restaurant`, `piscine-plage`, `evenements`, `mentions-legales`, `confidentialite`) et les coordonnées.
4. Après vérification effective par l’hôtel, cocher « Contenu vérifié », décocher « Démonstration » et choisir « Publié ». La validation des photos est indépendante de celle des chambres.
5. Consulter les demandes et enregistrer leur statut et leurs notes internes. « Confirmée par l’hôtel » constitue une action explicite, jamais déclenchée à la réception.

Les coordonnées non validées ne sont pas exposées en production. Les champs non renseignés et les catégories non publiées disposent d’états vides. Les textes sont rendus comme texte, sans HTML injecté. La suppression d’un contenu est définitive après confirmation ; les demandes conservent leur historique même si leur catégorie est supprimée.

## E-mails

Configurer les variables `SMTP_*` et `NOTIFICATION_EMAIL`. Le serveur enregistre d’abord la demande, puis notifie l’administration avec sa référence, sans inclure les données personnelles dans l’e-mail. Si SMTP échoue, la demande reste enregistrée et `notification_status=failed` apparaît dans l’administration. En l’absence de configuration, l’état est `unconfigured`. Aucune confirmation définitive de séjour n’est envoyée automatiquement.

## Production (préparation, sans publication)

```powershell
npm run build
```

Sur votre serveur final, définir `NODE_ENV=production`, `DEMO_MODE=false`, `PUBLIC_ORIGIN=https://VOTRE_DOMAINE` et les secrets, puis exécuter `npm start`. Express sert `frontend/dist` et l’API. Il écoute localement sur 3001 et attend un reverse proxy HTTPS de confiance (exactement un proxy pour `trust proxy=1`). Les cookies sont Secure, HttpOnly et SameSite=Lax. Conserver les téléchargements dans `backend/uploads` et sauvegarder ce dossier et MySQL. Les sessions sont stockées dans la table `sessions`, créée par la migration.

Le sitemap est servi sur `/sitemap.xml` à partir de `PUBLIC_ORIGIN`. Mettre l’URL du sitemap dans `frontend/public/robots.txt` une fois le domaine final connu. `/admin` est exclu de l’indexation et protégé côté API. Les métadonnées des pages publiques sont mises à jour côté React ; une pré-génération HTML serait nécessaire pour les robots qui n’exécutent pas JavaScript.

Les photos locales sont servies depuis `frontend/public/photos` ; toutes proviennent des fichiers fournis. Les nouvelles images sont décodées, limitées à 25 mégapixels et 5 Mo, réencodées en WebP, redimensionnées à 1800 px et renommées aléatoirement. Les polices sont chargées depuis Google Fonts avec polices de secours ; les auto-héberger si la politique de confidentialité l’exige.

## Contenus à confirmer avant publication

- Droit d’utilisation de chaque photographie et logo officiel.
- Adresse, localisation GPS, téléphone, e-mail et Facebook du cadrage initial.
- Catégories réelles, capacités, équipements, tarifs et conditions des chambres.
- Prestations et horaires du restaurant ; conditions d’accès piscine et plage.
- Espaces événementiels et capacités, sans promesses non validées.
- Identité juridique de l’exploitant et mentions légales.
- Politique de confidentialité complète, durée de conservation, destinataires et exercice des droits.

Aucun numéro WhatsApp, classement en étoiles, avis, histoire, menu, prix ou disponibilité n’a été inventé. Le tarif reste « sur demande » s’il n’est pas renseigné.

## Vérifications

```powershell
npm test
npm run build
```

Les tests HTTP emploient un double contrôlé de mysql2 : ils vérifient validation, enregistrement avant notification, maintien après échec SMTP, capacité, refus d’accès anonyme, sessions, CSRF, modification et interdiction de publier une démonstration. Ils ne remplacent pas une vérification d’intégration contre MySQL. Voir `VERIFICATION.md` pour les résultats effectivement obtenus et les limites de l’environnement.
