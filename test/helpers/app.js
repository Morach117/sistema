const request = require('supertest');

function responseRecorder() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function transactionPool(results = []) {
  const executed = [];
  const connection = {
    async beginTransaction() {},
    async execute(statement, parameters) {
      executed.push([statement, parameters]);
      return results.shift() || [[], []];
    },
    async commit() {},
    async rollback() {},
    release() {}
  };

  return {
    executed,
    getConnection: async () => connection,
    ...connection
  };
}

function fakeMigrationPool() {
  const executed = [];

  return {
    executed,
    async execute(statement, parameters) {
      executed.push([statement, parameters]);
      return [[], []];
    }
  };
}

module.exports = { fakeMigrationPool, request, responseRecorder, transactionPool };
