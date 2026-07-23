const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Custom Expo config plugin to replace deprecated jcenter() with mavenCentral()
 * in react-native-get-sms-android's build.gradle.
 *
 * JCenter was shut down in 2021 and removed from Gradle 9.x+.
 * This plugin patches the library during `expo prebuild` so the fix
 * persists across fresh installs and EAS Build runs.
 */
const withFixJCenter = (config) => {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const buildGradlePath = path.join(
        config.modRequest.projectRoot,
        'node_modules',
        'react-native-get-sms-android',
        'android',
        'build.gradle'
      );

      if (!fs.existsSync(buildGradlePath)) {
        console.warn(
          '[withFixJCenter] build.gradle not found at:',
          buildGradlePath
        );
        return config;
      }

      let content = fs.readFileSync(buildGradlePath, 'utf8');

      if (content.includes('jcenter()')) {
        content = content.replace(/jcenter\(\)/g, 'mavenCentral()');
        fs.writeFileSync(buildGradlePath, content, 'utf8');
        console.log(
          '[withFixJCenter] Replaced jcenter() with mavenCentral() in react-native-get-sms-android/android/build.gradle'
        );
      }

      return config;
    },
  ]);
};

module.exports = withFixJCenter;
