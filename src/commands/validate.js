import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PULLSMITH_BASE_URL } from "../lib/config.js";

export async function validate() {
    await validatePullsmithFile();
}

export async function validatePullsmithFile({ silent = false } = {}) {
    const filePath = join(process.cwd(), ".pullsmith");

    if (!existsSync(filePath)) {
        console.error("Missing .pullsmith file. Run `pullsmith init` first.");
        process.exit(1);
    }

    const file = readFileSync(filePath, "utf8");

    try {
        const response = await fetch(`${PULLSMITH_BASE_URL}/api/validate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ file })
        });

        if (!response.ok) {
            const text = await response.text();
            const error = getResponseError(text);
            console.error(error ?? "Failed to validate .pullsmith file.");
            process.exit(1);
        }

        if (!silent) {
            console.log(".pullsmith is valid.");
        }

        return file;
    } catch (err) {
        console.error(err.message ?? "Failed to validate .pullsmith file.");
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
