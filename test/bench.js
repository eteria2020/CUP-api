  var benchrest = require('bench-rest');
  var flow = 'https://localhost:8023/v2/';  // can use as simple single GET

  // OR more powerfully define an array of REST operations with substitution
  // This does a unique PUT and then a GET for each iteration
  var flow = {
    main: [
      { put: 'https://localhost:8023/v2/trips/#{INDEX}', json: 'mydata_#{INDEX}' },
      { get: 'https://localhost:8023/v2/trips/#{INDEX}' }
    ]
  };

  // if the above flow will be used with the command line runner or
  // programmatically from a separate file then export it.
  module.exports = flow;

  // There are even more flow options like setup and teardown, see detailed usage

  var runOptions = {
    limit: 1000,     // concurrent connections
    iterations: 1000,  // number of iterations to perform
    user: 'bob',
    password: 'secret',
  };
  benchrest(flow, runOptions)
    .on('error', function (err, ctxName) { console.error('Failed in %s with err: ', ctxName, err); })
    .on('end', function (stats, errorCount) {
      console.log('error count: ', errorCount);
      console.log('stats', stats);
    });