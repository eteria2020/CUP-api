#!/usr/bin/env nodemon -e js,ls
'use strict';

// https://bob:secret@localhost:8023/v2/cars


var restify = require('restify');
var pg = require('pg');
var conString = "postgres://twist:twist@localhost/test";
var fs = require('fs');

var passport = require('passport');
var BasicStrategy = require('passport-http').BasicStrategy;


/* auth */
	var users = [
	    { id: 1, username: 'bob', password: 'secret', email: 'bob@example.com' }
	  , { id: 2, username: 'joe', password: 'birthday', email: 'joe@example.com' }
	];

	function findByUsername(username, fn) {
	  for (var i = 0, len = users.length; i < len; i++) {
	    var user = users[i];
	    if (user.username === username) {
	      return fn(null, user);
	    }
	  }
	  return fn(null, null);
	}

	passport.use(new BasicStrategy({
	  },
	  function(username, password, done) {
	    process.nextTick(function () {      
	      findByUsername(username, function(err, user) {
	        if (err) { return done(err); }
	        if (!user) { return done(null, false); }
	        if (user.password != password) { return done(null, false); }
	        return done(null, user);
	      })
	    });
	  }
	));

/* / auth */


/* server */

	var port = process.env.PORT || 8023;

	var server = restify.createServer({
		certificate: fs.readFileSync('server.crt'),
		key: fs.readFileSync('server.key'),
		name: 'ShareNGo',
	});


	server.use(passport.initialize());

	//server.use(restify.acceptParser(server.acceptable));
	//server.use(restify.authorizationParser());
	//server.use(restify.dateParser());
	server.use(restify.queryParser());
	//server.use(restify.jsonp());
	//server.use(restify.gzipResponse());
	server.use(restify.bodyParser());
	server.use(restify.throttle({
	  burst: 200,
	  rate: 200,
	  ip: true,
	  /*overrides: {
	    '192.168.1.1': {
	      rate: 0,        // unlimited
	      burst: 0
	    }
	  }*/
	}));
	//server.use(restify.conditionalRequest());


	server.listen(port);

/* / server */

/* errors */

	server.on('InternalServerError', function (req, res, err, cb) {
		err._customContent = 'Error';
		console.log('Error');
		return cb();
	});

	server.on('ResourceNotFound', function (req, res, err, cb) {
		err._customContent = 'Not found';
		console.log('Not found');
		return cb();
	});

/* /errors */




/* routes */

	server.get('/v2/user', passport.authenticate('basic', { session: false }),getUser);
	server.get('/v2/cars', passport.authenticate('basic', { session: false }),getCars);
	server.get('/v2/cars/:plate', getCars);
	server.get('/v2/reservations',getReservations);
	server.get('/v2/trips',getTrips);
	server.get('/v2/trips/:id',getTrips);

	server.post('/v2/reservations',postReservations);

	server.del('/v2/reservations/:id',delReservations);

	server.put('/v2/trips/:id',putTrips);

/* / routes */





/* GET */

	function getUser(req, res, next) {
		res.send(req.params);
		return next();
	}

	function getCars(req, res, next) {
		console.log(req.user);
		res.send('Cars' + req.params);
		//console.log(req);
		return next();
	}

	function getReservations(req, res, next) {
		res.send(req.params);
		//console.log(req);
		return next();
	}

	function getTrips(req, res, next) {
		res.send(req.params);
		//console.log(req);
		return next();
	}

/* / GET */

/* POST */

	function postReservations(req, res, next) {
		res.send({
			'Active' 	: req.headers.active,
			'Quantity' 	: req.headers.quantity,
			'From' 		: req.headers.from,
			'To' 		: req.headers.to,
		});
		return next();
	}

/* / POST */


/* DELETE */

	function delReservations(req, res, next) {
		res.send(req.params);
		//console.log(req);
		return next();
	}

/* / DELETE */

/* PUT */

	function putTrips(req, res, next) {
		res.send(req.params);
		//console.log(req);
		return next();
	}

/* / PUT */


/*

function getUsers(){
	pg.connect(conString, function(err, client, done) {
	  if(err) { return console.error('error fetching client from pool', err); }
	  client.query('SELECT * FROM provinces',null, function(err, result) {
	    // release the client back to the pool
	    done();

	    if(err) { return console.error('error running query', err); }
	    console.log(result.rows[0]);
	  });
	});
}*/