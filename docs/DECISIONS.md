# Décisions prises en autonomie

Chaque ligne : la décision, puis sa justification.

## Socle

- **Branche `claude/new-session-i5302j` au lieu de `feat/mvp`** — l'environnement d'exécution impose cette branche et interdit de pousser ailleurs ; le contenu est identique à ce qu'aurait été `feat/mvp`.
- **Expo SDK 58** (React Native 0.88, React 19.3) — dernière version stable au moment de l'installation (`npm view expo version`).
- **Versions des modules lues dans `expo/bundledNativeModules.json`** au lieu de `npx expo install` — l'API Expo de résolution de versions est bloquée par le proxy réseau de l'environnement ; le résultat est le même.
- **Web en mode `single` (SPA), bundler Metro** — le rendu statique côté serveur n'apporte rien à un jeu et complique Skia/AsyncStorage.
- **`canvaskit.wasm` copié dans `public/` par un `postinstall`** (`setup-skia-web public`) et ignoré par git — évite de versionner un binaire de 7 Mo.
- **Skia chargé paresseusement sur le web** (`WithSkiaWeb` + `import()`) — CanvasKit doit être initialisé avant le premier import de `@shopify/react-native-skia`.
- **`Tabs` importé depuis `expo-router/js-tabs`** — l'export depuis `expo-router` est déprécié en SDK 58.

## Économie

- **« Activité sportive » = course, renforcement, vélo, natation, sport collectif** — la marche a sa propre quête ; le stretching/yoga/mobilité aussi. Une course compte à la fois pour les pas (bois) et le cardio (énergie).
- **Évaluation de la journée idempotente** (`evaluateDay(activités)`), le moteur crédite la différence avec ce qui a déjà été versé — même fonction sur l'appareil et sur le serveur, pas de double comptage, ordre d'arrivée indifférent.
- **Un gain versé n'est jamais repris** — si une activité plus longue en remplace une plus courte (chevauchement), on garde le maximum déjà crédité par ressource. Conforme à « pas de mécanique punitive ».
- **Le multiplicateur de série est figé au début de la journée** (série de la veille) — évite de recalculer rétroactivement les Pulses déjà versés quand la journée devient complète ; l'écran Quêtes annonce le palier suivant.
- **Saisie manuelle : pas et minutes comptés à 50 %** (y compris pour la progression des quêtes), 60 minutes saisies max par jour, dans l'ordre chronologique — lecture la plus simple de « rapporte 50 % des gains ».
- **Pas saisis à la main estimés** à 100 pas/min (marche) et 160 pas/min (course) — la saisie ne demande que le type et la durée.
- **Contrôle de vitesse seulement si la source fournit une distance** — on ne peut pas inventer une vitesse à partir des seuls pas.
- **Plafond de 6 h de sport** : le temps de renfo et de cardio est réduit au prorata.
- **Jokers repos** : +1 à chaque multiple de 7 jours de série (max 2). Un jour manqué n'incrémente pas la série mais ne la casse pas. Aucun joker n'est consommé si la série est déjà à 0.
- **Coffre du jour** : 3 tirages de matériaux de base (2 à 4 unités chacun), + 1 à 3 briques à partir du Bourg ; hors plafonds journaliers (c'est un bonus).
- **Une activité compte pour le jour où elle est enregistrée** — suffisant tant que les sources sont le simulateur et la saisie manuelle.

## Progression et équilibrage

- **XP de construction** : acheter un élément rapporte de l'XP (`xp = prix en Pulses × taux de l'ère`, taux 0,1 en ère 1 et 1 à partir de l'ère 2 ; 0,2 pour pièces et meubles). Sans cela, la cible « ère 2 en ~6 semaines » est mathématiquement impossible : il faut 19 252 XP entre les niveaux 6 et 13, soit 458 XP/jour sur 42 jours, alors que le plafond d'activité est de 400 XP/jour (200 pour une journée complète sans extra). La courbe d'XP imposée n'est pas modifiée ; l'XP reste issue de l'effort puisque les Pulses dépensés viennent du mouvement. Revendre ne retire pas l'XP.
- **Prix de l'ère 2 rééquilibrés par simulation** : moins de bois/pierre, plus d'eau/énergie (qui s'accumulaient sans usage). Résultat de `npm run simulate` pour le joueur de référence (3 quêtes par jour, rien de plus) : ère 1 en 12 jours, ère 2 en 43 jours. Un test Jest verrouille ces fourchettes.
- **Ères 3 et 4 non jouables** (`MAX_PLAYABLE_ERA = 2`) : présentes dans le catalogue, affichées « Bientôt ».
- **« 3 maisons » / « 6 habitations »** = éléments portant le tag `housing` (maison de village ou maison à étage). **« Ferme complète »** = 5 types de bâtiments de ferme différents.
- **2ᵉ terrain réservé à l'ère Bourg** (comme dans le tableau des ères) ; les terrains sont contigus, disposés sur une grille 3×3 (9 max), prix 300 × 2ⁿ.
- **Route reliant les 2 terrains** : n'importe quel type de route, connexité à 4 voisins, au moins une tuile sur chaque terrain.
- **Bâtiments exigeant une route** : ceux du Bourg (briqueterie, maison à étage, commerces, école, église, mairie). Vérifié à la pose et au déplacement seulement — retirer la route ensuite ne pénalise pas.
- **Intérieurs** : chaque pièce achetée occupe un quart (4×4) de la grille 8×8 ; un meuble tient entièrement dans une pièce ; une pièce de chaque type par maison. Revendre une maison supprime son intérieur (le jeu prévient).
- **Fabrication (briques…) instantanée**, depuis la briqueterie — pas de minuterie dans le MVP.

## Architecture

- **Toutes les mutations passent par un réducteur pur** `applyCommand(state, command, ctx)` (`src/game/engine`) — même code en local et dans l'edge function, testable sans React.
- **Persistance via `GameRepository`** (et non le middleware `persist` de Zustand pour l'état de jeu) — permet de basculer entre AsyncStorage et Supabase ; les réglages (son) utilisent bien `persist` + AsyncStorage.

## Application

- **Skia isolé derrière des imports dynamiques** (`src/render/lazy.tsx`) — sur le web, CanvasKit doit être chargé avant le premier import de Skia ; un point d'entrée web personnalisé cassait le découpage des bundles d'Expo Router (« Requiring unknown module »), l'import paresseux est plus robuste.
- **Icônes en emoji** (❤️ 🪵 🪨 💧 ⚡ 🔥) — aucune police d'icônes à charger, rendu identique sur web et natif, lisible par les lecteurs d'écran via des libellés explicites.
- **Panneau « Simuler » toujours visible** (et pas seulement en `__DEV__`) — le simulateur est la source d'activité par défaut du MVP ; sans lui le build web n'est pas jouable. À masquer quand Apple Santé / Health Connect seront branchés.
- **« Passer au lendemain »** (démo) décale le calendrier du jeu d'un jour pour montrer séries, multiplicateurs et jokers sans attendre minuit ; désactivé en mode Supabase (le serveur valide la date).
- **Mock Jest maison pour Reanimated** (`__mocks__/react-native-reanimated.tsx`) — le mock officiel de Reanimated 4 exige Worklets natif ou un DOM, absents de Jest.
