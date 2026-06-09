#!/usr/bin/env node

import { init } from "../src/commands/init.js"
import { push } from "../src/commands/push.js"

const command = process.argv[2];

if (command == "init"){
    init();
} else if(command == "push"){
    push();
} else {
    console.log("Usage: pullsmith <command>");
    console.log("Commands: init");
}



// console.log("pullsmith v0.0.1");


