# Connecter Strava

Une fois Strava relié, les activités Strava du jour sont importées automatiquement à chaque
ouverture de l'app (et à chaque retour au premier plan).

> **État** : le flux complet est écrit et testé avec un faux Strava (18 tests serveur, tests
> de l'app, tests de la base). **Il n'a jamais été exécuté contre le vrai Strava** : il faut
> des identifiants d'application Strava et un projet Supabase déployé.

## Pourquoi il faut le serveur

Strava exige un « secret client » qui ne doit jamais se trouver dans une app. La connexion et
l'import passent donc par des fonctions serveur (Supabase). **En mode local, Strava n'est pas
disponible** ; le profil l'indique.

Astuce sans serveur : dans l'app Strava, activer l'envoi des activités vers Apple Santé ou
Health Connect ; SportMotion les lira par là (voir `HEALTH_INTEGRATION.md`).

## Mise en place (une fois)

1. Déployer le backend : voir [`BACKEND.md`](BACKEND.md).
2. Créer une application Strava sur <https://www.strava.com/settings/api> :
   - **Authorization Callback Domain** : le domaine du projet Supabase, par exemple
     `abcdefgh.supabase.co` (sans `https://`).
   - Noter le **Client ID** et le **Client Secret**.
3. Donner ces valeurs au serveur :

```bash
supabase secrets set STRAVA_CLIENT_ID=<client id> STRAVA_CLIENT_SECRET=<client secret>
```

Si l'app est aussi hébergée sur le web, ajouter son adresse pour autoriser le retour :

```bash
supabase secrets set APP_WEB_URL=https://votre-site.example
```

4. Appliquer la migration et déployer les fonctions :

```bash
supabase db push
```

```bash
supabase functions deploy strava-connect strava-callback strava-sync
```

5. Dans l'app (mode en ligne) : **Profil → Sources d'activité → Strava → Connecter**.

Une nouvelle application Strava est limitée à **un seul athlète** (vous) tant que Strava ne
l'a pas validée : suffisant pour tester, à faire valider avant d'ouvrir à d'autres joueurs.

## Ce qui se passe

```
app ── strava-connect ──▶ serveur : crée un jeton à usage unique, renvoie l'adresse Strava
app ── ouvre Strava ──▶ le joueur accepte
Strava ── strava-callback ──▶ serveur : échange le code, stocke les jetons, renvoie vers l'app
app ── strava-sync ──▶ serveur : lit les activités chez Strava, calcule les gains, répond
```

- L'app ne voit jamais les jetons Strava (colonnes illisibles, même pour son propre compte).
- C'est le serveur qui lit Strava : un appareil ne peut pas inventer une activité « Strava ».
- Un athlète Strava ne peut être relié qu'à un seul compte SportMotion.
- Autorisation demandée : `activity:read_all` (lecture seule, activités privées comprises).

## Conversion

| Strava                                                     | SportMotion     |
| ---------------------------------------------------------- | --------------- |
| Run, TrailRun, VirtualRun                                  | course          |
| Walk, Hike                                                 | marche          |
| Ride, GravelRide, MountainBikeRide, VirtualRide, EBikeRide | vélo            |
| Swim                                                       | natation        |
| WeightTraining, Crossfit, HIIT, Workout, Rowing…           | renforcement    |
| Yoga / Pilates                                             | yoga / mobilité |
| Soccer, Basketball, Tennis, Padel…                         | sport collectif |

- Durée = temps en mouvement.
- Strava ne fournit pas les pas : ils sont **estimés à partir de la distance** pour la marche
  et la course (≈ 0,75 m et 1,05 m par pas).
- Une activité **saisie à la main dans Strava** compte comme une saisie manuelle (50 %).
- Les contrôles habituels s'appliquent (une « course » à 60 km/h est refusée).
- Les sports inconnus (voile, ski…) sont ignorés pour l'instant.

## Limites connues

- Jamais testé contre le vrai Strava (voir plus haut).
- Seules les activités **du jour** sont comptées ; celles d'hier non synchronisées à temps
  ne sont pas rattrapées.
- Import à l'ouverture de l'app, pas en temps réel (pas de webhook Strava).
- Les pas quotidiens hors séance ne viennent pas de Strava : pour eux, utiliser Apple Santé
  ou Health Connect.
- Avant publication : respecter les règles de marque Strava (mention « Powered by Strava »,
  bouton officiel) et l'accord d'utilisation de l'API.

## Code

| Fichier                                            | Rôle                                                            |
| -------------------------------------------------- | --------------------------------------------------------------- |
| `src/game/integrations/strava.ts`                  | conversion, URL d'autorisation, adresses de retour (pur, testé) |
| `supabase/functions/_shared/strava.ts`             | connexion, retour OAuth, synchronisation                        |
| `supabase/migrations/20261112000000_strava.sql`    | tables et droits                                                |
| `src/data/strava.ts`, `src/activity/stravaSync.ts` | appels depuis l'app                                             |
| `src/ui/StravaRow.tsx`                             | ligne du profil                                                 |
