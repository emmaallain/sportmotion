# Apple Santé et Google Health Connect

SportMotion lit, **en lecture seule**, les pas, la distance et les séances de sport du jour
dans le magasin de santé du téléphone. Cela ne fonctionne que dans une version installée de
l'app : voir [`NATIVE_BUILD.md`](NATIVE_BUILD.md). Dans Expo Go et sur le web, les lignes
« Apple Santé » et « Health Connect » du profil indiquent simplement que ce n'est pas disponible.

> **État** : tout le code est écrit et la logique (conversion, dédoublonnage, statuts,
> synchronisation) est testée. Les deux ponts natifs compilent contre les API réelles des
> modules, mais **n'ont jamais tourné sur un téléphone**. C'est la première chose à vérifier
> après le premier build.

## Utilisation

**Profil → Sources d'activité → Connecter.** Le téléphone affiche sa demande d'autorisation.
Ensuite, les données du jour sont importées automatiquement à chaque ouverture de l'app et à
chaque retour au premier plan ; un bouton « Synchroniser » force l'import.

## Ce qui est lu

| Donnée         | Apple Santé                         | Health Connect    | Sert à                                                 |
| -------------- | ----------------------------------- | ----------------- | ------------------------------------------------------ |
| Pas, par heure | `HKQuantityTypeIdentifierStepCount` | `Steps` (agrégé)  | quête « Marcher », bois                                |
| Distance       | `DistanceWalkingRunning`            | `Distance`        | contrôle de vitesse                                    |
| Séances        | `HKWorkout`                         | `ExerciseSession` | quêtes « Bouger » / « S'étirer », pierre, eau, énergie |

L'app n'écrit jamais dans les données de santé.

## Règles

- Une activité venant du téléphone compte à **100 %** (la saisie manuelle à 50 %) et passe par
  les mêmes contrôles de plausibilité que les autres.
- **Jamais de double comptage** : chaque séance et chaque heure de pas a un identifiant
  stable ; les pas d'une heure qui recoupe une séance sont ignorés (ils sont déjà dedans).
- **Strava et Santé ensemble** : si une même course arrive par les deux, la règle
  « chevauchement : seule la plus longue compte » n'en garde qu'une.
- Seules les activités **du jour** sont importées.
- iOS ne dit pas si la lecture a été refusée : un refus donne simplement « aucune donnée ».
  Vérifier alors **Réglages → Santé → Accès aux données → SportMotion**.

## Où est le code

| Fichier                                                         | Rôle                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------- |
| `src/activity/bridges/healthKit.ios.ts`                         | pont Apple Santé (`@kingstinct/react-native-healthkit`) |
| `src/activity/bridges/healthConnect.android.ts`                 | pont Health Connect (`react-native-health-connect`)     |
| `src/activity/bridges/*.ts` (sans suffixe)                      | version vide pour les autres plateformes                |
| `src/activity/HealthKitProvider.ts`, `HealthConnectProvider.ts` | statuts, autorisations, lecture                         |
| `src/activity/healthMapping.ts`                                 | conversion séances / pas → activités du jeu             |
| `src/activity/healthSync.ts`                                    | connexion, synchronisation automatique                  |
| `src/ui/HealthSourceRow.tsx`                                    | ligne du profil                                         |
| `app.json`                                                      | description d'usage, permissions, plugins               |

## Limites connues

- Les ponts ne sont pas testés sur appareil (voir plus haut).
- Pas de synchronisation en arrière-plan : l'import se fait quand l'app est ouverte.
- Les activités d'hier non importées avant minuit ne sont pas rattrapées.
- Avec le backend, le serveur accepte ce que l'appareil déclare. Pour durcir contre la
  triche : App Attest (iOS) / Play Integrity (Android), non faits.

## Publication

- **App Store** : expliquer l'usage des données de santé ; elles ne doivent servir ni à la
  publicité ni à la revente (règle 5.1.3).
- **Google Play** : remplir la déclaration Health Connect et fournir une politique de
  confidentialité.
