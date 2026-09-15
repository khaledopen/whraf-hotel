# Wharf Hôtel — PostgreSQL et réservations par e-mail

Le site utilise React/Vite et Express avec PostgreSQL (`pg`). Les réservations, sessions administrateur et e-mails en attente sont persistés dans la base. Les styles et contenus existants sont conservés.

## Lancer l’installation existante

Ne pas écraser `backend/.env`, ni importer les données de démonstration sur votre base réelle.

```powershell
npm ci
npm run db:migrate
npm run dev
```

- Site : http://127.0.0.1:5173
- Administration : http://127.0.0.1:5173/admin
- API : http://127.0.0.1:3001/api

La migration est transactionnelle et relançable. Elle ajoute `notification_jobs` et `form_submissions` sans remplacer les demandes, chambres ou comptes existants. Elle répare également le motif précis `maps$1q=` introduit dans un lien Google Maps par l’ancien adaptateur SQL. Ne pas lancer `backend/sql/real_data.sql` automatiquement : ce fichier est conservé tel que fourni.

## Configuration

Node.js 24, PostgreSQL et les versions exactes de `package-lock.json`. Pour une nouvelle installation seulement, copier `backend/.env.example` vers `backend/.env`, puis renseigner :

- `DB_HOST`, `DB_PORT` (5432), `DB_USER`, `DB_PASSWORD`, `DB_NAME`, ou `DATABASE_URL`.
- `DB_SSL=true` si votre hébergeur exige TLS ; un certificat valide reste obligatoire.
- `SESSION_SECRET` : au moins 32 caractères aléatoires.
- `PUBLIC_ORIGIN` : origine du site, identique à celle utilisée dans le navigateur.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `NOTIFICATION_EMAIL`.
- `NOTIFICATIONS_ENABLED=true` : active le traitement des e-mails. `false` est réservé aux essais sans envoi.

Le port 465 utilise généralement `SMTP_SECURE=true`, le port 587 `false` avec négociation STARTTLS. Aucun expéditeur ni destinataire n’est inventé si la configuration manque. `SMTP_PASS` reste accepté pour compatibilité ; préférer `SMTP_PASSWORD`.

Vérifier la connexion sans envoyer d’e-mail :

```powershell
npm run smtp:check -w backend
```

Le même diagnostic se trouve dans le tableau de bord administrateur. Il valide la connexion et l’authentification, pas la réception effective dans une boîte mail.

## Parcours de réservation

1. Le visiteur envoie le formulaire. La demande, sa clé anti-doublon et le travail de notification sont enregistrés dans **une même transaction PostgreSQL**.
2. Le site affiche le succès après cet enregistrement, sans attendre le SMTP. Ce succès ne confirme pas le séjour.
3. Un traitement du backend relève les e-mails toutes les cinq secondes. La notification de réception est adressée à l’hôtel.
4. Un administrateur choisit explicitement « Confirmée par l’hôtel » et enregistre. Cela met une confirmation client en attente pour les réservations et événements. Un message de contact ne reçoit jamais un faux récapitulatif de séjour.
5. L’administration distingue notification à l’hôtel et confirmation au client : attente, envoi, remise au serveur mail, échec, configuration manquante ou annulation.

Un délai réseau et une nouvelle tentative avec les mêmes données et la même clé ne créent pas une deuxième réservation. Les soumissions concurrentes de la même clé sont sérialisées. Modifier les informations après un délai d’attente correspond à une nouvelle demande ; en cas de doute, conserver les informations et réessayer.

## Échecs et reprises

- Un échec SMTP conserve la demande et un message d’erreur sans données personnelles.
- Jusqu’à cinq tentatives sont effectuées, avec attente progressive (1, 2, 4 puis 8 minutes).
- Après correction du SMTP, « Relancer cet e-mail » remet un envoi échoué ou non configuré en attente. Un envoi déjà remis au serveur ne peut pas être relancé par ce bouton.
- Une confirmation en attente est annulée si la demande cesse d’être confirmée avant son traitement. Un e-mail déjà transmis ne peut pas être rappelé.
- Les travaux interrompus par un arrêt du backend sont récupérés après expiration du verrou de deux minutes. Plusieurs workers ne traitent pas simultanément le même travail.
- Le suivi se rafraîchit toutes les cinq secondes lorsqu’un envoi est en cours, en conservant les notes en cours de saisie.

Les anciennes demandes n’ont pas été réexpédiées automatiquement : leur ancien champ `notification_status` mélangeait deux types d’e-mail et ne permet pas de déduire une livraison fiable. Elles sont signalées comme historiques sans suivi détaillé.

Le SMTP ne fournit pas de garantie absolue « une seule fois » : si le serveur accepte un message puis que le processus s’arrête avant l’enregistrement du succès, une reprise peut le remettre une seconde fois. Le `Message-ID` reste stable pour faciliter la déduplication côté messagerie. « Remis au serveur mail » ne signifie pas « lu » ni nécessairement « arrivé dans la boîte principale ».

## Nouvelle base et administrateur

Créer une base PostgreSQL UTF-8 et un rôle qui la possède, puis lancer `npm run db:migrate`. `compose.yaml` propose une alternative PostgreSQL 17 sur le port local 5432 avec volume persistant ; ne pas la lancer si votre instance occupe déjà ce port. Définir `DB_PASSWORD` dans le terminal avant `docker compose up -d`.

Pour créer le premier administrateur sans mot de passe par défaut :

```powershell
$adminSecurePassword = Read-Host 'Mot de passe administrateur' -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminSecurePassword).Password
npm run admin:create
Remove-Item Env:ADMIN_PASSWORD
```

La commande demande l’e-mail. Le mot de passe doit avoir au moins 14 caractères ; seul le hachage bcrypt est conservé. `npm run db:demo` est optionnel et strictement réservé à une base de développement.

## Validation

```powershell
npm test
$env:RUN_PG_TESTS = 'true'
node --env-file=backend/.env --test backend/test/api.test.js backend/test/postgres.integration.test.js
Remove-Item Env:RUN_PG_TESTS
npm run build
```

Les tests d’intégration créent un schéma `wharf_test_<identifiant aléatoire>` sur le serveur configuré, effectuent les essais et suppriment uniquement ce schéma. Le rôle doit avoir le droit de créer des schémas. Tous les envois y utilisent un transport simulé et des adresses `example.invalid` : aucun client ni réceptionniste ne reçoit de message. Les réservations de l’hôtel ne sont pas modifiées.

Voir `VERIFICATION.md` pour les résultats réellement obtenus.

## Production

`npm run build`, puis `npm start` avec `NODE_ENV=production`, `DEMO_MODE=false` et `PUBLIC_ORIGIN` configuré en HTTPS. Appliquer les migrations avant de démarrer. Express écoute localement sur 3001 derrière un reverse proxy HTTPS de confiance. Les sessions PostgreSQL utilisent des cookies HttpOnly, SameSite=Lax et Secure en production. Les routes administrateur sont protégées et leurs écritures exigent un jeton CSRF.

Sauvegarder PostgreSQL et `backend/uploads`. Les contenus non validés et les données de démonstration restent exclus du site public. Vérifier les coordonnées, catégories, capacités, prix, droits sur les images, informations juridiques et politique de confidentialité avant toute publication. Aucun déploiement n’a été effectué.

## Références techniques

- [Paramètres PostgreSQL natifs](https://node-postgres.com/features/queries) et [gestion des dates](https://node-postgres.com/features/types).
- [Verrouillage SKIP LOCKED pour les files de travaux](https://www.postgresql.org/docs/17/sql-select.html).
- [Transport SMTP et limites de verify()](https://nodemailer.com/smtp).
