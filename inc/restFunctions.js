var expo = require('../index').expo;
var pg = expo.pg;
var conString = expo.conString;
var port = expo.port;
var validator = expo.validator;
var defaultDistance = expo.defaultDistance;

module.exports = {
/* GET */

	/**
	 * get user details
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	getUser: function(req, res, next) {
		var bonus=0;
		if(sanitizeInput(req,res)){
			
			pg.connect(conString, function(err, client, done) {

	            if (err) {
    				done();
    				console.log('Errore getUser connect',err);
  		        	next.ifError(err);
                }

               

				client.query(
		        	"SELECT SUM(residual)as bonus FROM customers_bonus WHERE customer_id=$1 AND (valid_to <now() OR valid_to IS NULL)", 
		        	[req.user.id], 
		        	function(err, result) {
		        		done();
			            if (err) {		    				
		    				console.log('Errore getUser count',err);
		  		        	next.ifError(err);
		                }

			            
			                req.user.bonus=result.rows[0].bonus;
							delete req.user.id;
							delete req.user.password;
							delete req.user.card_code;
							req.user.pin = req.user.pin.primary;
							sendOutJSON(res,200,'',req.user);
			        }
			    );
             });
			
			
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

	            if (err) {
    				done();
    				console.log('Errore getCars connect',err);
  		        	next.ifError(err);
                }

		        var query = '',params = [],queryString = '',isSingle = false;
		        var queryParams = [null,null,null,null];
		        var freeCarCond = " AND status = 'operative' AND active IS TRUE AND busy IS FALSE AND hidden IS FALSE ";
    				freeCarCond += " AND plate NOT IN (SELECT car_plate FROM reservations WHERE active is TRUE) ";
    			// select cars.*, json_build_object('id',cars.fleet_id,'label',fleets.name) as fleet FROM cars left join fleets on cars.fleet_id = fleets.id;
    			var fleetsSelect = ", json_build_object('id',cars.fleet_id,'label',fleets.name) as fleets ";
    			var fleetsJoin = " left join fleets on cars.fleet_id = fleets.id ";

		        if(typeof  req.params.plate === 'undefined'){
			        if(typeof req.params.status !== 'undefined'){
		        		queryString += ' AND status = $4 ';
		        		params[3] = req.params.status;
		        	}
		        	if(typeof req.params.lat !== 'undefined' &&  typeof req.params.lon  !== 'undefined'){
		        		queryString += ' AND ST_Distance_Sphere(ST_SetSRID(ST_MakePoint(cars.longitude, cars.latitude), 4326),ST_SetSRID(ST_MakePoint($2, $1), 4326)) < $3::int ';
		        		params[0] = req.params.lat;
		        		params[1] = req.params.lon;
		        		params[2] = req.params.radius || defaultDistance;
		        	}
	        		query = "SELECT cars.*" + fleetsSelect + " FROM cars " + fleetsJoin + " WHERE true " + queryString;
		        }else{
		        	// single car
		        	query = "SELECT cars.*" + fleetsSelect + " FROM cars " + fleetsJoin + " WHERE plate = $1";
		        	params = [req.params.plate];
		        	isSingle =true; 
		        }
		        if(!isSingle){
		        	query += freeCarCond; 
		        }
		        
		        client.query(
		        	query, 
		        	params,
		        	function(err, result) {
			            done();
			            if (err) {
		    				console.log('Errore getCars select',err);
		  		        	next.ifError(err);
		                }
			            var outTxt = '',outJson = null;
			            console.log('getCars select',err);
			            if((typeof result !== 'undefined') && (result.rowCount>0)){
			            	outJson = !isSingle?result.rows:result.rows[0];
			            }else{
			            	outTxt ='No cars found';
			            }
			            sendOutJSON(res,200,outTxt,outJson);
		        	}
		        );
		    });
		}
	    return next();
	},
	
	getCarsLight: function(req, res, next) {
		if(sanitizeInput(req,res)){
			pg.connect(conString, function(err, client, done) {

	            if (err) {
    				done();
    				console.log('Errore getCars connect',err);
  		        	next.ifError(err);
                }

		        var query = '',params = [],queryString = '',isSingle = false;
		        var queryParams = [null,null,null,null];
		        var freeCarCond = " AND status = 'operative' AND active IS TRUE AND busy IS FALSE AND hidden IS FALSE ";
    				freeCarCond += " AND plate NOT IN (SELECT car_plate FROM reservations WHERE active is TRUE) ";
    			// select cars.*, json_build_object('id',cars.fleet_id,'label',fleets.name) as fleet FROM cars left join fleets on cars.fleet_id = fleets.id;
    			//var fleetsSelect = ", json_build_object('id',cars.fleet_id,'label',fleets.name) as fleets ";
    			var fleetsJoin = " left join fleets on cars.fleet_id = fleets.id ";

		        if(typeof  req.params.plate === 'undefined'){
			        if(typeof req.params.status !== 'undefined'){
		        		queryString += ' AND status = $4 ';
		        		params[3] = req.params.status;
		        	}
		        	if(typeof req.params.lat !== 'undefined' &&  typeof req.params.lon  !== 'undefined'){
		        		queryString += ' AND ST_Distance_Sphere(ST_SetSRID(ST_MakePoint(cars.longitude, cars.latitude), 4326),ST_SetSRID(ST_MakePoint($2, $1), 4326)) < $3::int ';
		        		params[0] = req.params.lat;
		        		params[1] = req.params.lon;
		        		params[2] = req.params.radius || defaultDistance;
		        	}
	        		query = "SELECT cars.plate,cars.longitude as lon,cars.latitude as lat,cars.battery as soc FROM cars " + fleetsJoin + " WHERE true " + queryString;
		        }else{
		        	// single car
		        	query = "SELECT cars.*" + fleetsSelect + " FROM cars " + fleetsJoin + " WHERE plate = $1";
		        	params = [req.params.plate];
		        	isSingle =true; 
		        }
		        if(!isSingle){
		        	query += freeCarCond; 
		        }
		        
		        client.query(
		        	query, 
		        	params,
		        	function(err, result) {
			            done();
			            if (err) {
		    				console.log('Errore getCars select',err);
		  		        	next.ifError(err);
		                }
			            var outTxt = '',outJson = null;
			            console.log('getCars select',err);
			            if((typeof result !== 'undefined') && (result.rowCount>0)){
			            	outJson = !isSingle?result.rows:result.rows[0];
			            }else{
			            	outTxt ='No cars found';
			            }
			            sendOutJSON(res,200,outTxt,outJson);
		        	}
		        );
		    });
		}
	    return next();
	},

    /* PUT */
	/**
	 * updates cars
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	putCars: function(req, res, next) {

        var outCode=200;
   	    var outTxt='';
        var outJson=null;


		if(!sanitizeInput(req,res)){
           outCode=400;
           outTxt="Invalid request";
           sendOutJSON(res,400,outTxt,outJson);
		}  else
  	        if(typeof  req.params.plate !== 'undefined' && req.params.plate !='' &&  typeof req.params.action !== 'undefined'){

             var plate =  req.params.plate;
             var action = req.params.action;

	         pg.connect(conString, function(err, client, done) {

	            if (err) {
    				done();
    				console.log('Errore putCars connect',err);
  		        	next.ifError(err);
                }

                var cmd = '';
                switch (action.toLowerCase()) {
                  case 'open' :
                    cmd = 'OPEN_TRIP';
                    break;
                  case 'close':
                    cmd = 'CLOSE_TRIP';
                    break;
                  case 'park':
                    cmd = 'PARK_TRIP';
                    break;
                  case 'unpark':
                    cmd = 'UNPARK_TRIP';
                    break;

                  default:
                  	done();
                    outTxt = "Invalid action";
                    sendOutJSON(res,400,outTxt,outJson);
                    return next();
                }

				client.query(
		        	"SELECT EXISTS(SELECT plate FROM cars WHERE plate=$1)", 
		        	[plate], 
		        	function(err, result) {
		        		done();
			            if (err) {		    				
		    				console.log('Errore putCars exists',err);
		  		        	next.ifError(err);
		                }

			            if(result.rows[0].exists){
			                if (cmd != '') {
								client.query("SELECT EXISTS(SELECT id FROM trips WHERE timestamp_end IS NULL AND car_plate = $1)",[plate],function(err,resultTripActive){
									done();
									if (err) {		    				
										console.log('Errore if exists trips ',err);
										next.ifError(err);
									}

									if(resultTripActive.rows[0].exists && cmd == 'OPEN_TRIP'){
										console.log('Errore trip active exists',err);
										sendOutJSON(res,400,'Cannot open trip on active car',null);
						            	return next();
									}else{
										var sql = "INSERT INTO commands (car_plate, queued, to_send, command, txtarg1) values ($1, now(), true, $2 , $3 )";
										var params = [ plate , cmd, req.user.card_code ];
										client.query(sql,
											params,
											function(err, result) {
												done();
											    if (err) {		    				
													console.log('Errore putCars insert',err);
										        	next.ifError(err);
											    }

											    outTxt="OK";
											    sendOutJSON(res,200,outTxt,outJson);
											}
										);										
									}
								});
			                } else {
			                  done();
			                }
			            }else{
			            	console.log('Errore getCars NOT exists',err);
			            	sendOutJSON(res,400,'Invalid car plate',null);
		                    return next();
			            }
			        }
			    );
             });



	       } else {
	            outTxt="Invalid parameters";
	            console.error('Invalid putcars parameters', req.params);
	            sendOutJSON(res,400,outTxt,outJson);
		}
	    return next();
	},

/* / PUT */


	/**
	 * get reservation details
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	getReservations: function(req, res, next) {
		if(sanitizeInput(req,res)){
			pg.connect(conString, function(err, client, done) {

	            if (err) {
    				done();
    				console.log('Errore getReservations connect',err);
  		        	next.ifError(err);
                }

		        var params = [],nparam,reservationQuery = '',isSingle = false;

		        if(typeof  req.params.reservation !== 'undefined'){
		        	reservationQuery = ' AND id = $2';
		        	params[0] = req.user.id;
		        	params[1] = req.params.reservation;
		        	isSingle = true;
		        	nparam = 2;
		        }else{
		        	reservationQuery = '';
		        	params[0] = req.user.id;
		        	nparam =1;
		        }

				if(typeof  req.params.active !== 'undefined'){
					if(req.params.active == 'true'){
						reservationQuery += ' AND active IS TRUE';
					}else{
						reservationQuery += ' AND active IS FALSE';
					}		        	
		        }else{
		        	reservationQuery += ' AND active IS TRUE';
		        }
		       

		        if(typeof  req.params.from !== 'undefined'){
		        	reservationQuery += ' AND cast(extract(epoch from ts) as integer) >= $'+(nparam+1);
		        	params[nparam] = req.params.from; 
		        	nparam++;
		        }

		        if(typeof  req.params.to !== 'undefined'){
		        	reservationQuery += ' AND cast(extract(epoch from ts) as integer) <= $'+(nparam+1);
		        	params[nparam] = req.params.to; 
		        	nparam++;
		        }


		         
		        reservationQuery += ' ORDER BY ts DESC';

		        if(typeof  req.params.quantity !== 'undefined'){
		        	reservationQuery += ' LIMIT $'+(nparam+1);
		        	params[nparam] = req.params.quantity; 
		        	nparam++;
		        }

		        client.query(
		        	"SELECT id,extract(epoch from ts::timestamp with time zone)::integer as reservation_timestamp,extract(epoch from beginning_ts::timestamp with time zone)::integer as timestamp_start,active as is_active, car_plate, length FROM reservations WHERE customer_id = $1 " + reservationQuery,
		        	params,
		        	function(err, result) {
			            done();
			            if (err) {
		    				console.log('Errore getReservations select',err);
		  		        	next.ifError(err);
		                }
			            var outTxt = '',outJson = null;
			            console.log('getReservations select done',err);
			            if((typeof result !== 'undefined') && (result.rowCount>0)){
			            	outJson = !isSingle?result.rows:result.rows[0];
			            }else{
			            	outTxt ='No reservation found';
			            }
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

	            if (err) {
    				done();
    				console.log('Errore getTrips ',err);
  		        	next.ifError(err);
                }

		        var query = '',queryJoin = '',queryFrom = '',params = [],nparam,queryTrip='', isSingle = false;

		        if(req.path()=='/v2/trips/current'){
		        	params[0] = req.user.id;
		        	nparam = 1;
		        	queryTrip += ' AND timestamp_end IS NULL LIMIT 1';
		        	queryJoin += ' INNER JOIN cars on trips.car_plate = cars.plate ';
		        	queryFrom += ',parking,park_enabled';
		        	console.log('trips / current ',queryTrip);

		        }else{

			        if(typeof  req.params.id === 'undefined'){
			        	queryTrip = "";
			        	params[0] = req.user.id;
			        	nparam = 1;
			        }else{
			        	queryTrip = " AND id = $2";
			        	params[0] = req.user.id;
			        	params[1] = req.params.id;
			        	nparam = 2;
			        	isSingle = true;
			        }

					if(typeof  req.params.active !== 'undefined'){
						if(req.params.active == 'true'){
							queryTrip += ' AND timestamp_end IS NULL';
						}else{
							queryTrip += ' AND timestamp_end IS NOT NULL ';
						}		        	
			        }else{
			        	queryTrip += ' AND timestamp_end IS NULL ';
			        }			       

			        if(typeof  req.params.from !== 'undefined'){
			        	queryTrip += ' AND cast(extract(epoch from timestamp_beginning) as integer) >= $'+(nparam+1);
			        	params[nparam] = req.params.from; 
			        	nparam++;
			        }

			        if(typeof  req.params.to !== 'undefined'){
			        	queryTrip += ' AND cast(extract(epoch from timestamp_beginning) as integer) <= $'+(nparam+1);
			        	params[nparam] = req.params.to; 
			        	nparam++;
			        }

					queryTrip += ' ORDER BY timestamp_beginning DESC';

			        if(typeof  req.params.quantity !== 'undefined'){
			        	queryTrip += ' LIMIT $'+(nparam+1);
			        	params[nparam] = req.params.quantity; 
			        	nparam++;
			        }
		        }


		        client.query(
		        	"SELECT id,car_plate,extract(epoch from timestamp_beginning::timestamp with time zone)::integer as timestamp_start, extract(epoch from timestamp_end::timestamp with time zone)::integer as timestamp_end,km_beginning as km_start,km_end,latitude_beginning as lat_start,latitude_end as lat_end,longitude_beginning as lon_start,longitude_end as lon_end,park_seconds"+queryFrom+" FROM trips "+queryJoin+" WHERE customer_id = $1 "+queryTrip, 
		        	params, 
		        	function(err, result) {
			            done();
			            if (err) {
		    				console.log('Errore getTrips select',err);
		  		        	next.ifError(err);
		                }
			            console.log('getTrips select ',err);
			            var outTxt = '',outJson = null;
			            if((typeof result !== 'undefined') && (result.rowCount>0)){
			            	outJson = !isSingle?result.rows:result.rows[0];
			            }else{
			            	outTxt ='No trips found';
			            }
			            sendOutJSON(res,200,outTxt,outJson);		           
		        	}
		        );
		    });
		}
	    return next();
	},

	/**
	 * get pois
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	getPois: function(req, res, next) {
		if(sanitizeInput(req,res)){
			pg.connect(conString, function(err, client, done) {

	            if (err) {
    				done();
    				console.log('Errore getPois connect',err);
  		        	next.ifError(err);
                }

		        var query = '',params = [],queryString = '',isSingle = false;

		        query = "SELECT * FROM pois WHERE true"


		        client.query(
		        	query, 
		        	params, 
		        	function(err, result) {
			            done();
			            if (err) {
		    				console.log('Errore getPois select',err);
		  		        	next.ifError(err);
		                }
			            var outTxt = '',outJson = null;
			            console.log('getPois select',err);
			            if((typeof result !== 'undefined') && (result.rowCount>0)){
			            	outJson = !isSingle?result.rows:result.rows[0];
			            }else{
			            	outTxt ='No pois found';
			            }
			            sendOutJSON(res,200,outTxt,outJson);		           
		        	}
		        );
		    });
		}
        return next();
	},
	/**
	 * get reservations archive
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	getArchiveReservations: function(req, res, next) {
		if(sanitizeInput(req,res)){
			pg.connect(conString, function(err, client, done) {

	            if (err) {
    				done();
    				console.log('Errore getArchiveReservations connect',err);
  		        	next.ifError(err);
                }

		        client.query(
		        	"SELECT * FROM reservations_archive WHERE customer_id = $1", 
		        	[req.user.id], 
		        	function(err, result) {
			            done();
			            if (err) {
		    				console.log('Errore getArchiveReservations select',err);
		  		        	next.ifError(err);
		                }
			            var outTxt = '',outJson = null;
			            console.log('getArchiveReservations select',err);
			            if((typeof result !== 'undefined') && (result.rowCount>0)){
			            	outJson = result.rows;
			            }else{
			            	outTxt ='No reservations in archive found';
			            }
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

	            if (err) {
    				done();
    				console.log('Errore postReservations connect ',err);
  		        	next.ifError(err);
                }

		        if(typeof  req.params.plate !== 'undefined' && req.params.plate !=''){

		        	client.query(
			        	"SELECT EXISTS(SELECT plate FROM cars WHERE plate=$1)", 
			        	[req.params.plate], 
			        	function(err, result) {
				            done();
    			            if (err) {
			    				console.log('Errore postReservations exits car',err);
			  		        	next.ifError(err);
			                }
				            if(result.rows[0].exists){
			            		client.query(
						        	"SELECT EXISTS(SELECT car_plate FROM reservations WHERE (customer_id=$1 OR car_plate=$2) AND active IS TRUE)as reservation, EXISTS(SELECT plate FROM cars WHERE plate=$2 AND status!='operative') as status, EXISTS(SELECT id FROM trips WHERE timestamp_end IS NULL AND car_plate=$2) as trip, EXISTS(SELECT car_plate FROM reservations WHERE car_plate=$2 AND customer_id=$1 AND ts >= (now() - interval '4' hour)) as limit, EXISTS(SELECT car_plate FROM reservations_archive WHERE car_plate=$2 AND customer_id=$1 AND ts >= (now() - interval '4' hour)) as limit_archive", 
						        	[req.user.id,req.params.plate], 
						        	function(err, result) {
							            done();
							            if (err) {
						    				console.log('Errore postReservations exists reservation ',err);
						  		        	next.ifError(err);
						                }
							            console.log('postReservations select ',err);
							            if(result.rows[0].reservation || result.rows[0].status || result.rows[0].trip || result.rows[0].limit || result.rows[0].limit_archive ){
				            				sendOutJSON(res,200,'Error: reservation:'+result.rows[0].reservation+' - status:'+ result.rows[0].status +' - trip:'+ result.rows[0].trip +' - limit:'+ result.rows[0].limit +' - limit_archive:' + result.rows[0].limit_archive,null);
							            }else{
							                var cards = JSON.stringify([req.user.card_code]);
                                            console.error(cards);
									        client.query(
									        	"INSERT INTO reservations (ts,car_plate,customer_id,beginning_ts,active,length,to_send,cards) VALUES (NOW(),$1,$2,NOW(),true,1200,true,$3) RETURNING id",
									        	[req.params.plate,req.user.id,cards],
									        	function(err, result) {
										            done();
				            			            if (err) {
									    				console.log('Errore getPois insert ',err);
									  		        	next.ifError(err);
									                }
										            console.log('postReservations insert ',err);
										            sendOutJSON(res,200,'Reservation created successfully',{'reservation_id':result.rows[0].id});
										           
									        	}
									        );
							            }							           
						        	}
						        );
				            }else{
				            	console.log('Errore postReservations car NOT exists ',err);
				            	sendOutJSON(res,400,'Invalid car plate',null);
				            }
				           
			        	}
			        );
			    }else{
			    	console.log('Errore postReservations invalid parameters ',err);
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

	            if (err) {
    				done();
    				console.log('Errore delReservations connect ',err);
  		        	next.ifError(err);
                }


		        if(typeof  req.params.id !== 'undefined'){
			        client.query(
			        	"UPDATE reservations SET active = FALSE, to_send = TRUE, deleted_ts = NOW()  WHERE id = $1 AND customer_id = $2", 
			        	[req.params.id,req.user.id], 
			        	function(err, result) {
				            done();
    			            if (err) {
			    				console.log('Errore delReservations delete',err);
			  		        	next.ifError(err);
			                }
				            console.log('delReservations delete ',err);
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
	        		(!validator.isByteLength(req.params.plate,5,9))
	        	)
        	) ||

			(
				(typeof req.params.status != 'undefined') && 
				(req.params.status != '') && 
				(!validator.isAlphanumeric(req.params.status)) 
			) ||

			(
				(typeof req.params.lat != 'undefined') && 
				(req.params.lat != '') && 
				(!validator.isFloat(req.params.lat)) 
			) ||

			(
				(typeof req.params.lon != 'undefined') && 
				(req.params.lon != '') && 
				(!validator.isFloat(req.params.lon)) 
			) ||

			(
				(typeof req.params.radius != 'undefined') && 
				(req.params.radius != '') && 
				(!validator.isInt(req.params.radius)) 
			) ||

			(
				(typeof req.params.reservation != 'undefined') && 
				(req.params.reservation != '') && 
				(!validator.isInt(req.params.reservation)) 
			) ||

			(
				(typeof req.params.id != 'undefined') && 
				(req.params.id != '') && 
				(!validator.isInt(req.params.id)) &&
			 	(req.params.id != 'current')
			)||

			(
				(typeof req.params.active != 'undefined') && 
				(req.params.active != '') && 
				(!validator.isBoolean(req.params.active)) 
			)||

			(
				(typeof req.params.quantity != 'undefined') && 
				(req.params.quantity != '') && 
				(!validator.isInt(req.params.quantity)) 
			)||

			(
				(typeof req.params.from != 'undefined') && 
				(req.params.from != '') && 
				(!validator.isInt(req.params.from)) 
			)||

			(
				(typeof req.params.to != 'undefined') && 
				(req.params.to != '') && 
				(!validator.isInt(req.params.to)) 
			)||

			(
				(typeof req.params.action != 'undefined') && 
				(req.params.action != '') && 
				(!validator.isAlphanumeric(req.params.action)) 
			)

		){
			console.log('\n+++++++++++++++++\nvalidation error\n');
			console.log(req.params);
			sendOutJSON(res,400,'Invalid parameters',null);
			return false;
		}else{
			return true;
		}
	}


/* /EXTRA FUNCTIONS */
