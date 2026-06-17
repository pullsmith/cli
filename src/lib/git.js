import { execSync } from "child_process";

export function getRepoRemoteUrl(){
    try {
        return execSync("git remote get-url origin", { stdio: "pipe" }).toString().trim();
    } catch (err) {
        throw new Error("☹️ Looks like you're not inside a Git repo. cd into your project, then try again.");
    } 
}

export function parseRepoInfo(remoteUrl) {
  const match = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
  if (!match) throw new Error("Could not parse GitHub repo info from remote URL.");
  return { owner: match[1], repo: match[2] };
}

