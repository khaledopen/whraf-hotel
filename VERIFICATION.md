# Vérification — 15 septembre 2026

## Réservations et PostgreSQL

18 tests réussis lors de la vérification du parcours PostgreSQL : soumissions simultanées, idempotence, validation, transactions, sessions, confirmation, annulation, reprise des notifications après panne et absence de configuration SMTP. Les tests d’intégration utilisent un schéma temporaire isolé et un transport e-mail simulé.

Connexion et authentification SMTP vérifiées sans envoi de message réel. La réception effective en boîte mail reste à vérifier avec un destinataire de test autorisé. Les confirmations sont mises en file persistante ; le serveur backend doit rester actif pour les envoyer. SMTP ne garantit pas l’absence absolue de doublon après une interruption entre acceptation et enregistrement du résultat.

## Photographies

Huit images retouchées avec l’outil intégré image_gen, puis encodées en WebP à 640, 1024 et 1536 pixels de large. Les 24 fichiers sont dans frontend/public/photos/wharf-*.webp. Les originaux JPG sont conservés.

Correspondances et sources : scripts/photo-sources.json. Association aux sections : frontend/src/photos.js. La transformation est limitée aux anciennes URL connues ; une nouvelle photographie ajoutée dans l’administration conserve son URL et ses métadonnées. Les photos ne sont pas remplacées dans PostgreSQL.

Prompts employés : restauration photographique fidèle de chaque photo fournie, réduction du flou et des artefacts, amélioration des textures et de l’exposition, couleurs naturelles, maintien du point de vue, des bâtiments et du mobilier, sans nouvel équipement ni texte. Pour la plage au coucher du soleil : légère chaleur colorimétrique et conservation du rivage. Sortie demandée : paysage haute résolution 1536 × 1024.

Les détails reconstruits par IA ne remplacent pas des originaux haute résolution. La galerie indique la retouche. Le parking auparavant légendé comme plage est remplacé par l’espace sous les cocotiers ; la piscine légendée comme façade est remplacée par la vraie façade fournie. La chambre est prioritaire lorsque sa catégorie possède déjà une photo intérieure ; aucune association chambre/photo non vérifiée n’est inventée.

## Contrôle visuel

Validation des dates incohérentes dans le formulaire sans création de réservation réelle. Affichage mobile contrôlé à 390 pixels, et images adaptatives utilisées pour limiter les téléchargements. Aucun déploiement effectué.
