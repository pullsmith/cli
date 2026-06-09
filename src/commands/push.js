import { getToken } from "../lib/auth.js";
import { getRemoteUrl } from "../lib/git.js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export async function push() {
    // get the saved token
    let token;
    try {
        token = getToken();
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }

    // read the .pullsmith file
    const filePath = join(process.cwd(), ".pullsmith");
    if (!existsSync(filePath)) {
        console.error("No .pullsmith file found. Run `pullsmith init` first.");
        process.exit(1);
    }
    const config = readFileSync(filePath, "utf8");

    // get the repo url
    let repoUrl;
    try {
        repoUrl = getRemoteUrl();
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }

    // send to api
    const response = await fetch("http://localhost:3000/api/push", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ repo: repoUrl, config })
    });

    const data = await response.json();

    if (data.secretWarning) {
        console.log(data.secretWarning);
    }


    console.log("Job started!", data);
}
