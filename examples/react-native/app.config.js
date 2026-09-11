const fs = require("node:fs");
const path = require("node:path");

const appJson = JSON.parse(fs.readFileSync("./app.base.json", "utf8"));

function loadEnv(file) {
  const env = {};
  const p = path.resolve(file);
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

const dotenv = { ...loadEnv(".env.local"), ...loadEnv(".env") };

module.exports = {
  ...appJson,
  extra: {
    ...appJson.extra,
    convexUrl: dotenv.EXPO_PUBLIC_CONVEX_URL,
  },
};
