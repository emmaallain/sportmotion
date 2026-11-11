# Brancher Apple Santé et Google Health Connect

Dans le MVP, les activités viennent du **simulateur** et de la **saisie manuelle**. Les
adaptateurs santé sont écrits et testés, mais **non activés** : ils demandent des modules
natifs, donc un _development build_ (impossible dans Expo Go et sur le web).

## Ce qui existe déjà

| Fichier                                 | Rôle                                                                |
| --------------------------------------- | ------------------------------------------------------------------- |
| `src/activity/ActivityProvider.ts`      | interface commune à toutes les sources                              |
| `src/activity/healthMapping.ts`         | conversion séances / pas → activités du jeu (pur, testé)            |
| `src/activity/HealthKitProvider.ts`     | adaptateur Apple Santé, attend un `HealthKitBridge`                 |
| `src/activity/HealthConnectProvider.ts` | adaptateur Health Connect, attend un `HealthConnectBridge`          |
| `src/activity/sync.ts`                  | `syncProvider()` : lit la journée et envoie les activités au moteur |

Sans _bridge_, les deux fournisseurs répondent `coming_soon` et ne renvoient **aucune**
donnée (jamais de données inventées). L'écran Profil les affiche « Bientôt ».

Le moteur n'a rien à changer : une activité `healthkit` ou `health_connect` compte à 100 %
(la saisie manuelle à 50 %), passe par les mêmes contrôles de plausibilité, et son
identifiant stable (`healthkit-<uuid>`, `healthkit-steps-<début de l'heure>`) empêche tout
double comptage lors des synchronisations répétées.

## Données lues (lecture seule)

| Donnée         | Apple Santé                         | Health Connect          | Usage                                                  |
| -------------- | ----------------------------------- | ----------------------- | ------------------------------------------------------ |
| Pas, par heure | `HKQuantityTypeIdentifierStepCount` | `StepsRecord` (agrégé)  | quête « Marcher », bois                                |
| Distance       | `distanceWalkingRunning`            | `DistanceRecord`        | contrôle de vitesse                                    |
| Séances        | `HKWorkoutType`                     | `ExerciseSessionRecord` | quêtes « Bouger » / « S'étirer », pierre, eau, énergie |

Les pas d'une heure qui recoupe une séance enregistrée sont ignorés (ils sont déjà dans la
séance). L'app n'écrit jamais dans les données de santé.

## Activer Apple Santé (iOS)

1. Installer un module HealthKit compatible avec le SDK Expo du projet, par exemple
   `npx expo install @kingstinct/react-native-healthkit` (vérifier la compatibilité avec la
   nouvelle architecture au moment de l'intégration).
2. Dans `app.json` : ajouter le plugin du module, l'_entitlement_ `com.apple.developer.healthkit`
   et le texte `NSHealthShareUsageDescription` (« SportMotion lit vos pas et vos séances pour
   faire grandir votre ville. »). Pas de `NSHealthUpdateUsageDescription` : on n'écrit rien.
3. Écrire `src/activity/bridges/healthKitBridge.ios.ts` qui implémente `HealthKitBridge` :
   - `isAvailable` → `isHealthDataAvailable()`
   - `requestAuthorization` → demande de lecture pour pas, distance, séances
   - `queryWorkouts(from, to)` → séances, converties en `HealthWorkout` (`kind` = nom du
     `HKWorkoutActivityType`, déjà reconnu par `healthMapping.ts`)
   - `queryStepBuckets(from, to)` → requête de statistiques par intervalles d'une heure
4. Dans `src/activity/index.ts`, construire le fournisseur avec le bridge :
   `new HealthKitProvider(createHealthKitBridge())`.
5. Appeler `syncProvider(healthKitProvider, currentDayStartMs(), idsDéjàConnus, dispatch)` à
   l'ouverture de l'app et à chaque retour au premier plan (le `AppState` est déjà écouté dans
   `src/app/_layout.tsx`).
6. Construire : `npx expo prebuild` puis `eas build --profile development --platform ios`.
7. Dans le Profil, remplacer « Bientôt » par un interrupteur qui appelle
   `requestPermissions()`, et masquer le panneau « Simuler ».

iOS ne dit pas si l'utilisateur a refusé la lecture : une autorisation refusée se traduit par
des résultats vides. Prévoir un message « Aucune donnée reçue — vérifiez Réglages > Santé ».

## Activer Health Connect (Android)

1. `npx expo install react-native-health-connect expo-build-properties`.
2. Dans `app.json` : plugin `react-native-health-connect`, `minSdkVersion` 26 via
   `expo-build-properties`, et les permissions
   `android.permission.health.READ_STEPS`, `READ_DISTANCE`, `READ_EXERCISE`.
   Déclarer aussi l'activité de justification des permissions (exigée par Google Play).
3. Écrire `src/activity/bridges/healthConnectBridge.android.ts` qui implémente
   `HealthConnectBridge` : `getSdkStatus()` pour `isAvailable`, `requestPermission([...])`,
   `readRecords('ExerciseSession', …)` et `aggregateGroupByDuration` pour les pas par heure.
   Le `kind` attendu est le nom de la constante (`EXERCISE_TYPE_RUNNING`…).
4. Même branchement que pour iOS : `new HealthConnectProvider(createHealthConnectBridge())`,
   puis `syncProvider(...)`.
5. `eas build --profile development --platform android`.

Sur Android 13 et antérieurs, Health Connect est une application à installer : si
`isAvailable()` est faux, proposer le lien vers le Play Store.

## Côté serveur

Avec Supabase, l'edge function `validate-activity` refuse la source `mock` (sauf si
`ALLOW_MOCK_ACTIVITIES=true`, réservé aux démonstrations). Les sources `healthkit` et
`health_connect` sont acceptées telles quelles : l'appareil reste déclaratif. Pour aller plus
loin contre la triche, vérifier l'intégrité de l'app (App Attest / Play Integrity) avant
d'accepter une activité — non fait dans le MVP.

## Publication

- **App Store** : la fiche doit expliquer l'usage des données de santé ; elles ne doivent
  servir ni à la publicité ni à la revente (règle 5.1.3).
- **Google Play** : remplir le formulaire « Health Connect » et la politique de
  confidentialité avant toute publication.
