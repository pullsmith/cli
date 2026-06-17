import http from "http";
import { exec } from "child_process";
import { getRepoRemoteUrl } from "../lib/git.js";
import { saveToken as saveTokenLocally } from "../lib/auth.js";
import { PULLSMITH_BASE_URL } from "../lib/config.js";
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const PORT = 9421;

export async function init() {
    let repoUrl;

    try {
        repoUrl = getRepoRemoteUrl();
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
        await waitForNextJsInternalToken(repoUrl);
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


function getGithubWorkflowContent(secretName) {
  const templatePath = new URL("../../src/utils/templates/workflow.yaml", import.meta.url);
  return readFileSync(templatePath, "utf8").replaceAll("__SECRET_NAME__", secretName);
}


function createGithubWorkflowFile(secretName) {
    try {
        const dirPath = join(process.cwd(), ".github", "workflows");
        const filePath = join(dirPath, "pullsmith.yaml");

        if (existsSync(filePath)) {
            console.log("Workflow file already exists, skipping.");
            return;
        }

        mkdirSync(dirPath, { recursive: true });

        writeFileSync(filePath, getGithubWorkflowContent(secretName), "utf8");

        console.log("✅ Workflow file created at .github/workflows/pullsmith.yml");
    } catch (err) {
        throw new Error(`Failed to create Github workflow file: ${err.message}`);
    }
}

function deleteWorkflowFile() {
    try {
        // .github/workflows/pullsmith.yml
        const filePath = join(process.cwd(), ".github", "workflows", "pullsmith.yml");
        if (existsSync(filePath)) {
            rmSync(filePath);
            console.log("🗑️  Removed old workflow file.");
        }
    } catch (err) {
        throw new Error("☹️ Failed to delete local .pullsmith file.");
    }
}

// We only get this token if Github auth is successful
function waitForNextJsInternalToken(repoUrl) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            const url = new URL(req.url, `http://localhost:${PORT}`);
            const internalNextJSToken = url.searchParams.get("token");

            if (internalNextJSToken) {
                saveTokenLocally(internalNextJSToken);
                deleteWorkflowFile();
                createPullsmithFile();

                try {
                    const secretName = await checkThatClaudeAPIKeyIsInSecrets(internalNextJSToken, repoUrl);
                    createGithubWorkflowFile(secretName);

                    res.writeHead(200);
                    res.end("Authentication successful! You can close this tab.");
                    server.close();
                    console.log("Authenticated successfully!");
                    resolve();
                } catch (err) {
                    reject(err);
                }
            }
        });

        server.listen(PORT, () => {
            console.log(`Waiting for authentication on port ${PORT}...`);
        });

        server.on("error", reject);
    });
}


const missingClaudeSecretsMsg = (secretUrl) => `❌ No Anthropic API key found in Github Actions secrets.\n
    Please add your Claude API key at:
    ${secretUrl}
    Make sure to name it: ANTHROPIC_API_KEY or CLAUDE_API_KEY
`;


async function checkThatClaudeAPIKeyIsInSecrets(nextJsInternalToken, repoUrl) {
    try {
        const response = await fetch(`${PULLSMITH_BASE_URL}/api/init`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${nextJsInternalToken}`
            },
            body: JSON.stringify({ repo: repoUrl })
        });

        const data = await response.json();

        if (!response.ok) {
            // if the github token access has expired this fires
            throw new Error(data.error ?? "Problem with Github Auth") ;
        }

        if (data.secretName) {
            console.log(`✅ You have a Claude API key in Github Actions: ${data.secretName}`);
            return data.secretName;
        } else {
            throw new Error(missingClaudeSecretsMsg(data.secretsUrl))
        }

    } catch (err) {
        throw new Error(err.message ?? 'Failed to find Claude API key in Github Actions.');
    }
}

// async function checkAnthropicSecret(repoUrl, token) {
//   const { owner, repo } = parseRepoInfo(repoUrl);
//
//   const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/secrets`, {
//     headers: {
//       "Authorization": `Bearer ${token}`,
//       "Accept": "application/vnd.github+json"
//     }
//   });
//
//   const data = await response.json();
//   const secrets = data.secrets || [];
//
//   const hasKey = secrets.some(s => 
//     s.name.includes("ANTHROPIC") || s.name.includes("CLAUDE")
//   );
//
//   if (!hasKey) {
//     const secretsUrl = `https://github.com/${owner}/${repo}/settings/secrets/actions/new`;
//     console.log(`\n⚠️  No Anthropic API key found in your repo secrets.`);
//     console.log(`   Please add your API key at:`);
//     console.log(`   ${secretsUrl}`);
//     console.log(`   Name it: ANTHROPIC_API_KEY or CLAUDE_API_KEY\n`);
//   } else {
//     console.log("✅ Anthropic API key found in repo secrets.");
//   }
// }
