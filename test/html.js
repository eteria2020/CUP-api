var apiBenchmark = require('api-benchmark');
var fs = require('fs');

var service = {
  server1: "https://bob:secret@localhost:8023/v2/"
};

var routes = { route1: 'cars', route2: 'trips' };

/*

var routes = {
  route1: {
    method: 'get',
    route: 'getRoute',
    headers: {
      'Cookie': 'cookieName=value',
      'Accept': 'application/json'
    }
  },
  route2: 'getRoute2',
  route3: {
    method: 'post',
    route: 'postRoute',
    data: {
      test: true,
      moreData: 'aString'
    }
  }
};
 */
var options = {
	maxConcurrentRequests :500,
	runMode : 'parallel',
	minSamples : 2000
}
apiBenchmark.measure(service, routes,options, function(err, results){
  apiBenchmark.getHtml(results, function(error, html){
    //console.log(html);
    fs.writeFile("graph.html", html, function(err) {
	    if(err) {
	        return console.log(err);
	    }

	    console.log("The file was saved!");
	}); 
  });
});