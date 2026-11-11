# SportMotion — Game Design (source de vérité)

### 2.1 Pitch

SportMotion est un jeu mobile où **bouger fait grandir sa ville**. Chaque pas, séance de renfo ou stretching rapporte des ressources qui servent à construire, aménager et agrandir son territoire : d'un petit village de campagne jusqu'à une métropole reliée par trains, bateaux et avions. Objectif : lutter contre la sédentarité en donnant un but quotidien (comme les applis où l'on nourrit un animal en buvant de l'eau). Pas d'interactions sociales façon Sims : seulement la **création**.

### 2.2 Boucle de jeu

1. Le joueur bouge (pas, sport, stretching) → activités détectées (simulées dans le MVP) ou saisies.
2. Les activités valident des **quêtes du jour** et rapportent des **Pulses** (monnaie), des **matériaux** et de l'**XP**.
3. Il dépense Pulses + matériaux pour construire et aménager.
4. L'XP fait monter de niveau → débloque de nouveaux éléments et, à terme, une nouvelle ère.
5. Les jours consécutifs complets font monter la **série**, qui multiplie les gains.

### 2.3 Les trois ressources

- **Pulses** (monnaie, icône cœur qui bat) : s'achètent avec rien d'autre que du mouvement. Se dépensent.
- **XP** : cumul de l'effort, **ne se dépense jamais**. Sert uniquement aux niveaux.
- **Matériaux** : liés au type d'activité, pour pousser à varier :

| Matériau | Gagné par | Taux |
|---|---|---|
| Bois | marche, course | 1 bois / 1 000 pas |
| Pierre | renforcement musculaire | 1 pierre / 5 min |
| Eau | stretching, yoga, mobilité | 1 eau / 3 min |
| Énergie | cardio (course, vélo, natation, sport collectif) | 1 énergie / 5 min |

Matériaux avancés (fabriqués dans des bâtiments, débloqués plus tard) :
- **Brique** = 2 pierre + 1 eau (Briqueterie, ère Bourg)
- **Verre** = 2 eau + 1 énergie (Verrerie, ère Ville)
- **Acier** = 2 pierre + 2 énergie (Fonderie, ère Ville)

### 2.4 Quêtes du jour (réinitialisées à minuit, heure locale)

| Quête | Objectif | Récompense |
|---|---|---|
| Marcher | 5 000 pas | 50 Pulses |
| Bouger | 30 min d'activité sportive | 50 Pulses |
| S'étirer | 15 min de stretching | 40 Pulses |
| Bonus « journée complète » | les 3 quêtes faites | +60 Pulses + 1 coffre du jour (matériaux aléatoires) |

Gains « hors quêtes » (au-delà des objectifs) :
- 1 Pulse / 250 pas supplémentaires
- 1 Pulse / minute de sport supplémentaire
- 1 Pulse / minute de stretching supplémentaire (max 15 min comptées en plus)

XP : 1 XP par Pulse de base gagné (avant multiplicateur).

### 2.5 Séries et multiplicateurs

Une **série** = nombre de jours consécutifs avec la journée complète.

| Série | Multiplicateur sur les Pulses |
|---|---|
| 0–2 jours | ×1 |
| 3–6 jours | ×1,5 |
| 7–13 jours | ×2 |
| 14–29 jours | ×2,5 |
| 30 jours et + | ×3 |

- Le multiplicateur s'applique aux Pulses, **pas** aux matériaux ni à l'XP.
- **Jour de repos** : le joueur gagne 1 « joker repos » par semaine de série (max 2 en stock). Un jour manqué consomme un joker au lieu de casser la série. Le repos fait partie du sport : le jeu ne doit jamais culpabiliser.
- Série cassée : le multiplicateur retombe à ×1, mais rien de ce qui est construit n'est perdu. Pas de mécanique punitive (rien ne meurt, rien ne se détruit).

### 2.6 Anti-triche et plafonds

- **Plafond journalier** : 400 Pulses de base maximum par jour (avant multiplicateur), donc 1 200 au maximum avec ×3.
- Plafonds matériaux : 25 bois, 12 pierre, 15 eau, 15 énergie par jour.
- **Contrôles de plausibilité** (refus ou réduction de l'activité) :
  - marche à plus de 9 km/h en moyenne → comptée comme course ; vitesse > 25 km/h pour une course → rejetée (probablement en véhicule) ;
  - plus de 220 pas/minute sur plus de 10 min → rejeté ;
  - plus de 50 000 pas/jour ou plus de 6 h de sport/jour → plafonné ;
  - activités qui se chevauchent dans le temps → seule la plus longue compte.
- **Saisie manuelle** : rapporte 50 % des gains et est limitée à 60 min/jour.
- Avec Supabase : le calcul final des gains se fait **côté serveur** (edge function `validate-activity`), le client ne peut pas écrire directement ses soldes (RLS).
- Toute la logique de plafond et de plausibilité est une fonction pure partagée, testée unitairement.

### 2.7 Progression : niveaux et ères

Courbe d'XP : XP nécessaire pour passer du niveau n au niveau n+1 = `round(100 × n^1,5)`.

Une ère se débloque quand **le niveau requis est atteint ET les conditions de construction sont remplies**.

| Ère | Niveaux | Débloque | Condition pour passer à l'ère suivante |
|---|---|---|---|
| 1. Village de campagne | 1–5 | chemin de terre, maison de village, puits, quartier ferme (champ, potager, poulailler, grange, verger), arbres, clôtures | niveau 6 + 3 maisons + ferme complète (5 bâtiments ferme) |
| 2. Bourg | 6–12 | route goudronnée, 2e terrain, boulangerie, école, terrain de foot, briqueterie, maisons à étage | niveau 13 + 6 habitations + école + route reliant les 2 terrains |
| 3. Ville | 13–20 | avenues, immeubles 3–5 étages, parc, salle de sport, verrerie, fonderie, **gare** (chemin de fer → nouvelle région « Vallée ») | niveau 21 + 3 immeubles + gare |
| 4. Métropole | 21–30 | gratte-ciels, stade, **port** (routes maritimes → région « Côte »), **aéroport** (→ région « Montagne ») | — (fin du contenu MVP) |

**MVP** : les ères 1 et 2 doivent être jouables de bout en bout. Les ères 3 et 4 existent dans le catalogue (données + verrou affiché « bientôt »), sans être forcément toutes construisibles.

### 2.8 Construction

- Carte en grille isométrique ; chaque terrain fait 16×16 tuiles. On commence avec 1 terrain ; on en achète d'autres (le prix augmente : 300, 600, 1 200 Pulses…).
- Chaque élément a : coût en Pulses + matériaux, niveau requis, ère requise, taille au sol (ex. 1×1, 2×2, 3×2), sprite.
- Actions : placer, déplacer, pivoter (si pertinent), revendre (rembourse 50 % des Pulses, pas les matériaux).
- Les routes se tracent tuile par tuile ; certains bâtiments exigent d'être adjacents à une route.
- **Intérieurs (MVP simple)** : toucher une maison ouvre une vue intérieure en grille (8×8) où l'on achète des pièces (salon, cuisine, chambre, salle de bain) puis des meubles à placer. Une maison de village a 2 pièces max, une maison à étage 4.
- Exemples de prix pour équilibrer (à compléter dans le catalogue de façon cohérente) :
  - chemin de terre : 2 Pulses / tuile ; route goudronnée : 5 Pulses + 1 pierre / tuile
  - maison de village : 150 Pulses + 10 bois + 5 pierre
  - champ : 60 Pulses + 4 bois ; grange : 200 Pulses + 15 bois + 6 pierre
  - école : 600 Pulses + 20 brique + 10 bois
  - canapé : 40 Pulses + 3 bois ; lit : 50 Pulses + 4 bois
- Équilibrage cible : un joueur qui fait sa journée complète chaque jour finit l'ère 1 en ~2 semaines et l'ère 2 en ~6 semaines. Écris un script de simulation (`scripts/simulate-economy.ts`) qui vérifie ces durées avec la courbe d'XP et les prix, et ajuste les prix si besoin.

### 2.9 Ambiance sonore

- Une boucle d'ambiance par ère (village : oiseaux, vent, animaux de ferme ; bourg : un peu de vie, cloches ; ville : rumeur urbaine douce).
- Effets : pose d'un bâtiment, achat, quête validée, montée de niveau, coffre ouvert.
- Réglages : volume musique / effets séparés, bouton muet, respecte le mode silencieux du téléphone.

### 2.10 Écrans du MVP

1. **Accueil / Ville** : la carte de la ville (pan + zoom), barre du haut avec Pulses, matériaux, niveau + barre d'XP, série (flamme + multiplicateur).
2. **Quêtes du jour** : 3 jauges de progression + bonus, compte à rebours avant minuit.
3. **Activités** : historique du jour/semaine, bouton « Ajouter une activité » (saisie manuelle), et en mode dev un panneau « Simuler » (ajouter des pas, une séance de renfo, etc.).
4. **Boutique / Construire** : catalogue par catégorie (routes, habitations, ferme, services, décoration), éléments verrouillés grisés avec la condition affichée.
5. **Intérieur d'une maison**.
6. **Progression** : ères, niveau, conditions de la prochaine ère.
7. **Profil / Réglages** : son, sources d'activité (Apple Santé / Health Connect : « bientôt »), compte.
8. **Onboarding** en 3 écrans : le principe, les quêtes, la première maison à placer (tutoriel guidé avec un petit bonus de départ : 200 Pulses + 10 bois + 5 pierre).

### 2.11 Préparé mais hors MVP (ne pas implémenter côté UI, juste prévoir le modèle de données)

- **Amis** : ajouter un ami par code, visiter sa ville en lecture seule, lui proposer une quête (« fais 8 000 pas demain »), mini-concours hebdo entre amis (classement sur les pas ou minutes actives, jamais sur les Pulses).
- Prévoir les tables Supabase (`friendships`, `friend_quests`, `challenges`) et les policies RLS, sans écrans.
- Monétisation (plus tard) : cosmétiques et abonnement. **On ne vend jamais de Pulses ni de matériaux.**
