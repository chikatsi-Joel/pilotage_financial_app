/**
 * Fixe la version du Firebase Android BoM utilisée par @react-native-firebase.
 *
 * Pourquoi : @react-native-firebase 27.1 embarque le BoM 35.x, dont firebase-auth 25.0.0 est
 * compilé avec Kotlin 2.4. Expo SDK 58 compile en Kotlin 2.2, qui ne lit que jusqu'aux
 * métadonnées 2.3 → « Module was compiled with an incompatible version of Kotlin ».
 * Le BoM 34.19.0 (firebase-auth 24.2.0, métadonnées Kotlin 2.3) est compatible.
 * À retirer quand Expo passera à Kotlin ≥ 2.3.
 *
 * Mécanisme documenté par react-native-firebase (« Overriding Native SDK Versions ») :
 * project.ext['react-native'].versions.firebase.bom dans le build.gradle racine.
 */
const { withProjectBuildGradle } = require("expo/config-plugins");

const MARKER = "// @lucia firebase-bom";

module.exports = function withFirebaseBom(config, { bom = "34.19.0" } = {}) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy" || cfg.modResults.contents.includes(MARKER)) return cfg;
    cfg.modResults.contents += `
${MARKER}
project.ext {
  set('react-native', [
    versions: [
      firebase: [bom: "${bom}"],
    ],
  ])
}
`;
    return cfg;
  });
};
