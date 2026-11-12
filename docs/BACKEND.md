# Backend Supabase

L'app fonctionne **sans backend** (mode local). Elle bascule seule sur Supabase quand
`EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY` sont définies (`.env`, voir
`.env.example`).

## Principe : le serveur fait autorité

```
app ──commande──▶ edge function ──▶ réducteur pur (le même que dans l'app) ──▶ Postgres
 ▲                 (JWT vérifié)        supabase/functions/_shared/game          (service role)
 └──────────────── état recalculé ◀──────────────────────────────────────────────┘
```

- L'app applique la commande localement tout de suite (réponse instantanée), puis adopte
  l'état renvoyé par le serveur ; si le serveur refuse, elle revient à l'état serveur.
- Les joueurs n'ont **aucun droit d'écriture** sur leurs soldes, activités, constructions ou
  registres journaliers : ni privilège SQL, ni policy RLS. Seules les edge functions (service
  role) écrivent.
- Le coffre du jour est tiré côté serveur (jamais appliqué de façon optimiste).
- La date « aujourd'hui » vient de l'appareil (le serveur ignore son fuseau), mais doit
  exister quelque part sur Terre à cet instant (UTC−12 … UTC+14) et ne peut pas reculer.

## Contenu de `supabase/`

| Chemin                               | Rôle                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `migrations/20261111000000_init.sql` | schéma, déclencheur de création de profil, RLS                                                 |
| `functions/validate-activity`        | valide une activité et calcule les gains (plausibilité, plafonds, quêtes, série)               |
| `functions/game-command`             | toutes les autres actions (construire, vendre, fabriquer, coffre, terrain, ère, remise à zéro) |
| `functions/_shared/handler.ts`       | authentification, verrou optimiste, écriture, projections                                      |
| `functions/_shared/game/`            | **copie générée** de `src/game` (`npm run sync:edge`)                                          |
| `tests/database.spec.ts`             | migration + RLS exécutées dans un Postgres embarqué                                            |

### Tables

| Table                                                                  | Contenu                                                      | Écriture                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| `profiles`                                                             | pseudo, code ami, ère, niveau, série                         | serveur (le joueur ne modifie que `display_name`) |
| `game_states`                                                          | instantané complet de la partie (source de vérité) + version | serveur                                           |
| `balances`                                                             | Pulses, XP, matériaux                                        | serveur                                           |
| `activities`                                                           | activités acceptées                                          | serveur                                           |
| `day_ledgers`                                                          | ce que chaque journée a rapporté, pas et minutes actives     | serveur                                           |
| `buildings`                                                            | constructions et intérieurs                                  | serveur                                           |
| `friendships`, `friend_quests`, `challenges`, `challenge_participants` | amis (prévu, sans écran)                                     | joueurs, via RLS                                  |

`game_states` est la source de vérité ; `balances`, `activities`, `day_ledgers` et
`buildings` en sont des projections écrites dans la même requête (lecture, support, et plus
tard visite de la ville d'un ami — déjà autorisée en lecture seule par la RLS entre amis
acceptés). Les concours se classent sur les pas ou les minutes actives, jamais sur les Pulses
(contrainte SQL).

## Mise en route

```bash
npm install -g supabase            # ou : brew install supabase/tap/supabase
supabase login
supabase link --project-ref <ref-du-projet>
supabase db push                   # applique la migration
supabase functions deploy validate-activity game-command
cp .env.example .env               # puis renseigner l'URL et la clé anon
npx expo start --web
```

Dans le tableau de bord Supabase : **Authentication → Providers → activer « Anonymous
sign-ins »** (les invités jouent tout de suite et peuvent associer un e-mail depuis le Profil).

Pour une démonstration où le simulateur doit fonctionner en ligne :
`supabase secrets set ALLOW_MOCK_ACTIVITIES=true`. **Ne jamais l'activer en production** : une
activité simulée, ce sont des Pulses gratuits.

En local : `supabase start`, `supabase functions serve`, et pointer `.env` sur l'URL locale.

## Après une modification des règles du jeu

`src/game` est partagé avec le serveur :

```bash
npm run sync:edge                                  # régénère supabase/functions/_shared/game
supabase functions deploy validate-activity game-command
```

Un test Jest échoue si la copie n'est plus à jour.

## Tests

| Commande            | Ce qui est vérifié                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`          | réducteur serveur (`processRequest`), dépôt Supabase avec un faux client, copie partagée à jour                                                    |
| `npm run test:db`   | la vraie migration dans PGlite : contraintes, déclencheur, toutes les policies RLS                                                                 |
| `npm run test:edge` | les edge functions sous Deno avec un Supabase et un Strava en mémoire (auth, verrou optimiste, projections, remise à zéro, OAuth et import Strava) |

**Limite connue** : rien n'a été exécuté contre un vrai projet Supabase (aucun identifiant
disponible pendant le développement). Le schéma, la RLS et le handler sont testés en local ;
l'authentification réelle, le déploiement des fonctions et le client `supabase-js` de bout en
bout restent à valider sur un projet.
