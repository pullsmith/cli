import http from "http";
import { exec, spawn } from "child_process";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { getRepoRemoteUrl } from "../lib/git.js";
import { saveToken as saveTokenLocally } from "../lib/auth.js";
import { PULLSMITH_BASE_URL } from "../lib/config.js";
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const PORT = 9421;
const AUTH_MODES = {
    apiKey: "api_key",
    subscription: "subscription",
};

const CLAUDE_AUTH_ENV_NAMES = {
    [AUTH_MODES.apiKey]: "ANTHROPIC_API_KEY",
    [AUTH_MODES.subscription]: "CLAUDE_CODE_OAUTH_TOKEN",
};

export async function init() {
    let repoUrl;
    let authMode;

    try {
        repoUrl = getRepoRemoteUrl();
        authMode = await askClaudeAuthMode();
        await prepareClaudeAuth(authMode, repoUrl);
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }

    const connectUrl = `${PULLSMITH_BASE_URL}/connect?repo=${encodeURIComponent(repoUrl)}`;

    console.log("Opening browser to authenticate...");

    if (process.platform === "darwin") {
        // macOS
        exec(`open "${connectUrl}"`);
    } else if (process.platform === "win32") {
        exec(`start "" "${connectUrl}"`);
    } else {
        exec(`xdg-open "${connectUrl}"`);
    }


    try {
        await waitForNextJsInternalToken(repoUrl, authMode);
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}

function createPullsmithFile(){
    try {
        const filePath = join(process.cwd(), ".pullsmith");

        if (existsSync(filePath)) {
            console.log(".pullsmith file already exits, skipping.");
            return;
        }

        const promptPath = new URL("../../src/utils/templates/prompt.yaml", import.meta.url);
        const prompt = readFileSync(promptPath, "utf8");

        writeFileSync(filePath, prompt, "utf8");

        console.log(".pullsmith file created!");
    } catch (err) {
        throw new Error("☹️ Failed to create local .pullsmith file.");
    }
}

function getGithubWorkflowContent(secretName, authMode) {
  const templatePath = new URL("../../src/utils/templates/workflow.yaml", import.meta.url);
  return readFileSync(templatePath, "utf8")
      .replaceAll("__SECRET_NAME__", secretName)
      .replaceAll("__CLAUDE_AUTH_ENV_NAME__", CLAUDE_AUTH_ENV_NAMES[authMode]);
}

function createGithubWorkflowFile(secretName, authMode) {
    try {
        const dirPath = join(process.cwd(), ".github", "workflows");
        const filePath = join(dirPath, "pullsmith.yaml");

        if (existsSync(filePath)) {
            console.log("Workflow file already exists, skipping.");
            return;
        }

        mkdirSync(dirPath, { recursive: true });

        writeFileSync(filePath, getGithubWorkflowContent(secretName, authMode), "utf8");

        console.log("✅ Workflow file created at .github/workflows/pullsmith.yaml");
    } catch (err) {
        throw new Error(`Failed to create Github workflow file: ${err.message}`);
    }
}

function deleteWorkflowFile() {
    try {
        // .github/workflows/pullsmith.yaml
        const filePaths = [
            join(process.cwd(), ".github", "workflows", "pullsmith.yaml"),
            join(process.cwd(), ".github", "workflows", "pullsmith.yml"),
        ];

        for (const filePath of filePaths) {
            if (!existsSync(filePath)) continue;

            rmSync(filePath);
            console.log("🗑️  Removed old workflow file.");
        }
    } catch (err) {
        throw new Error("☹️ Failed to delete local .pullsmith file.");
    }
}

// We only get this token if Github auth is successful.
//
// The browser visits this local server twice:
//   1. /callback?token=... — GitHub auth done. We verify the Claude secret, write the
//      workflow file, then hand the browser off to the Sentry connect flow (302).
//   2. /sentry-done        — Sentry connect finished and /api/sentry/setup bounced the
//      browser back here, so the terminal can confirm and exit.
function waitForNextJsInternalToken(repoUrl, authMode) {
    return new Promise((resolve, reject) => {
        let settled = false;

        const finish = (fn, arg) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            server.close();
            fn(arg);
        };

        const server = http.createServer(async (req, res) => {
            const url = new URL(req.url, `http://localhost:${PORT}`);

            // Step 2: Sentry connect bounced back.
            if (url.pathname === "/sentry-done") {
                const error = url.searchParams.get("error");

                res.writeHead(200, { "Content-Type": "text/html" });
                res.end("<!doctype html><meta charset=\"utf-8\"><p>Sentry connected! You can close this tab and return to your terminal.</p>");

                if (error) {
                    console.warn(`⚠️  Sentry connect did not complete (${error}). Core setup is done; you can connect Sentry later.`);
                } else {
                    console.log("✅ Sentry connected!");
                }

                console.log("Authenticated successfully!");
                finish(resolve);
                return;
            }

            // Step 1: GitHub auth callback carrying the internal token.
            const internalNextJSToken = url.searchParams.get("token");

            if (internalNextJSToken) {
                saveTokenLocally(internalNextJSToken);
                deleteWorkflowFile();
                createPullsmithFile();

                try {
                    const secretName = await checkThatClaudeSecretIsInSecrets(internalNextJSToken, repoUrl, authMode);
                    createGithubWorkflowFile(secretName, authMode);

                    // Hand the browser off to the Sentry connect flow. Keep the server
                    // open; it resolves when Sentry bounces back to /sentry-done.
                    console.log("Opening Sentry to connect your account...");
                    res.writeHead(302, {
                        Location: `${PULLSMITH_BASE_URL}/api/sentry/install?token=${internalNextJSToken}`,
                    });
                    res.end();
                } catch (err) {
                    res.writeHead(500);
                    res.end(err.message);
                    finish(reject, err);
                }

                return;
            }

            res.writeHead(404);
            res.end();
        });

        // Don't hang forever if the user abandons the Sentry step — core setup
        // (GitHub auth, Claude check, workflow file) already succeeded by then.
        const timeout = setTimeout(() => {
            console.warn("⚠️  Timed out waiting for Sentry connection. Core setup is done; you can connect Sentry later.");
            finish(resolve);
        }, 5 * 60 * 1000);

        server.listen(PORT, () => {
            console.log(`Waiting for authentication on port ${PORT}...`);
        });

        server.on("error", (err) => finish(reject, err));
    });
}

async function askClaudeAuthMode() {
    while (true) {
        const answer = await ask(`Do you want to use a Claude API key or your Claude subscription?
  1. API key
  2. Subscription

Choose 1 or 2: `);

        const normalized = answer.trim().toLowerCase();

        if (["1", "api", "api key", "apikey", "key"].includes(normalized)) {
            return AUTH_MODES.apiKey;
        }

        if (["2", "subscription", "sub"].includes(normalized)) {
            return AUTH_MODES.subscription;
        }

        console.log("Please choose 1 or 2.");
    }
}

async function prepareClaudeAuth(authMode, repoUrl) {
    const secretsUrl = getGithubSecretsUrl(repoUrl);

    if (authMode === AUTH_MODES.apiKey) {
        console.log(`Add your Claude API key as ANTHROPIC_API_KEY or CLAUDE_API_KEY here:\n${secretsUrl}`);
        await confirmGithubSecretWasAdded("API key");
        return;
    }

    console.log("Running `claude setup-token` to create a Claude subscription token.");
    await runClaudeSetupToken();

    console.log(`Add the token as a GitHub Actions secret named CLAUDE_CODE_OAUTH_TOKEN here:\n${secretsUrl}`);

    await confirmGithubSecretWasAdded("token");
}

async function confirmGithubSecretWasAdded(secretLabel) {
    while (true) {
        const answer = await ask(`Have you pasted your ${secretLabel} in GitHub Actions?
  1. Yes
  2. No

Choose 1 or 2: `);

        const normalized = answer.trim().toLowerCase();

        if (["1", "yes", "y"].includes(normalized)) {
            return;
        }

        if (["2", "no", "n"].includes(normalized)) {
            throw new Error("Add the Claude credential to GitHub Actions secrets, then run `pullsmith init` again.");
        }

        console.log("Please choose 1 or 2.");
    }
}

function ask(prompt) {
    const rl = createInterface({ input, output });

    return rl.question(prompt).finally(() => rl.close());
}

function runClaudeSetupToken() {
    return new Promise((resolve, reject) => {
        const child = spawn("claude", ["setup-token"], { stdio: "inherit" });

        child.on("error", (err) => {
            reject(new Error(`Failed to run \`claude setup-token\`: ${err.message}`));
        });

        child.on("close", (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error("`claude setup-token` did not complete successfully."));
        });
    });
}

function getGithubSecretsUrl(repoUrl) {
    const match = repoUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);

    if (!match) {
        throw new Error("Invalid GitHub repo URL.");
    }

    return `https://github.com/${match[1]}/${match[2]}/settings/secrets/actions/new`;
}

const missingClaudeSecretsMsg = (secretUrl, authMode) => authMode === AUTH_MODES.subscription
    ? `❌ No Claude subscription token found in Github Actions secrets.\n
    Please add your Claude subscription token at:
    ${secretUrl}
    Make sure to name it: CLAUDE_CODE_OAUTH_TOKEN
`
    : `❌ No Anthropic API key found in Github Actions secrets.\n
    Please add your Claude API key at:
    ${secretUrl}
    Make sure to name it: ANTHROPIC_API_KEY or CLAUDE_API_KEY
`;

async function checkThatClaudeSecretIsInSecrets(nextJsInternalToken, repoUrl, authMode) {
    try {
        const response = await fetch(`${PULLSMITH_BASE_URL}/api/init`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${nextJsInternalToken}`
            },
            body: JSON.stringify({ repo: repoUrl, authMode })
        });

        const data = await response.json();

        if (!response.ok) {
            // if the github token access has expired this fires
            throw new Error(data.error ?? "Problem with Github Auth") ;
        }

        if (data.secretName) {
            console.log(`✅ You have a Claude credential in Github Actions: ${data.secretName}`);
            return data.secretName;
        } else {
            throw new Error(missingClaudeSecretsMsg(data.secretsUrl, authMode))
        }

    } catch (err) {
        throw new Error(err.message ?? 'Failed to find Claude credential in Github Actions.');
    }
}
