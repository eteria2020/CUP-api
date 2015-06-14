var pg = require('../index').pg;
var conString = require('../index').conString;
var port = require('../index').port;
var validator = require('../index').validator;

module.exports = {
/* GET */

	/**
	 * get user details
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	getUser: function(req, res, next) {
		if(sanitizeInput(req,res)){
			delete req.user.id;
			delete req.user.password;
			req.user.pin = req.user.pin.primary;
		    sendOutJSON(res,200,'',req.user);
		}
	    return next();
	},

	/**
	 * get car details
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	getCars: function(req, res, next) {
		if(sanitizeInput(req,res)){
			pg.connect(conString, function(err, client, done) {
		        logError(err,'error fetching cars from pool');
		        var query = '',params = [],queryString = '',isSingle = false;
		        var queryParams = [null,null,null,null];
		        var freeCarCond = " AND status = 'operative' AND active IS TRUE AND busy IS FALSE AND hidden IS FALSE ";
    				freeCarCond += " AND plate NOT IN (SELECT car_plate FROM reservations WHERE active is TRUE AND (extract(epoch from beginning_ts::timestamp with time zone)::integer + length *60) >= extract(epoch from NOW()::timestamp with time zone)::integer) ";

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

		        query += freeCarCond; 

		        client.query(
		        	query, 
		        	params, 
		        	function(err, result) {
			            done();
			            logError(err,'query error');
			            var outTxt = result.rowCount>0?'':'No cars found';
			            var outJson = !isSingle?result.rows:result.rows[0];
			            sendOutJSON(res,200,outTxt,outJson);		           
		        	}
		        );
		    });
		}
	    return next();
	},

	/**
	 * get reservation details
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	getReservations: function(req, res, next) {
		if(sanitizeInput(req,res)){
			pg.connect(conString, function(err, client, done) {
		        logError(err,'error fetching reservations from pool');
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
			            logError(err,'query error');
			            var outTxt = result.rowCount>0?'':'No reservation found';
			            var outJson = !isSingle?result.rows:result.rows[0];
			            sendOutJSON(res,200,outTxt,outJson);
			           
		        	}
		        );
		    });
		}
	    return next();
	},


	/**
	 * get trip details
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	getTrips: function(req, res, next) {
		if(sanitizeInput(req,res)){
			pg.connect(conString, function(err, client, done) {
		        logError(err,'error fetching trips from pool');
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
			            logError(err,'query error');
			            var outTxt = result.rowCount>0?'':'No trips found';
			            var outJson = !isSingle?result.rows:result.rows[0];
			            sendOutJSON(res,200,outTxt,outJson);		           
		        	}
		        );
		    });
		}
	    return next();
	},

/* / GET */

/* POST */

	/**
	 * add a reservation
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	
	/**
	 * TODO
	 * values for ts, beginning_ts, length, to_send?
	 * add freeCarCond ?
	 */

	postReservations: function(req, res, next) {
		if(sanitizeInput(req,res)){
			pg.connect(conString, function(err, client, done) {
		        logError(err,'error adding reservation from pool');
		        if(typeof  req.params.plate !== 'undefined' && req.params.plate !=''){
			        client.query(
			        	"INSERT INTO reservations (ts,car_plate,customer_id,beginning_ts,active,length,to_send) VALUES (NOW(),$1,$2,NOW(),true,30,true) RETURNING id", 
			        	[req.params.plate,req.user.id], 
			        	function(err, result) {
				            done();
				            logError(err,'error running insert reservation query');
				            sendOutJSON(res,200,'Reservation created successfully',{'reservation_id':result.rows[0].id});
				           
			        	}
			        );
			    }else{
			    	logError(err,'error running post reservation: plate');
			    	sendOutJSON(res,400,'Invalid parameter',null);
			    }
		    });
		}
	    return next();
	},

/* / POST */


/* DELETE */
	/**
	 * delete a reservation
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	delReservations: function(req, res, next) {
		if(sanitizeInput(req,res)){
			pg.connect(conString, function(err, client, done) {
		        logError(err,'error deleting reservation from pool');
		        if(typeof  req.params.id !== 'undefined'){
			        client.query(
			        	"DELETE FROM reservations WHERE id = $1 AND customer_id = $2", 
			        	[req.params.id,req.user.id], 
			        	function(err, result) {
				            done();
				            logError(err,'error running del reservation query');
				            sendOutJSON(res,200,'Reservation '+ req.params.id +' deleted successfully',null);
			        	}
			        );
		        }
		    });
		}
	    return next();
	},

/* / DELETE */

/* PUT */
	/**
	 * updates trip
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	putTrips: function(req, res, next) {
		if(sanitizeInput(req,res)){
	    	res.send(req.params);
	    }
	    return next();
	},

/* / PUT */
}


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

	/**
	 * console log request
	 * @param  req request
	 */
	function logReq(req){
		console.log(
			"====================\n",
			Date.now(),
			"\n--------------------\n",
			req.query,
			"\n--------------------\n",
			req.headers,
			"\n--------------------\n",
			req.params,
			"\n\n"
			);
	}

	/**
	 * sanitize request data
	 * @param  req reques
	 * @return bool, true ok, false error
	 */
	function sanitizeInput(req,res){
		logReq(req);
		
		if(	(
				(typeof req.params.plate != 'undefined') && 
				(req.params.plate != '') && 
				(
					(!validator.isAlphanumeric(req.params.plate)) ||  
	        		(!validator.isByteLength(req.params.plate,7,8))
	        	)
        	) ||

			(
				(typeof req.headers.status != 'undefined') && 
				(req.headers.status != '') && 
				(!validator.isAlphanumeric(req.headers.status)) 
			) ||

			(
				(typeof req.headers.lat != 'undefined') && 
				(req.headers.lat != '') && 
				(!validator.isFloat(req.headers.lat)) 
			) ||

			(
				(typeof req.headers.lon != 'undefined') && 
				(req.headers.lon != '') && 
				(!validator.isFloat(req.headers.lon)) 
			) ||

			(
				(typeof req.headers.radius != 'undefined') && 
				(req.headers.radius != '') && 
				(!validator.isInt(req.headers.radius)) 
			) ||

			(
				(typeof req.params.reservation != 'undefined') && 
				(req.params.reservation != '') && 
				(!validator.isInt(req.params.reservation)) 
			) ||

			(
				(typeof req.params.id != 'undefined') && 
				(req.params.id != '') && 
				(!validator.isInt(req.params.id)) 
			)

		){
			console.log('\n+++++++++++++++++\nvalidation error\n');
			sendOutJSON(res,400,'Invalid parameters',null);
			return false;
		}else{
			return true;
		}
	}


/* /EXTRA FUNCTIONS */
