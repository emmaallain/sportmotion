# Crédits des assets

Tous les assets du jeu sont **CC0 1.0 (domaine public)** : ils ont été créés pour ce projet,
par du code versionné dans ce dépôt, sans reprendre d'œuvre tierce.

> Les packs isométriques de Kenney (kenney.nl), prévus en priorité, n'ont pas pu être
> téléchargés : kenney.nl, opengameart.org et freesound.org sont bloqués par le proxy réseau
> de l'environnement de développement. Conformément à la consigne, les sprites sont donc
> dessinés en code et les sons synthétisés. Voir `docs/DECISIONS.md`.

## Sprites (générés à l'exécution)

| Asset                                                         | Source                                                            | Licence |
| ------------------------------------------------------------- | ----------------------------------------------------------------- | ------- |
| Bâtiments, routes, arbres, décorations (48 éléments de ville) | `src/render/sprites.ts` — volumes isométriques dessinés avec Skia | CC0 1.0 |
| Meubles (19 éléments)                                         | `src/render/sprites.ts`                                           | CC0 1.0 |
| Sols, murs et pièces des intérieurs                           | `src/render/scene.ts`                                             | CC0 1.0 |

## Sons (`assets/audio/`, générés par `npm run gen:audio`)

Synthèse additive et bruit filtré, script `scripts/generate-audio.ts` (déterministe).

| Fichier                | Usage                                                         | Licence |
| ---------------------- | ------------------------------------------------------------- | ------- |
| `ambience-village.wav` | boucle d'ambiance ère 1 : vent, oiseaux, poule, vache au loin | CC0 1.0 |
| `ambience-bourg.wav`   | boucle d'ambiance ère 2 : oiseaux, cloche d'église, murmure   | CC0 1.0 |
| `ambience-ville.wav`   | boucle d'ambiance ères 3–4 : rumeur urbaine douce, tramway    | CC0 1.0 |
| `sfx-place.wav`        | pose d'un bâtiment ou d'un meuble                             | CC0 1.0 |
| `sfx-purchase.wav`     | achat, revente                                                | CC0 1.0 |
| `sfx-quest.wav`        | quête validée                                                 | CC0 1.0 |
| `sfx-level-up.wav`     | montée de niveau, nouvelle ère                                | CC0 1.0 |
| `sfx-chest.wav`        | coffre ouvert                                                 | CC0 1.0 |

## Icônes de l'application

| Fichier                                                            | Source                                               | Licence |
| ------------------------------------------------------------------ | ---------------------------------------------------- | ------- |
| `icon.png`, `favicon.png`, `splash-icon.png`, `android-icon-*.png` | gabarit `create-expo-app` (images par défaut d'Expo) | MIT     |

## Pictogrammes de l'interface

Emoji Unicode rendus par la police du système (aucun fichier embarqué).
