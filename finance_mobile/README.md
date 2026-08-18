# Finance mobile

Client Expo / React Native du backend de pilotage financier.

## Configuration locale

Définir `EXPO_PUBLIC_API_URL` avec une URL atteignable depuis l'appareil ou
l'émulateur, par exemple `http://192.168.1.20:8000/api/v1`. Ne pas utiliser
`localhost` sur un téléphone physique : il désigne le téléphone lui-même.

## Vérification

```bash
npm run typecheck
```

Les types sont provisoirement maintenus à la main. Ils seront générés depuis
`/openapi.json` lorsque le backend sera démarré.
