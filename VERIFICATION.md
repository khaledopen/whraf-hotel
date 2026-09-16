# Vérification — 15 septembre 2026

## Ajout du 16 septembre : réponses e-mail et exports

24 tests réussis avec SMTP simulé et schéma PostgreSQL isolé. Couverture : recherche des messages, protection de l’accès, validation des réponses, double soumission simultanée, échec SMTP, relance, statut Répondu après acceptation, contenu HTML échappé et notes privées exclues. Exports testés : lecture du classeur Excel, coordonnées conservées comme texte, PDF avec plusieurs pages et contenu complet. Compilation de production réussie ; bibliothèques d’export chargées à la demande.

Contrôle dans une administration locale avec données fictives : rédaction et envoi simulé, historique visible et passage automatique à Répondu. Migration 007 appliquée à la base configurée. Aucun e-mail réel envoyé pendant les tests.

## Administration : filtres, calendrier et upload

Recherche serveur par nom, e-mail, téléphone ou numéro, filtre de statut et période de séjour. Le calendrier utilise les résultats de recherche et sélectionne les nuits occupées (arrivée incluse, départ exclu). Les filtres sont conservés pendant la consultation et l’enregistrement d’une demande. Tous les résultats correspondants sont recherchés, au-delà de l’ancienne limite des 1 000 demandes.

Upload JPEG, PNG et WebP (4 Mo maximum) directement dans l’éditeur de chambre et la photothèque, avec aperçu et sélection automatique pour la chambre. La photo est créée en brouillon : enregistrer la chambre puis vérifier et publier la photo dans Photographies. Aucun champ URL d’image à renseigner.

Les nouvelles images sont décodées, redimensionnées et converties en WebP, puis stockées dans PostgreSQL (migration 004_uploaded_images.sql, appliquée en local). Exécuter également npm run db:migrate avec la base cible avant une mise en production de cette version. Les anciens uploads sur disque restent lisibles sur leur serveur d’origine. Les nouveaux fichiers sont servis par /api/images/ et survivent au redémarrage des fonctions Vercel.

20 tests réussis, dont recherche et bornes de séjour, date invalide, tentative d’injection SQL, upload protégé, rejet d’un faux JPEG et lecture de la photo après recréation du serveur. Aucun e-mail réel envoyé par ces tests.

## Réservations et PostgreSQL

18 tests réussis lors de la vérification du parcours PostgreSQL : soumissions simultanées, idempotence, validation, transactions, sessions, confirmation, annulation, reprise des notifications après panne et absence de configuration SMTP. Les tests d’intégration utilisent un schéma temporaire isolé et un transport e-mail simulé.

Connexion et authentification SMTP vérifiées sans envoi de message réel. La réception effective en boîte mail reste à vérifier avec un destinataire de test autorisé. Les confirmations sont mises en file persistante ; le serveur backend doit rester actif pour les envoyer. SMTP ne garantit pas l’absence absolue de doublon après une interruption entre acceptation et enregistrement du résultat.

## Photographies

Des images de haute qualité encodées en WebP à 640, 1024 et 1536 pixels de large sont intégrées dans frontend/public/photos/wharf-*.webp. Les originaux JPG sont conservés.

Correspondances et sources : scripts/photo-sources.json. Association aux sections : frontend/src/photos.js. La transformation est limitée aux anciennes URL connues ; une nouvelle photographie ajoutée dans l’administration conserve son URL et ses métadonnées. Les photos ne sont pas remplacées dans PostgreSQL.

Le parking auparavant légendé comme plage est remplacé par l’espace sous les cocotiers ; la piscine légendée comme façade est remplacée par la vraie façade fournie. La chambre est prioritaire lorsque sa catégorie possède déjà une photo intérieure ; aucune association chambre/photo non vérifiée n’est inventée.

## Contrôle visuel

Validation des dates incohérentes dans le formulaire sans création de réservation réelle. Affichage mobile contrôlé à 390 pixels, et images adaptatives utilisées pour limiter les téléchargements. Aucun déploiement effectué.
