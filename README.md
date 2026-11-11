# SportMotion

Jeu mobile où **bouger fait grandir sa ville** : chaque pas, séance de renfo ou de stretching rapporte des Pulses, des matériaux et de l'XP pour construire un village, puis un bourg, puis une ville.

## Démarrer

```bash
npm install
npx expo start --web
```

L'app tourne sans aucune configuration (mode local, données dans AsyncStorage).

## Commandes

| Commande               | Rôle                                   |
| ---------------------- | -------------------------------------- |
| `npx expo start --web` | serveur de dev (web)                   |
| `npm run export:web`   | build web statique dans `dist/`        |
| `npm run typecheck`    | `tsc --noEmit`                         |
| `npm run lint`         | ESLint + Prettier                      |
| `npm test`             | Jest                                   |
| `npm run check`        | typecheck + lint + tests               |
| `npm run simulate`     | simulation d'équilibrage de l'économie |

## Documentation

- `docs/GAME_DESIGN.md` — règles du jeu (source de vérité)
- `docs/PROGRESS.md` — avancement des jalons
- `docs/DECISIONS.md` — choix faits en autonomie
