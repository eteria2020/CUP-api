#!/usr/bin/env nodemon -e js,ls

'use strict';

// https://bob:secret@localhost:8023/v2/cars

var config = require('./config');
var conString = config.conString;
var port = config.port;

// INIT
var restify = require('restify');
var pg = require('pg').native;
var fs = require('fs');
var passport = require('passport');
var BasicStrategy = require('passport-http').BasicStrategy;
var server;

var defaultDistance = 300;

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
	        }
	        client.query('SELECT id,name,password,surname,gender,country,province,town,address,zip_code,phone,mobile,pin,discount_rate,email FROM customers WHERE email=$1 AND password=$2 AND enabled = true LIMIT 1', 
	        	[user, pass], 
	        	function(err, result) {
	            	// release the client back to the pool
		            done();

		            if (err) {
		                console.error('error running query', err);
		                return fn(null, null);
		            }
		            return fn(null, result.rows[0]);
	        	}
	        );
	    });
	}


	/**
	 * node-passport basic strategy auth
	 */
	passport.use(new BasicStrategy({},
	    function(username, password, done) {
	    	//console.log(username,password);
	        process.nextTick(function() {
	            validateUser(username, password, function(err, user) {

	                if (err) {
	                    return done(err);
	                }
	                if (!user) {
	                    return done(null, false);
	                }
	                if (user.password != password) {
	                    return done(null, false);
	                }
	                user.username = user.nome;
	                //console.log('\n\n UTENTE : ' + user.email);
	                //console.log(' PASSWORD : ' + user.password + '\n\n');
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
	// user
	server.get(
		'/v2/user', 
		passport.authenticate('basic', {session: false}), 
		getUser
	);


	// cars
	server.get(
		'/v2/cars', 
		passport.authenticate('basic', {session: false}), 
		getCars
	);
	server.get(
		'/v2/cars/:plate', 
		passport.authenticate('basic', {session: false}), 
		getCars
	);


	// reservations
	server.get(
		'/v2/reservations', 
		passport.authenticate('basic', {session: false}), 
		getReservations
	);
	server.get(
		'/v2/reservations/:reservation', 
		passport.authenticate('basic', {session: false}), 
		getReservations
	);
	server.post(
		'/v2/reservations', 
		passport.authenticate('basic', {session: false}), 
		postReservations
	);
	server.del(
		'/v2/reservations/:id',
		passport.authenticate('basic', {session: false}), 
		delReservations
	);


	// trips
	server.get(
		'/v2/trips',
		passport.authenticate('basic', {session: false}),
		getTrips
	);
	server.get(
		'/v2/trips/:id',
		passport.authenticate('basic', {session: false}),
		getTrips
	);
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
		delete req.user.id;
		delete req.user.password;
		req.user.pin = JSON.parse(req.user.pin).primary;
	    sendOutJSON(res,200,'',req.user);
	    return next();
	}

	/**
	 * get car details
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	function getCars(req, res, next) {
		pg.connect(conString, function(err, client, done) {
	        if(logError(err,'error fetching cars from pool')) return false;
	        var query = '',params = [],queryString = '',isSingle = false;
	        var queryParams = [null,null,null,null];
	        if(typeof  req.params.plate === 'undefined'){
		        if(typeof req.headers.status !== 'undefined'){
	        		queryString += ' AND status = $4 ';
	        		params[3] = req.headers.status;
	        	}
	        	if(typeof req.headers.lat !== 'undefined' &&  typeof req.headers.lon  !== 'undefined'){
	        		queryString += ' AND ST_Distance_Sphere(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),ST_SetSRID(ST_MakePoint($2, $1), 4326)) < $3::int ';
	        		params[0] = req.headers.lat;
	        		params[1] = req.headers.lon;
	        		params[2] = req.headers.radius || defaultDistance;
	        	}
        		query = "SELECT plate,model,manufactures as maker,latitude as lat,longitude as lon,int_cleanliness as internal_cleanliness,ext_cleanliness as external_cleanliness,battery as fuel_percentage FROM cars WHERE true " + queryString;
	        }else{
	        	// single car
	        	query = "SELECT plate,model,manufactures as maker,latitude as lat,longitude as lon,int_cleanliness as internal_cleanliness,ext_cleanliness as external_cleanliness,battery as fuel_percentage FROM cars WHERE plate = $1";
	        	params = [req.params.plate];
	        	isSingle =true; 
	        }

	        client.query(
	        	query, 
	        	params, 
	        	function(err, result) {
		            done();
		            if(logError(err,'query error')) return false;
		            //console.log(result.rowCount);
		            var outJson = !isSingle?result.rows:result.rows[0];
		            sendOutJSON(res,200,'',outJson);		           
	        	}
	        );
	    });
	    return next();
	}

	/**
	 * get reservation details
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	function getReservations(req, res, next) {
		pg.connect(conString, function(err, client, done) {
	        if(logError(err,'error fetching reservations from pool')) return false;
	        var params,reservationQuery = '',isSingle = false;

	        if(typeof  req.params.reservation !== 'undefined'){
	        	reservationQuery = ' AND id = $2';
	        	params = [req.user.id,req.params.reservation];
	        	isSingle = true;
	        }else{
	        	reservationQuery = '';
	        	params = [req.user.id];
	        }

	        client.query(
	        	"SELECT id,extract(epoch from ts::timestamp with time zone)::integer as reservation_timestamp,extract(epoch from beginning_ts::timestamp with time zone)::integer as timestamp_start,active as is_active, car_plate, length FROM reservations WHERE customer_id = $1 " + reservationQuery, 
	        	params, 
	        	function(err, result) {
		            done();
		            if(logError(err,'query error')) return false;
		            var outJson = !isSingle?result.rows:result.rows[0];
		            sendOutJSON(res,200,'',outJson);
		           
	        	}
	        );
	    });
	    return next();
	}


	/**
	 * get trip details
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	function getTrips(req, res, next) {
		pg.connect(conString, function(err, client, done) {
	        if(logError(err,'error fetching trips from pool')) return false;
	        var query = '',params,queryTrip, isSingle = false;
	        if(typeof  req.params.id === 'undefined'){
	        	queryTrip = "";
	        	params = [req.user.id];
	        }else{
	        	queryTrip = " AND id = $2";
	        	params = [req.user.id,req.params.id];
	        	isSingle = true;
	        }
	        client.query(
	        	"SELECT id,car_plate,extract(epoch from timestamp_beginning::timestamp with time zone)::integer as timestamp_start, extract(epoch from timestamp_end::timestamp with time zone)::integer as timestamp_end,km_beginning as km_start,km_end,latitude_beginning as lat_start,latitude_end as lat_end,longitude_beginning as lon_start,longitude_end as lon_end,park_seconds FROM trips WHERE customer_id = $1 "+queryTrip, 
	        	params, 
	        	function(err, result) {
		            done();
		            if(logError(err,'query error')) return false;
		            var outJson = !isSingle?result.rows:result.rows[0];
		            sendOutJSON(res,200,'',outJson);		           
	        	}
	        );
	    });
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
		pg.connect(conString, function(err, client, done) {
	        if(logError(err,'error adding reservation from pool')) return false;
	        client.query(
	        	"INSERT INTO reservations (ts,car_plate,customer_id,beginning_ts,active,length,to_send) VALUES (NOW(),$1,$2,NOW(),true,30,true)", 
	        	[req.params.plate,req.user.id], 
	        	function(err, result) {
		            done();
		            if(logError(err,'error running query')) return false;
		            sendOutJSON(res,200,'','');
		           
	        	}
	        );
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
		pg.connect(conString, function(err, client, done) {
	        if(logError(err,'error deleting reservation from pool')) return false;
	        if(typeof  req.params.id !== 'undefined'){
		        client.query(
		        	"DELETE FROM reservations WHERE id = $1 AND customer_id = $2", 
		        	[req.params.id,req.user.id], 
		        	function(err, result) {
			            done();
			            if(logError(err,'error running query')) return false;
			            sendOutJSON(res,200,'','');
		        	}
		        );
	        }
	    });
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
	/**
	 * outputs json response 
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  string reason 
	 * @param  array data   data to send
	 */
	function sendOutJSON(res,status,reason,data){
	    res.send(status, {
	        'status': status,
	        'reason': reason,
	        'data': data,
	        'time': Date.now() / 1000 | 0,
	    });
	}

	/**
	 * console log errors
	 * @param  bool error true on error
	 * @param  string msg  error message
	 */
	function logError(error,msg){
		if(error){
			console.error(msg);
			return true;
		}else{
			return false;
		}		
	}

/* /EXTRA FUNCTIONS */
