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
var validator = require('validator');

var BasicStrategy = require('passport-http').BasicStrategy;
var server;


var defaultDistance = 300;

// exports for modules
var expo = {
	conString: conString,
	pg: pg,
	port: port,
	validator: validator,
	defaultDistance: defaultDistance
}
exports.expo = expo;

var funcs = require('./inc/restFunctions');

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

	        if(
	        	!validator.isEmail(user) || 
	        	!validator.isAlphanumeric(pass) || 
	        	!validator.isByteLength(pass,32,32)
	        ){
	        	console.error(Date.now(),'\n+++++++++++++++++\nvalidation error\n',user,pass);
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
	    name: 'Sharengo',
	    formatters: {
	        'application/json': function customizedFormatJSON( req, res, body ) {
	            if ( body instanceof Error ) {
	                res.statusCode = body.statusCode || 500;

	                if ( body.body ) {
	                	console.log('\nERROR\n\n'+body+'\n===============\n');
	                	res.statusCode = 400;
	                    body = {
	                        status: 400,
	                        reason: "Invalid parameters",
	                        time: Date.now() / 1000 | 0
	                    };
	                } else {
	                    body = {
	                        msg: body.message
	                    };
	                }
	            } else if ( Buffer.isBuffer( body ) ) {
	                body = body.toString( 'base64' );
	            }

	            var data = JSON.stringify( body );
	            res.setHeader( 'Content-Length', Buffer.byteLength( data ) );

	            return data;
        	}
   		}
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

        server.listen({host:'api.sharengo.it',port:port});

/* / server */

/* errors */

	server.on('InternalServerError', function(req, res, err, cb) {
	    err._customContent = 'Error';
	    console.log('InternalServerError',err);
	    return cb();
	});
	server.on('InternalError', function(req, res, err, cb) {
	    err._customContent = 'Error';
	    console.log('InternalError',err);
	    return cb();
	});

	server.on('ResourceNotFoundError', function(req, res, err, cb) {
	    err._customContent = 'Not found';
	    console.log('ResourceNotFound');
	    console.log(err);
	    return cb();
	});


/* /errors */



/* routes */
	// user
	server.get(
		'/v2/user', 
		passport.authenticate('basic', {session: false}), 
		funcs.getUser
	);


	// cars
	server.get(
		'/v2/cars', 
		passport.authenticate('basic', {session: false}), 
		funcs.getCars
	);
	server.get(
		'/v2/cars/:plate', 
		passport.authenticate('basic', {session: false}), 
		funcs.getCars
	);


	// reservations
	server.get(
		'/v2/reservations', 
		passport.authenticate('basic', {session: false}), 
		funcs.getReservations
	);
	server.get(
		'/v2/reservations/:reservation', 
		passport.authenticate('basic', {session: false}), 
		funcs.getReservations
	);
	server.post(
		'/v2/reservations', 
		passport.authenticate('basic', {session: false}), 
		funcs.postReservations
	);
	server.del(
		'/v2/reservations/:id',
		passport.authenticate('basic', {session: false}), 
		funcs.delReservations
	);


	// trips
	server.get(
		'/v2/trips',
		passport.authenticate('basic', {session: false}),
		funcs.getTrips
	);
	server.get(
		'/v2/trips/:id',
		passport.authenticate('basic', {session: false}),
		funcs.getTrips
	);
	server.put(
		'/v2/trips/:id', 
		passport.authenticate('basic', {session: false}),
		funcs.putTrips
	);

/* / routes */




