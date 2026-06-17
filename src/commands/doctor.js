import { getToken } from "../lib/auth.js";
import { getRepoRemoteUrl } from "../lib/git.js";
import { PULLSMITH_BASE_URL } from "../lib/config.js";

export async function doctor() {
    let token;
    let repo;

    try {
        token = getToken();
        repo = getRepoRemoteUrl();
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }

    try {
        const response = await fetch(`${PULLSMITH_BASE_URL}/api/doctor`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ repo })
        });

        if (!response.ok) {
            const text = await response.text();
            const error = getResponseError(text);
            console.error(error ?? "Pullsmith doctor failed.");
            process.exit(1);
        }

        console.log("Pullsmith doctor passed.");
    } catch (err) {
        console.error(err.message ?? "Pullsmith doctor failed.");
        process.exit(1);
    }
}

function getResponseError(text) {
    if (!text) return null;

    try {
        const data = JSON.parse(text);
        return data?.error ?? text;
    } catch {
        return text;
    }
}
