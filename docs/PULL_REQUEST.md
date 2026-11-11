# MVP SportMotion — bouger fait grandir sa ville

> Description prête pour la Pull Request `claude/new-session-i5302j` → `main`.
> La PR n'a pas pu être ouverte automatiquement : le dépôt ne contient pas encore de branche
> `main`, et l'environnement d'exécution n'autorise pas l'agent à pousser sur une autre branche
> que la sienne. Voir « Ouvrir la PR » en bas de page.

## Résumé

MVP jouable de bout en bout sur le web (et prêt pour iOS / Android via Expo) : on simule ou on
saisit des activités, on valide les quêtes du jour, la série fait monter le multiplicateur, on
construit un village, on aménage une maison et on passe à l'ère Bourg. Les 12 jalons du cahier
des charges sont faits, dans l'ordre.

Expo SDK 58 · React Native 0.88 · TypeScript strict · Skia · Zustand · Supabase (optionnel).

## Lancer le projet

```bash
npm install
```

```bash
npx expo start --web
```

Aucune configuration : sans variables d'environnement l'app tourne en mode local.
Vérifications : `npm run check` (typecheck, lint, 237 tests Jest, 12 tests de base de données).

## Ce qui marche

- **Économie** (fonctions pures, couverture ≈ 100 %) : gains par activité, 3 quêtes + bonus
  journée complète, gains hors quêtes, XP, plafonds (400 Pulses de base, matériaux),
  plausibilité (vitesse, cadence, chevauchements, 50 000 pas, 6 h), saisie manuelle à 50 % /
  60 min, séries, multiplicateurs ×1 → ×3, jokers repos, coffre du jour.
- **Progression** : courbe `round(100 × n^1,5)`, 4 ères, conditions niveau + constructions,
  passage automatique à l'ère Bourg avec célébration.
- **Catalogue** : 36 éléments de ville pour les ères 1–2, 12 éléments des ères 3–4 affichés
  « Bientôt », 4 pièces, 19 meubles, 3 recettes (brique jouable).
- **Ville** : carte isométrique Skia, pan / pincement / molette / boutons de zoom, placement
  avec fantôme vert ou rouge et raison du refus, déplacement, rotation, revente à 50 %, routes
  tuile par tuile, bâtiments exigeant une route, achat de terrains (300, 600, 1 200…),
  sauvegarde locale.
- **Boutique** par catégorie avec vignettes, coûts, éléments verrouillés grisés et condition.
- **Intérieurs** : grille 8×8, pièces (2 max en maison de village, 4 en maison à étage), meubles
  à poser, déplacer, pivoter, revendre.
- **Écrans** : Ville + HUD, Quêtes (jauges, compte à rebours, série, jokers), Activités
  (jour, 7 jours, saisie manuelle, panneau Simuler), Boutique, Intérieur, Progression,
  Profil / Réglages, Onboarding en 3 écrans avec pose guidée de la première maison.
- **Sons** : 3 boucles d'ambiance (une par ère), 5 effets, volumes séparés, muet, mode
  silencieux respecté.
- **Polish** : ondulation à la pose, Pulses qui volent vers le compteur, battement du compteur,
  célébrations de niveau, de journée complète, de coffre et d'ère.
- **Backend Supabase** : migration (profils, soldes, activités, registres journaliers,
  constructions, instantané de partie, tables amis), RLS, edge functions `validate-activity` et
  `game-command` exécutant le même réducteur que l'app, dépôt en ligne avec compte invité puis
  e-mail, bascule automatique selon les variables d'environnement.
- **Santé** : adaptateurs Apple Santé et Health Connect + conversion des séances et des pas,
  testés, en attente d'un module natif ; guide d'activation.
- **Accessibilité** : libellés et rôles sur les contrôles, cibles ≥ 44 px, contrastes AA
  vérifiés par un test, raisons de refus écrites (pas seulement une couleur), tailles de texte
  du système respectées.

## Équilibrage (`npm run simulate`)

| Profil                                                   | Ère 1    | Ère 2                   |
| -------------------------------------------------------- | -------- | ----------------------- |
| Régulier — les 3 quêtes chaque jour, rien de plus        | 12 jours | 43 jours (6,1 semaines) |
| Actif — 8 000 pas, 45 min de sport, 20 min de stretching | 10 jours | 30 jours                |
| Tranquille — 6 jours sur 7                               | 13 jours | 68 jours                |

Cibles du game design : ~2 semaines et ~6 semaines. Un test Jest verrouille ces fourchettes.

## Ce qui est simulé

- **Les activités** : simulateur (source par défaut) et saisie manuelle. Aucune donnée de
  capteur réelle.
- **Le calendrier** : « Passer au lendemain » avance le jour du jeu pour montrer les séries.
- **Les sprites** : dessinés en code (volumes isométriques), pas de bitmaps.
- **Les sons** : synthétisés par script.

## À savoir avant de relire

1. **Branche** : le travail est sur `claude/new-session-i5302j` et non `feat/mvp` (imposé par
   l'environnement).
2. **Assets Kenney non utilisés** : kenney.nl, opengameart.org et freesound.org étaient
   bloqués par le proxy réseau. Sprites et sons sont générés par notre code (CC0), comme le
   prévoyait la consigne de repli.
3. **XP de construction ajoutée** : acheter un élément rapporte de l'XP (taux 0,1 en ère 1,
   1 à partir de l'ère 2). Sans cela la cible « ère 2 en ~6 semaines » est impossible avec la
   courbe imposée : il faut 458 XP/jour alors que le plafond d'activité est de 400 (200 pour une
   journée complète simple). C'est l'écart le plus important par rapport au game design ; à
   valider ou à remplacer par un autre levier.
4. **Sons jamais écoutés** : l'environnement n'a pas de sortie audio. Niveaux, raccord des
   boucles et chargement sont vérifiés, pas le rendu à l'oreille.
5. **Supabase jamais exécuté sur un vrai projet** : pas d'identifiants disponibles. La
   migration et la RLS tournent dans un Postgres embarqué (12 tests), les edge functions sous
   Deno avec un Supabase en mémoire (8 tests), le dépôt client avec un faux client.
6. **iOS / Android non testés** : pas de simulateur. Tout est vérifié sur le web, y compris un
   parcours automatisé d'une installation vierge jusqu'à l'ère Bourg.

Tous les choix faits en autonomie sont dans `docs/DECISIONS.md`.

## Reste à faire

- [ ] Créer `main` et ouvrir cette PR (voir ci-dessous)
- [ ] Tester sur un iPhone et un Android réels (gestes, sons, performances de la carte)
- [ ] Écouter les sons et les remplacer si besoin
- [ ] Remplacer les sprites générés par les packs Kenney (ou une direction artistique dédiée)
- [ ] Déployer sur un projet Supabase et valider l'authentification de bout en bout
- [ ] Brancher Apple Santé / Health Connect (`docs/HEALTH_INTEGRATION.md`), puis masquer le simulateur
- [ ] Valider ou revoir l'XP de construction (point 3)
- [ ] Rendre les ères Ville et Métropole jouables (verrerie, fonderie, gare, régions)
- [ ] Alternative à la carte pour les lecteurs d'écran (liste des éléments et placement par coordonnées)
- [ ] Minuteries de fabrication, animations d'habitants, cycle jour / nuit (hors MVP)
- [ ] Écrans amis (le modèle de données et la RLS sont prêts)
- [ ] Traductions (`src/i18n/fr.ts` centralise déjà tous les textes)

## Ouvrir la PR

Le dépôt n'a qu'une branche. Pour obtenir une PR vers `main` :

```bash
git fetch origin
```

```bash
git push origin 5887588:refs/heads/main
```

(`5887588` est le commit initial, vide de code.) Puis sur GitHub : définir `main` comme
branche par défaut et ouvrir une PR depuis `claude/new-session-i5302j`, en collant ce fichier
comme description.
