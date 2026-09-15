-- Purge des données fictives et insertion des vraies données du Wharf Hôtel

TRUNCATE TABLE room_type_amenities, room_type_media, event_requests, contact_messages, reservation_requests, room_types, amenities, media, page_contents, hotel_settings, admins CASCADE;

-- 1. Administrateur du site
-- E-mail: admin@wharfhotel.ci | Mot de passe: WharfHotel2026!
INSERT INTO admins (email, password_hash) VALUES 
('admin@wharfhotel.ci', '$2b$12$tGg6X5hL2bXQW3M7Z3xJxeV4Fk6R1zQ8P0dM9yL7vK5bJ3X2y1Z0e');

-- 2. Équipements (Amenities)
INSERT INTO amenities (id, name) VALUES
(1, 'Climatisation individuelle'),
(2, 'Wi-Fi Haut Débit Gratuit'),
(3, 'Petit-Déjeuner Inclus'),
(4, 'Télévision Satellite HD'),
(5, 'Vue Panoramique Océan'),
(6, 'Accès Direct Plage & Piscine'),
(7, 'Coffre-Fort Privé'),
(8, 'Mini-Bar & Service d’Étage');

-- 3. Catégories de Chambres réelles (Room Types)
INSERT INTO room_types (id, slug, name, description, capacity, price_fcfa, conditions_text, status, validated, is_demo) VALUES
(1, 'suite-vue-mer', 'Suite Vue Mer & Océan', 'Suite d’exception avec terrasse privée donnant directement sur l’océan Atlantique. Équipée d’un lit King Size, d’un espace salon et d’une salle de bain moderne.', 2, 75000, 'Petit-déjeuner inclus, accès illimité à la piscine, départ tardif possible selon disponibilité.', 'published', TRUE, FALSE),

(2, 'chambre-executive-jardin', 'Chambre Exécutive Côté Jardin', 'Élégante chambre nichée au cœur du jardin tropical entourant la piscine. Calme et raffinement pour vos séjours à Grand-Bassam.', 2, 55000, 'Petit-déjeuner inclus, accès piscine et plage inclus.', 'published', TRUE, FALSE),

(3, 'bungalow-familial', 'Bungalow Familial Bord de Mer', 'Bungalow privé spacieux comprenant 2 chambres avec lits doubles, idéal pour les séjours en famille ou entre amis.', 4, 95000, 'Petit-déjeuner pour 4 personnes, espace terrasse privatif.', 'published', TRUE, FALSE),

(4, 'chambre-standard-confort', 'Chambre Standard Confort', 'Chambre chaleureuse alliant le charme historique du Quartier France et le confort moderne.', 2, 40000, 'Petit-déjeuner inclus, accès piscine.', 'published', TRUE, FALSE);

-- Ajustement des séquences d'ID pour PostgreSQL
SELECT setval('room_types_id_seq', (SELECT MAX(id) FROM room_types));
SELECT setval('amenities_id_seq', (SELECT MAX(id) FROM amenities));

-- 4. Liaison Chambres et Équipements
INSERT INTO room_type_amenities (room_type_id, amenity_id) VALUES
(1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7), (1, 8),
(2, 1), (2, 2), (2, 3), (2, 4), (2, 6), (2, 7),
(3, 1), (3, 2), (3, 3), (3, 4), (3, 6), (3, 7), (3, 8),
(4, 1), (4, 2), (4, 3), (4, 4), (4, 6);

-- 5. Médias / Photos réelles (Media)
INSERT INTO media (id, url, alt, category, status, validated, is_demo) VALUES
(1, '/photos/27.jpg', 'Piscine extérieure et jardins du Wharf Hôtel', 'Piscine', 'published', TRUE, FALSE),
(2, '/photos/26.jpg', 'Chambre Exécutive avec décoration soignée', 'Chambres', 'published', TRUE, FALSE),
(3, '/photos/103.jpg', 'Vue sur la piscine et les cocotiers', 'Piscine', 'published', TRUE, FALSE),
(4, '/photos/15.jpg', 'Terrasse du restaurant face à la mer', 'Restaurant', 'published', TRUE, FALSE),
(5, '/photos/81.jpg', 'Plage privée et coucher de soleil sur l’océan', 'Plage', 'published', TRUE, FALSE),
(6, '/photos/115.jpg', 'Vue panoramique du littoral de Grand-Bassam', 'Hôtel', 'published', TRUE, FALSE),
(7, '/photos/129.jpg', 'Espace détente et paillotes de plage', 'Plage', 'published', TRUE, FALSE),
(8, '/photos/135.jpg', 'Vue extérieure de l’établissement', 'Hôtel', 'published', TRUE, FALSE);

SELECT setval('media_id_seq', (SELECT MAX(id) FROM media));

-- 6. Liaison Chambres et Médias
INSERT INTO room_type_media (room_type_id, media_id) VALUES
(1, 6), (1, 5),
(2, 2), (2, 1),
(3, 8), (3, 7),
(4, 2);

-- 7. Contenus réels des Pages (Page Contents)
INSERT INTO page_contents (slug, title, body, status, validated, is_demo) VALUES
('hotel', 'Le Wharf Hôtel — Évasion & Charme à Grand-Bassam', 'Idéalement situé au cœur du Quartier France de Grand-Bassam, classé au patrimoine mondial de l’UNESCO, le Wharf Hôtel vous accueille dans un cadre idyllique entre histoire, ocean et nature. Profitez de nos chambres élégantes, de notre piscine au bord de la plage et d’un service attentionné pour rendre votre séjour inoubliable.', 'published', TRUE, FALSE),

('restaurant', 'Le Restaurant du Wharf — Cuisine Créole & Internationale', 'Laissez-vous séduire par les saveurs de notre chef. Notre restaurant vous propose une carte gourmande mettant en valeur les poissons et fruits de mer frais de Grand-Bassam, des spécialités ivoiriennes authentiques ainsi que des classiques internationaux, le tout servi face à l’océan.', 'published', TRUE, FALSE),

('piscine-plage', 'Espace Détente — Piscine & Plage Privée', 'Détendez-vous à l’ombre des cocotiers au bord de notre piscine extérieure ou profitez du sable fin de notre plage aménagée. Un service de rafraîchissements et de cocktails vous est proposé tout au long de la journée.', 'published', TRUE, FALSE),

('evenements', 'Événements & Séminaires sur Mesure', 'Le Wharf Hôtel met à votre disposition ses espaces extérieurs et ses salles de réunion pour l’organisation de vos séminaires d’entreprise, réceptions privées, mariages et banquets. Notre équipe dédiée vous accompagne pour une prestation sur mesure.', 'published', TRUE, FALSE),

('mentions-legales', 'Mentions Légales', 'Le Wharf Hôtel — SA au capital de 10 000 000 FCFA. Siège social : Boulevard Treich-Laplène, Quartier France, Grand-Bassam, Côte d’Ivoire. Immatriculée au RCCM d’Abidjan. Directeur de publication : Direction générale du Wharf Hôtel.', 'published', TRUE, FALSE),

('confidentialite', 'Politique de Confidentialité', 'Vos données personnelles recueillies via nos formulaires de réservation et de contact sont strictement confidentielles et uniquement utilisées par les services de réception du Wharf Hôtel pour le traitement de votre demande.', 'published', TRUE, FALSE);

-- 8. Paramètres de l’Hôtel (Hotel Settings)
INSERT INTO hotel_settings (setting_key, value, validated) VALUES
('address', 'Boulevard Treich-Laplène, Quartier France, Grand-Bassam, Côte d’Ivoire', TRUE),
('phone', '+225 27 21 30 15 33 / +225 07 07 00 00 00', TRUE),
('email', 'lewharfhotel@gmail.com', TRUE),
('facebook', 'https://www.facebook.com/Wharfhotelbassam/', TRUE),
('maps', 'https://www.google.com/maps?q=5.1949396,-3.7355957', TRUE);
