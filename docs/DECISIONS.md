# Décisions prises en autonomie

Chaque ligne : la décision, puis sa justification.

## Socle

- **Branche `claude/new-session-i5302j` au lieu de `feat/mvp`** — l'environnement d'exécution impose cette branche et interdit de pousser ailleurs ; le contenu est identique à ce qu'aurait été `feat/mvp`.
- **Expo SDK 58** (React Native 0.88, React 19.3) — dernière version stable au moment de l'installation (`npm view expo version`).
- **Versions des modules lues dans `expo/bundledNativeModules.json`** au lieu de `npx expo install` — l'API Expo de résolution de versions est bloquée par le proxy réseau de l'environnement ; le résultat est le même.
- **Web en mode `single` (SPA), bundler Metro** — le rendu statique côté serveur n'apporte rien à un jeu et complique Skia/AsyncStorage.
- **`canvaskit.wasm` copié dans `public/` par un `postinstall`** (`setup-skia-web public`) et ignoré par git — évite de versionner un binaire de 7 Mo.
- **Skia chargé paresseusement sur le web** (`WithSkiaWeb` + `import()`) — CanvasKit doit être initialisé avant le premier import de `@shopify/react-native-skia`.
- **`Tabs` importé depuis `expo-router/js-tabs`** — l'export depuis `expo-router` est déprécié en SDK 58.
