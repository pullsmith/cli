import { getToken } from "../lib/auth.js";
import { getRepoRemoteUrl } from "../lib/git.js";
import { PULLSMITH_BASE_URL } from "../lib/config.js";
import { validatePullsmithFile } from "./validate.js";

export async function push() {
    let token;
    let repo;
    let file;

    try {
        file = await validatePullsmithFile({ silent: true });
        token = getToken();
        repo = getRepoRemoteUrl();
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }

    try {
        const response = await fetch(`${PULLSMITH_BASE_URL}/api/push`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ repo, file })
        });

        const text = await response.text();
        const data = getResponseData(text);

        if (!response.ok) {
            console.error(data?.error || text || "Failed to push .pullsmith file.");
            process.exit(1);
        }

        if (data?.updated === false) {
            console.log(data.message ?? ".pullsmith is already up to date.");
            return;
        }

        console.log(`.pullsmith pushed to ${data?.branch ?? "default branch"}.`);

        if (data?.url) {
            console.log(data.url);
        }
    } catch (err) {
        console.error(err.message ?? "Failed to push .pullsmith file.");
        process.exit(1);
    }
}

function getResponseData(text) {
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}
