import { execSync } from "child_process";

export function getRemoteUrl(){
    try {
        return execSync("git remote get-url origin").toString().trim();
    } catch (err) {
        throw new Error("Unable to get remote git url");
    } 
}

export function parseRepoInfo(remoteUrl) {
  const match = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
  if (!match) throw new Error("Could not parse GitHub repo info from remote URL.");
  return { owner: match[1], repo: match[2] };
}

