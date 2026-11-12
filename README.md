# SportMotion

Jeu mobile où **bouger fait grandir sa ville** : chaque pas, séance de renfo ou de stretching
rapporte des Pulses, des matériaux et de l'XP pour bâtir un village de campagne, puis un
bourg — et plus tard une ville et une métropole.

MVP : Expo SDK 58 · React Native · TypeScript strict · Skia · Zustand · Supabase (optionnel).

## Démarrer

```bash
npm install
```

```bash
npx expo start --web
```

Aucune configuration n'est nécessaire : sans variables d'environnement, l'app tourne en
**mode local** (sauvegarde sur l'appareil). Sur mobile, scanner le QR code avec Expo Go.

### Faire un tour du jeu en 2 minutes

1. Passer l'introduction et poser la première maison.
2. Onglet **Activités** → panneau « Simuler » → **Journée complète** : les 3 quêtes se valident.
3. Onglet **Quêtes** → ouvrir le coffre du jour ; la série passe à 1.
4. **Passer au lendemain** (panneau « Simuler ») et recommencer : à 3 jours la série donne ×1,5.
5. Onglet **Ville** → **Construire** : champ, potager, poulailler… Les bâtiments de ferme donnent
   une **récolte** quand leur quête du jour est validée (bouton « Tout récolter »). Toucher une
   maison → **Entrer** pour acheter des pièces et des meubles.
6. Niveau 6 + 3 maisons + les 5 bâtiments de ferme → l'ère **Bourg** se débloque (2ᵉ terrain,
   route goudronnée, briqueterie, école…).

## Commandes

| Commande                                          | Rôle                                                     |
| ------------------------------------------------- | -------------------------------------------------------- |
| `npx expo start --web`                            | serveur de développement (web)                           |
| `npm run export:web`                              | build web statique dans `dist/`                          |
| `npm run check`                                   | typecheck + lint + tests Jest + tests de la base         |
| `npm run typecheck` / `npm run lint` / `npm test` | chaque vérification séparément                           |
| `npm run test:db`                                 | migration SQL et RLS dans un Postgres embarqué (PGlite)  |
| `npm run test:edge`                               | edge functions sous Deno (télécharge Deno via npx)       |
| `npm run simulate`                                | simulation d'équilibrage (`-- --verbose` pour le détail) |
| `npm run sync:edge`                               | recopie `src/game` vers les edge functions               |
| `npm run gen:audio`                               | régénère les sons de `assets/audio/`                     |

## Architecture

```
src/
  app/            écrans (Expo Router) : onglets Ville, Quêtes, Activités, Progression, Profil ;
                  boutique, intérieur, onboarding
  game/           logique pure, sans React ni Supabase
    economy/      gains, quêtes, plafonds, plausibilité, séries, coffre
    progression/  XP, niveaux, ères, conditions
    catalog/      éléments de ville, pièces, meubles, recettes
    city/         grille, placement, collisions, routes, intérieurs
    engine/       état du jeu + réducteur de commandes (partagé avec le serveur)
  render/         rendu isométrique : sprites générés en code, scène, composants Skia
  activity/       sources d'activité : simulateur, saisie manuelle, squelettes santé
  data/           persistance : AsyncStorage (local) ou Supabase
  state/          stores Zustand (jeu, réglages, interface)
  audio/          moteur audio (expo-audio)
  ui/             composants, thème, HUD, dialogues
  i18n/           tous les textes (français)
supabase/         migration SQL + RLS, edge functions, tests
scripts/          simulation d'économie, génération des sons, synchronisation serveur
docs/             game design, décisions, avancement, backend, santé
```

Toute modification du jeu passe par `applyCommand(state, command, ctx)`
(`src/game/engine/reducer.ts`) : la même fonction pure tourne sur l'appareil et dans les edge
functions.

## Backend (optionnel)

```bash
cp .env.example .env
```

Renseigner `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY` : l'app bascule alors
sur Supabase (compte invité anonyme, calcul des gains côté serveur). Mise en place complète
dans [`docs/BACKEND.md`](docs/BACKEND.md).

## Sources d'activité

| Source                      | Où                                                                        | État                                       |
| --------------------------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| Simulateur, saisie manuelle | partout (web, Expo Go, app installée)                                     | fonctionne                                 |
| Apple Santé, Health Connect | app installée uniquement — [`docs/NATIVE_BUILD.md`](docs/NATIVE_BUILD.md) | écrit, **non testé sur appareil**          |
| Strava                      | mode en ligne uniquement — [`docs/STRAVA.md`](docs/STRAVA.md)             | écrit, **non testé contre le vrai Strava** |

Le calendrier peut être avancé (« Passer au lendemain ») pour montrer les séries. Les sprites
et les sons sont générés par du code — voir [`assets/CREDITS.md`](assets/CREDITS.md).

## Documentation

- [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) — règles du jeu (source de vérité)
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — choix faits en autonomie, avec leur justification
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — avancement des jalons
- [`docs/BACKEND.md`](docs/BACKEND.md) — Supabase : schéma, sécurité, déploiement
- [`docs/NATIVE_BUILD.md`](docs/NATIVE_BUILD.md) — installer l'app sur un iPhone ou un Android
- [`docs/HEALTH_INTEGRATION.md`](docs/HEALTH_INTEGRATION.md) — Apple Santé / Health Connect
- [`docs/STRAVA.md`](docs/STRAVA.md) — connecter Strava
- [`assets/CREDITS.md`](assets/CREDITS.md) — assets et licences
