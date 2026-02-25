const path = require("path");
const { tests } = require("@iobroker/testing");

// Run integration tests for the adapter
tests.integration(path.join(__dirname, ".."));
