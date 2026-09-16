# Messages et téléchargements

## Répondre à un client

1. Ouvrir Messages. Rechercher par nom, e-mail, sujet, contenu ou numéro et filtrer par statut.
2. Choisir « Lire et répondre ».
3. Rédiger dans « Votre réponse par e-mail », puis cliquer sur « Envoyer la réponse par e-mail ».
4. L’historique affiche la réponse enregistrée et son état d’envoi. Le statut devient « Répondu » après acceptation par le serveur SMTP.
5. En cas d’échec, consulter la cause et utiliser « Réessayer l’envoi ». Une réponse déjà envoyée ne peut pas être renvoyée avec ce bouton.

Les notes internes ne sont jamais incluses dans la réponse. Les réponses et tentatives sont conservées dans PostgreSQL. Un double clic ou une reprise après coupure utilise la même clé d’envoi pour éviter de créer deux réponses. SMTP ne garantit pas une livraison exactement une fois si le serveur accepte le message juste avant une interruption.

Le serveur local traite automatiquement les envois en attente. Sur Vercel, la réponse demandée est traitée avant la fin de la requête ; le bouton de relance permet de reprendre un échec. L’acceptation SMTP ne prouve pas la réception dans la boîte principale.

## PDF et Excel des réservations

Dans Réservations, appliquer les filtres ou sélectionner un jour dans le calendrier, puis choisir « Télécharger en PDF » ou « Télécharger en Excel ». Les exports contiennent exactement les résultats affichés, avec un rappel des filtres, les coordonnées, dates, voyageurs et statuts. Le PDF est paginé ; le fichier Excel est un vrai classeur .xlsx avec filtres de colonnes. Les notes internes ne sont pas exportées.

La migration 007_contact_replies.sql doit être appliquée via `npm run db:migrate` sur la base cible. Elle ajoute l’historique des réponses et préserve les messages existants.
