# Traitement des messages de contact

1. Un message reçu depuis Contact apparaît comme **Nouveau**.
2. Ouvrir le message et choisir **En cours** pendant son traitement.
3. **Répondre avec ma messagerie** ouvre l’application de messagerie avec le destinataire et le sujet. Rédiger et envoyer la réponse dans cette application.
4. Revenir dans l’administration, choisir **Répondu**, puis enregistrer.
5. Choisir **Archivé** pour conserver un message traité. Il reste consultable et peut être remis en cours.

Les notes internes restent privées. Le changement de statut ne produit aucun e-mail au visiteur. Le suivi des e-mails concerne la notification adressée à l’hôtel, et non la réponse rédigée dans votre messagerie.

La migration 006 adapte les anciens statuts sans supprimer de message : « confirmed » devient « processing » (aucune réponse n’était garantie), « declined » et « cancelled » deviennent « archived ». Les statuts des réservations et événements restent inchangés.

Exécuter `npm run db:migrate` sur la base de destination avant d’utiliser cette version. Migration appliquée à la base configurée lors de cette intervention.
