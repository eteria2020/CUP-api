#!/usr/bin/env nodemon -e js,ls

'use strict';

// https://bob:secret@localhost:8023/v2/cars

// INIT
var restify = require('restify');
var pg = require('pg');
var fs = require('fs');
var passport = require('passport');
var BasicStrategy = require('passport-http').BasicStrategy;
var conString = "postgres://sharengo:sharengo@192.168.33.24/sharengo";
var port = process.env.PORT || 8023;
var server;

//restify.CORS.ALLOW_HEADERS.push('Accept-Encoding');
//restify.CORS.ALLOW_HEADERS.push('Accept-Language');

// / INIT 


/* auth */

	/**
	 * Validate user agains postgres
	 * @param  urlencoded string   	user 
	 * @param  md5 string 		   	pass
	 * @param  function 			fn  callback
	 * @return array        		error, result
	 */
	function validateUser(user, pass, fn) {
	    pg.connect(conString, function(err, client, done) {
	        if (err) {
	            console.error('error fetching users from pool', err);
	            return fn(null, null);
	        }console.log(user,pass);
	        client.query('SELECT name,password,surname,gender,country,province,town,address,zip,phone,mobile,pin,discount_rate FROM customers WHERE email=$1 AND password=$2 LIMIT 1', [user, pass], function(err, result) {
	            // release the client back to the pool
	            done();

	            if (err) {
	                console.error('error running query', err);
	                return fn(null, null);
	            }
	            return fn(null, result.rows[0]);
	        });
	    });
	}


	/**
	 * node-passport basic strategy auth
	 */
	passport.use(new BasicStrategy({},
	    function(username, password, done) {
	        process.nextTick(function() {
	        	console.log(asd);
	            validateUser(username, password, function(err, user) {
	                if (err) {
	                    return done(err);
	                }
	                if (!user) {
	                    console.log(user);
	                    return done(null, false);
	                }
	                if (user.password != password) {
	                    console.log(1);
	                    return done(null, false);
	                }
	                user.username = user.nome;
	                console.log('\n\n UTENTE : ' + user.email);
	                console.log(' PASSWORD : ' + user.password + '\n\n');
	                return done(null, user);
	            })
	        });
	    }
	));

/* / auth */


/* server */

	server = restify.createServer({
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
	server.use(restify.CORS());

	server.listen(port);

/* / server */

/* errors */

	server.on('InternalServerError', function(req, res, err, cb) {
	    err._customContent = 'Error';
	    console.log('Error');
	    return cb();
	});

	server.on('ResourceNotFound', function(req, res, err, cb) {
	    err._customContent = 'Not found';
	    console.log('Not found');
	    console.log(err);
	    return cb();
	});

/* /errors */



/* routes */

	server.get(
		'/v2/user', 
		passport.authenticate('basic', {session: false}), 
		getUser
	);

	server.get(
		'/v2/cars', 
		passport.authenticate('basic', {session: false}), 
		getCars
	);

	server.get(
		'/v2/cars:plate', 
		passport.authenticate('basic', {session: false}), 
		getCars
	);


	server.get('/v2/reservations', getReservations);
	server.get('/v2/trips', getTrips);
	server.get('/v2/trips/:id', getTrips);

	server.post('/v2/reservations', postReservations);

	server.del('/v2/reservations/:id', delReservations);

	server.put('/v2/trips/:id', putTrips);

/* / routes */


/* GET */
	/**
	 * get user details
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	function getUser(req, res, next) {
	    sendOutJSON(200,'',req.user);
	    return next();
	}

	function getCars(req, res, next) {
		pg.connect(conString, function(err, client, done) {
	        if (err) {
	            console.error('error fetching cars from pool', err);
	            return false;
	        }

	        var query = '',params;
	        if(req.params.plate === undefined){
	        	query = "SELECT plate,model,maker,lat,lon,internal_cleanliness,external_cleanliness,fuel_percentage FROM cars WHERE ST_Distance_Sphere(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),ST_SetSRID(ST_MakePoint($2, $1), 4326)) < $3";
	        	params = [req.headers.lat, req.headers.lon, req.headers.radius];
	        }else{
	        	query = "SELECT plate,model,maker,lat,lon,internal_cleanliness,external_cleanliness,fuel_percentage FROM cars WHERE plate = $1";
	        	params = [req.params.plate];
	        }

	        client.query(
	        	query, 
	        	params, 
	        	function(err, result) {
		            done();

		            if (err) {
		                console.error('error running query', err);
		                return false;
		            }
		            sendOutJSON(200,'',result.rows);
		           
	        	}
	        );
	    });
	    return next();
	}

	function getReservations(req, res, next) {
	    res.send(req.params);
	    return next();
	}

	function getTrips(req, res, next) {
	    res.send(req.params);
	    return next();
	}

/* / GET */

/* POST */
	/**
	 * get user details
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	function postReservations(req, res, next) {
	    res.send({
	        'Active': req.headers.active,
	        'Quantity': req.headers.quantity,
	        'From': req.headers.from,
	        'To': req.headers.to,
	    });
	    return next();
	}

/* / POST */


/* DELETE */
	/**
	 * get user details
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	function delReservations(req, res, next) {
	    res.send(req.params);
	    return next();
	}

/* / DELETE */

/* PUT */
	/**
	 * get user details
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	function putTrips(req, res, next) {
	    res.send(req.params);
	    return next();
	}

/* / PUT */



/* EXTRA FUNCTIONS */

	function sendOutJSON(status,reason,data){
	    res.send(status, {
	        'status': status,
	        'reason': reason,
	        'data': data,
	        'time': Date.now() / 1000 | 0,
	    });
	}


/* /EXTRA FUNCTIONS */