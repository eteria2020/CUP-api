#!/usr/bin/env nodemon -e js,ls

'use strict';

// https://bob:secret@localhost:8023/v2/cars

var config = require('./config');
var conString = config.conString;
var standardPort = config.port;
var unsecurePort =  config.unsecurePort;
var logPath = config.logPath;

// INIT
var restify = require('restify');
var pg = require('pg');
pg.defaults.poolSize = 25;
pg.defaults.poolIdleTimeout=5000; // 5 sec

var fs = require('fs');
var passport = require('passport');
var passportiOS = require('passport');
var validator = require('validator');
var morgan = require('morgan');
var bunyan = require('bunyan');

var BasicStrategy = require('passport-http').BasicStrategy;
var server;
var unsecureServer;
var log = bunyan.createLogger({
  name: "ws",
  streams: [{
    path : logPath + 'webservices.log'
  }],
  serializers: restify.bunyan.serializers
});


var defaultDistance = 300;

// exports for modules
var expo = {
	conString: conString,
	pg: pg,
	port: standardPort,
	validator: validator,
	defaultDistance: defaultDistance
}
exports.expo = expo;

fs.existsSync(logPath) || fs.mkdirSync(logPath)

var accessLogStream = fs.createWriteStream(logPath + 'webservices_access.log', {flags: 'a'})

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
	    	done();
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
	        	console.log(validator.isEmail(user),validator.isAlphanumeric(pass),validator.isByteLength(pass,32,32));
                log.error('Validation error %s,%s',user,pass);
	            return fn(null, null);
	        }

	        client.query('SELECT id,enabled,password FROM customers WHERE LOWER(email)=$1 LIMIT 1',
	        	[user],
	        	function(err, result) {
	            	// release the client back to the pool
		            done();

		            if (err) {
	                	console.error('error running query', err);
                        log.error('Error running query', err);
		                return fn(null, null);
		            }else if ( result.rows.length<=0) {
		                return fn(null, 1);
		            }else if ( typeof result.rows[0] !== 'undefined' && !result.rows[0].enabled) {
		                return fn(null, 2);
		            }else if ( result.rows[0].password != pass) {
		                return fn(null, 3);
		            }else{
						client.query('SELECT id,name,password,surname,gender,country,province,town,address,zip_code,phone,mobile,pin,discount_rate,email,card_code,enabled,\'0\' as bonus FROM customers WHERE LOWER(email)=$1 AND password=$2 AND enabled = true LIMIT 1',
				        	[user, pass],
				        	function(err, result) {
				            	// release the client back to the pool
					            done();

					            if (err) {
					                console.error('error running query', err);
			                        log.error('Error running query', err);
					                return fn(null, null);
					            }
					            return fn(null, result.rows[0]);
				        	}
				        );
		            }
	        	}
	        );
	        console.log('End validation', user, pass);
	        log.error('End validation', user, pass);
	    });
	}


	/**
	 * node-passport basic strategy auth
	 */
	passport.use(new BasicStrategy({},
	    function(username, password, done) {
	    	username = username.trim().toLowerCase();
	    	console.log(username,password);
	        process.nextTick(function() {
	            validateUser(username, password, function(err, user) {
	                if (err) {
	               		return done(err);
	                }
					if( user === 1){
						var err = new Error('not_found');
						err.statusCode = 404;
						return done(err);
                	}
                	if( user === 2) {
                		var err = new Error('user_disabled');
						err.statusCode = 403;
						return done(err);
	                }
	                if( user === 3) {
                		var err = new Error('invalid_credentials');
						err.statusCode = 403;
						return done(err);
	                }
	                if (!user) {
	                    return done(null, false);
	                }
	                if (user.password != password) {
	                	console.log('passport 6');
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
	
	passportiOS.use(new BasicStrategy({},
	    function(username, password, done) {
	    	username = username.trim().toLowerCase();
	    	console.log(username,password);
	        process.nextTick(function() {
	            validateUser(username, password, function(err, user) {
	                if (err) {
	               		return done(err);
	                }
					if( user === 1){
						var err = new Error('not_found');
						err.statusCode = 404;
						return done(err);
                	}
                	if( user === 2) {
                		var err = new Error('user_disabled');
						err.statusCode = 405;
						return done(err);
	                }
	                if( user === 3) {
                		var err = new Error('invalid_credentials');
						err.statusCode = 406;
						return done(err);
	                }
	                if (!user) {
	                    return done(null, false);
	                }
	                if (user.password != password) {
	                	console.log('passportiOS 6');
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

/* register server */

function registerServer(server) {

	server.use(passport.initialize());
	server.use(passportiOS.initialize());

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

    server.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" - :response-time ms',{ stream : accessLogStream}));

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

server.on('uncaughtException', function (req, res, route, err) {
  console.log('======= server uncaughtException');
  console.log(err);
  res.send(200, { handler: 'server uncaughtException'});
 /* if (err.status <= 399 && err.status >= 500) {
    process.nextTick( process.exit(1) );
  }*/
  // handleError(req, res, route, err);
});
process.on('uncaughtException', function (err) {
  console.log('==== process uncaughtException');
  err = err || {};
  console.log('======== ', arguments);
  /*if (!(err.status >= 400 && err.status <= 499)) {
    process.nextTick( process.exit(1) );
  }*/
});
/* /errors */



/* routes */
	// user
	server.get(
		'/v2/user',
		passport.authenticate('basic', {session: false}),
		funcs.getUser
	);
	
	
	// useriOS
	server.get(
		'/v3/user',
		passportiOS.authenticate('basic', {session: false}),
		funcs.getUser
	);


	// cars
	server.get(
		'/v2/cars',
		//passport.authenticate('basic', {session: false}),
		funcs.getCars
	);
	server.get(
		'/v3/cars',
		//passport.authenticate('basic', {session: false}),
		funcs.getCarsLight
	);
	server.get(
		'/v3/cars/:plate',
		//passport.authenticate('basic', {session: false}),
		funcs.getCarsLight
	);
	server.get(
		'/v2/cars/:plate',
		//passport.authenticate('basic', {session: false}),
		funcs.getCars
	);

    server.put(
        '/v2/cars/:plate',
        passport.authenticate('basic', {session: false}),
        funcs.putCars
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

	server.get(
		'/v2/archive/reservations',
		passport.authenticate('basic', {session: false}),
		funcs.getArchiveReservations
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
	server.get(
		'/v2/trips/current',
		passport.authenticate('basic', {session: false}),
		funcs.getTrips
	);
	server.put(
		'/v2/trips/:id',
		passport.authenticate('basic', {session: false}),
		funcs.putTrips
	);
	//v3
	server.get(
		'/v3/trips',
		passport.authenticate('basic', {session: false}),
		funcs.getTripsNew
	);
	server.get(
		'/v3/trips/:id',
		passport.authenticate('basic', {session: false}),
		funcs.getTripsNew
	);
	server.get(
		'/v3/trips/current',
		passport.authenticate('basic', {session: false}),
		funcs.getTripsNew
	);
	
	
	server.pre(function (request, response, next) {
	    request.log.info({ req: request,params:request.params }, 'REQUEST');
	    next();
	});

	// pois
	server.get(
		'/v2/pois',
		//passport.authenticate('basic', {session: false}),
		funcs.getPois
	);
	
	//safo
	server.post(
		'/v2/getLastTrips',
		//passport.authenticate('basic', {session: false}),
		funcs.getLastTrips
	);
	server.put(
		'/v2/chargePenalty',
		//passport.authenticate('basic', {session: false}),
		funcs.chargePenalty
	);

/* / routes */
}

/* / register server */


/* server */

    log.info('Webservice startup');
    var responseFormatter = {
            'application/json': function customizedFormatJSON( req, res, body ) {
	            if ( body instanceof Error ) {
	                res.statusCode = body.statusCode || 500;

	                if ( body.body ) {
	                	console.log('\nERROR\n\n===============\n');
	                	console.log(body);
	                	res.statusCode = 400;
	                    body = {
	                        status: 400,
	                        reason: "Invalid parameters",
	                        time: Date.now() / 1000 | 0
	                    };
	                } else {
	                	if(res.statusCode == 403 || res.statusCode == 404){
	                		body = {
	                			status: res.statusCode,
		                        code: body.message
		                    };
	                	}else{
							body = {
		                        msg: body.message
		                    };
	                	}
	                }
	            } else if ( Buffer.isBuffer( body ) ) {
	                body = body.toString( 'base64' );
	            }

	            var data = JSON.stringify( body );
	            res.setHeader( 'Content-Length', Buffer.byteLength( data ) );

	            return data;
            }
    };


	server = restify.createServer({
	    certificate: fs.readFileSync('ssl/server.cer'),
	    key: fs.readFileSync('ssl/server.key'),
        ca:  fs.readFileSync('ssl/ca.cer'),
        requestCert:        true,
        rejectUnauthorized: true,
	    name: 'Sharengo',
	    formatters: responseFormatter,
	    log: log
	});
    log.info('Created standard server');


    unsecureServer = restify.createServer({
	    name: 'Sharengo',
	    formatters: responseFormatter,
	    log: log
	});
    log.info('Created unsecure debug server');

    registerServer(server);
    registerServer(unsecureServer);

    server.listen({host:'0.0.0.0',port:standardPort});
    log.info('Listen standard server: ' + standardPort);

    unsecureServer.listen({host:'0.0.0.0',port:unsecurePort});
    log.info('Listen unsecure debug server: ' + unsecurePort);

    console.log("Started...");





