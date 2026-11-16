/**
 * Ajustements de app.json selon le profil EAS.
 *
 * Le HTTP non chiffré (usesCleartextTraffic) n'est utile qu'en développement, où l'app vise le
 * backend local (http://<PC>:8000). Les builds de profil `apk` et `production` parlent au serveur
 * hébergé en HTTPS : on le coupe pour qu'aucune requête ne parte en clair.
 */
const SECURE_PROFILES = new Set(["apk", "production"]);

module.exports = ({ config }) => {
  if (!SECURE_PROFILES.has(process.env.EAS_BUILD_PROFILE)) return config;
  return {
    ...config,
    plugins: config.plugins.map((plugin) =>
      Array.isArray(plugin) && plugin[0] === "expo-build-properties"
        ? [plugin[0], { ...plugin[1], android: { ...plugin[1].android, usesCleartextTraffic: false } }]
        : plugin,
    ),
  };
};
