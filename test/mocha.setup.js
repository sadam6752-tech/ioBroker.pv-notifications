// @ts-check
const path = require('path');

// Set timeout for all tests
exports.mochaHooks = {
  beforeAll() {
    this.timeout(60000); // 60 seconds
  },
  afterAll() {
    // Cleanup
  }
};
