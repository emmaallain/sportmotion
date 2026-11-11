# Avancement

Légende : ✅ terminé · 🚧 en cours · ⬜ à faire

| #   | Jalon                                                                      | État | Vérification                                                       |
| --- | -------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------ |
| 1   | Socle (Expo SDK 58, TS strict, Router, lint, Jest, web)                    | ✅   | `npm run check`, export web                                        |
| 2   | Moteur d'économie                                                          | ✅   | tests unitaires, couverture ≈ 100 % de `game/economy`              |
| 3   | Progression + simulation                                                   | ✅   | tests + `npm run simulate`                                         |
| 4   | Catalogue (36 éléments ères 1–2, 12 verrouillés, 19 meubles)               | ✅   | tests de cohérence                                                 |
| 5   | Activités (fournisseurs, écrans Activités et Quêtes)                       | ✅   | tests + parcours web                                               |
| 6   | Ville (rendu iso Skia, pan/zoom, placement, routes, terrains, persistance) | ✅   | tests + parcours web                                               |
| 7   | Boutique + HUD                                                             | ✅   | parcours web                                                       |
| 8   | Intérieurs                                                                 | ✅   | tests + parcours web                                               |
| 9   | Sons (3 ambiances, 5 effets, réglages)                                     | ✅   | tests ; **non écoutés** (pas de sortie audio dans l'environnement) |
| 10  | Onboarding + polish (ondulation de pose, Pulses qui volent, célébrations)  | ✅   | parcours web                                                       |
| 11  | Supabase (migration, RLS, edge functions, dépôt, auth)                     | ✅   | PGlite + Deno + faux client ; **pas testé sur un vrai projet**     |
| 12  | Santé réelle (squelettes + doc)                                            | ✅   | tests des adaptateurs                                              |

## Reste à faire

Voir la liste dans la description de la Pull Request et dans le README.
