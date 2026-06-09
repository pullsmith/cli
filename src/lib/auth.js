import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const credentialsPath = join(homedir(), ".pullsmith", "credentials");

// Saves generated token from Pullsmith.dev in local machine ./pullsmith/credentials
export function saveToken(token) {
  mkdirSync(join(homedir(), ".pullsmith"), { recursive: true });
  writeFileSync(credentialsPath, JSON.stringify({ token }), "utf8");
}

// Reads the token so the CLI can make authenticated requests to Pullsmith's API
export function getToken() {
  try {
    const file = readFileSync(credentialsPath, "utf8");
    return JSON.parse(file).token;
  } catch {
    throw new Error("Not authenticated. Run `pullsmith init` first.");
  }
}
