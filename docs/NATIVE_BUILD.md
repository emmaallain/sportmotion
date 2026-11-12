# Installer SportMotion sur un téléphone (build natif)

Expo Go suffit pour jouer avec le simulateur, mais **Apple Santé et Health Connect exigent une
version installée de l'app** (un « build natif »), car ils reposent sur des modules natifs
absents d'Expo Go.

> **État** : la configuration est en place et `npx expo prebuild` génère correctement les
> projets iOS et Android (description d'usage Santé, _entitlement_ HealthKit, permissions
> Health Connect, SDK Android minimum 26). **Aucun build n'a pu être lancé ni testé sur un
> appareil** depuis l'environnement de développement (pas de Mac, pas de compte Apple, pas
> de téléphone). Le premier build peut donc demander des ajustements.

## Ce qu'il faut

|                       | iPhone                                                                                       | Android          |
| --------------------- | -------------------------------------------------------------------------------------------- | ---------------- |
| Compte Expo (gratuit) | oui                                                                                          | oui              |
| Compte développeur    | **Apple Developer Program, 99 $/an** (obligatoire pour installer un build EAS sur un iPhone) | aucun            |
| Ordinateur            | n'importe lequel (le build se fait dans le cloud Expo)                                       | n'importe lequel |

Sans compte Apple payant, il reste la compilation locale avec Xcode sur un Mac et un compte
Apple gratuit (signature valable 7 jours) ; la disponibilité de HealthKit dans ce cas est à
vérifier dans Xcode.

## Avant le premier build

1. Choisir un identifiant unique et le mettre dans `app.json`, à la place de
   `com.sportmotion.app` : `expo.ios.bundleIdentifier` et `expo.android.package`
   (par exemple `fr.votrenom.sportmotion`).
2. Installer l'outil et se connecter :

```bash
npm install -g eas-cli
```

```bash
eas login
```

```bash
eas init
```

`eas init` rattache le projet à votre compte Expo (il ajoute un `projectId` dans `app.json`).

## iPhone

```bash
eas device:create
```

Ouvrir le lien affiché sur l'iPhone et installer le profil : cela enregistre l'appareil.
Puis :

```bash
eas build --profile preview --platform ios
```

EAS demande de se connecter au compte Apple et crée les certificats. À la fin (10 à 20 min),
il affiche un QR code : le scanner avec l'iPhone pour installer l'app. Sur iOS 16 et plus,
activer **Réglages → Confidentialité et sécurité → Mode développeur**.

Le profil `preview` produit une app autonome (elle fonctionne sans ordinateur). Pour développer
avec rechargement à chaud, utiliser le profil `development`, puis lancer
`npx expo start --dev-client` et ouvrir l'app.

Dans l'app : **Profil → Sources d'activité → Apple Santé → Connecter**. iOS affiche sa feuille
d'autorisations ; cocher les pas, la distance et les entraînements.

## Android

```bash
eas build --profile preview --platform android
```

Télécharger l'APK depuis le lien affiché et l'installer. Health Connect est intégré à
Android 14+ ; sur Android 13 et antérieurs, installer l'application « Health Connect » depuis
le Play Store. Dans l'app : **Profil → Sources d'activité → Health Connect → Connecter**.

## Après le premier build

Tant que les dépendances natives ne changent pas, inutile de reconstruire : les mises à jour
du code JavaScript passent par `npx expo start --dev-client` (profil `development`) ou par un
nouveau build `preview`.

## Profils (`eas.json`)

| Profil                  | Usage                                                           |
| ----------------------- | --------------------------------------------------------------- |
| `development`           | client de développement sur appareil réel, rechargement à chaud |
| `development-simulator` | idem pour le simulateur iOS (Mac)                               |
| `preview`               | app autonome à installer sur ses propres appareils              |
| `production`            | build pour l'App Store / Play Store                             |
