#!/usr/bin/env node

import { init } from "../src/commands/init.js"
import { validate } from "../src/commands/validate.js"
import { doctor } from "../src/commands/doctor.js"
// import { push } from "../src/commands/push.js"

const command = process.argv[2];

if (command == "init"){
    init();
} else if(command == "validate"){
    validate();
} else if(command == "doctor"){
    doctor();
} else {
    console.log("Usage: pullsmith <command>");
    console.log("Commands: init, validate, doctor");
}



// console.log("pullsmith v0.0.1");
