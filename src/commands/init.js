import http from "http";
import { exec } from "child_process";
import { getRemoteUrl } from "../lib/git.js";
import { saveToken } from "../lib/auth.js";
import { writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const PORT = 9421;

export async function init() {
  let repoUrl;

  try {
    repoUrl = getRemoteUrl();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  // const connectUrl = `https://pullsmith.dev/connect?repo=${encodeURIComponent(repoUrl)}`;
  const connectUrl = `http://localhost:3000/connect?repo=${encodeURIComponent(repoUrl)}`;

  console.log("Opening browser to authenticate...");
  exec(`open "${connectUrl}"`); // mac only for now

  await waitForToken(repoUrl);
}


function createPullsmithFile(){
    const filePath = join(process.cwd(), ".pullsmith");

    if (existsSync(filePath)) {
        console.log(".pullsmith file already exits, skipping.");
        return;
    }


    writeFileSync(filePath, `version: 1
  prompt: |
    On a scale from 1 to 10, how beautiful is my code? Respond with only numbers 1 to 10.
  `, "utf8");


    console.log(".pullsmith file created!");
}




function createWorkflowFile(secretName) {
  const dirPath = join(process.cwd(), ".github", "workflows");
  const filePath = join(dirPath, "pullsmith.yml");

  if (existsSync(filePath)) {
    console.log("Workflow file already exists, skipping.");
    return;
  }

  mkdirSync(dirPath, { recursive: true });

  writeFileSync(filePath, `name: Pullsmith
on:
  workflow_dispatch:
    inputs:
        error:
            description: "Sentry error title"
            required: false
            default: "Sentry error"

jobs:
  run:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v4
      - name: Run Claude Code
        env:
          ANTHROPIC_API_KEY: \${{ secrets.${secretName} }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          git config user.email "bot@pullsmith.dev"
          git config user.name "Pullsmith Bot"
          ERROR="\${{ github.event.inputs.error }}"
          SLUG=$(echo "$ERROR" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//' | cut -c1-50)
          BRANCH="pullsmith/fix-\$SLUG"
          PROMPT=\$(cat .pullsmith | grep -A999 'prompt:' | tail -n +2 | sed 's/^[[:space:]]*//')

          git checkout -b "\$BRANCH"
          npx @anthropic-ai/claude-code -p --dangerously-skip-permissions "\$PROMPT. You are fixing this Sentry error: \$ERROR. ONLY edit the code in the working tree to fix it. Do NOT run git, do NOT commit, do NOT push, and do NOT open a pull request - the surrounding workflow handles all of that."

          git add -A
          if git diff --cached --quiet; then
            echo "No changes produced; nothing to do."
            exit 0;
          fi

          git commit -m "fix: \$ERROR"
          git push origin "\$BRANCH"
          gh pr create --title "\$ERROR" --body "Automated fix by Pullsmith for Sentry error: \$ERROR" --base main --head "\$BRANCH"
`, "utf8");

  console.log("✅ Workflow file created at .github/workflows/pullsmith.yml");
}

function deleteWorkflowFile() {
  // .github/workflows/pullsmith.yml
  const filePath = join(process.cwd(), ".github", "workflows", "pullsmith.yml");
  if (existsSync(filePath)) {
    rmSync(filePath);
    console.log("🗑️  Removed old workflow file.");
  }
}

function waitForToken(repoUrl) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const token = url.searchParams.get("token");

      if (token) {
        saveToken(token);
        deleteWorkflowFile();
        createPullsmithFile();
        const secretName = await checkSecrets(token, repoUrl);
        createWorkflowFile(secretName);

        res.writeHead(200);
        res.end("Authentication successful! You can close this tab.");
        server.close();
        console.log("Authenticated successfully!");
        resolve();
      }
    });

    server.listen(PORT, () => {
      console.log(`Waiting for authentication on port ${PORT}...`);
    });

    server.on("error", reject);
  });
}

async function checkSecrets(pullsmithToken, repoUrl) {
  const response = await fetch("http://localhost:3000/api/init", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${pullsmithToken}`
    },
    body: JSON.stringify({ repo: repoUrl })
  });

  const data = await response.json();

  if (data.secretName) {
    console.log(`✅ Found API key: ${data.secretName}`);
    return data.secretName;
  } else {
    console.log(`\n⚠️  No Anthropic API key found in your repo secrets.`);
    console.log(`   Please add your API key at:`);
    console.log(`   ${data.secretsUrl}`);
    console.log(`   Name it: ANTHROPIC_API_KEY or CLAUDE_API_KEY\n`);
    return "ANTHROPIC_API_KEY"; // default fallback
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
