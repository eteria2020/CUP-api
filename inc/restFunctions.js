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
		        	"SELECT SUM(residual)as bonus FROM customers_bonus WHERE customer_id=$1 AND (valid_to >now() OR valid_to IS NULL)", 
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

		        var query = '',params = [],queryString = '', queryRecursive = '', querySelect = '',isSingle = false;
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
					
		        		queryString += freeCarCond;
		        	if(typeof req.params.lat !== 'undefined' &&  typeof req.params.lon  !== 'undefined'){
						querySelect += ',ST_Distance_Sphere(ST_SetSRID(ST_MakePoint(cars.longitude, cars.latitude), 4326),ST_SetSRID(ST_MakePoint($2,$1), 4326)) ';
						queryRecursive += 'with recursive tab(plate,lon,lat,soc,dist) as (';
						queryString += ' ) select plate,lon,lat,soc,round(dist)as dist from tab where dist < $3::int order by dist asc';
		        		params[0] = req.params.lat;
		        		params[1] = req.params.lon;
		        		params[2] = req.params.radius || defaultDistance;
		        	}
	        		query = queryRecursive +"SELECT cars.plate,cars.longitude as lon,cars.latitude as lat,cars.battery as soc" + querySelect + "  FROM cars WHERE true " + queryString;
		        }else{
		        	// single car
		        	query = "SELECT cars.*" + fleetsSelect + " FROM cars " + fleetsJoin + " WHERE plate = $1";
		        	params = [req.params.plate];
		        	isSingle =true; 
		        }
		        /*if(!isSingle){
		        	query += freeCarCond; 
		        }*/
		        
		        client.query(
		        	query, 
		        	params,
		        	function(err, result) {
			            done();
			            var outTxt = '',outJson = null;
			            if (err) {
		    				console.log('Errore getCars select',err);
							sendOutJSON(res,400,err,outJson);
		  		        	next.ifError(err);
		                }
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
	
	//getLastTrips function for safo
	getLastTrips: function(req, res, next) {
		if(sanitizeInput(req,res)){
			pg.connect(conString, function(err, client, done) {
	            if (err) {
    				done();
    				console.log('Errore getLastTrips connect',err);
  		        	next.ifError(err);
                }
				var plate = "test";
				var error = "no_error";
				var timestamp = "";
				try{
					json_parsed = JSON.parse(req.body);
					plate = json_parsed.vehicle_license_plate;
					timestamp = json_parsed.violation_timestamp;
				}catch(err){
					error = "JSON is not valid";
				}
				
				var test_date = new Date(timestamp);
				if(isNaN(test_date.getDate())&&(error=="no_error")){
					error = "Date is not valid!";
				}
				
				if(error=="no_error"){
					var query = "select true as \"is_vehicle_sharing\",manufactures as \"vehicle_manufacturer\",model as \"vehicle_model\",trips.fleet_id as \"vehicle_fleet_id\",trips.id as \"trip_id\",timestamp_beginning::text as \"trip_beginning_timestamp\",address_beginning as \"trip_beginning_address\",timestamp_end::text as \"trip_end_timestamp\",address_end as \"trip_end_address\",customer_id,customers.name as \"customer_name\",customers.surname as \"customer_surname\",customers.tax_code as \"customer_tax_code\",customers.maintainer as \"customer_is_operator\",customers.address as \"customer_address\",customers.zip_code as \"customer_zip_code\",customers.town as \"customer_town\",customers.province as \"customer_province\",customers.birth_country as \"customer_country\",customers.email as \"customer_email\",customers.driver_license as \"customer_driver_license_number\",customers.driver_license_categories as \"customer_driver_license_categories\",customers.driver_license_country as \"customer_driver_license_country\",customers.driver_license_release_date::text as \"customer_driver_license_release_date\",customers.driver_license_expire::text as \"customer_driver_license_expiration_date\",customers.driver_license_country as \"customer_driver_license_release_town\",customers.driver_license_authority as \"customer_driver_license_release_authority\" from trips,cars,customers where customers.id=trips.customer_id and car_plate=plate and trips.id in (select id from trips where car_plate='"+plate+"' AND timestamp_beginning <= '"+timestamp+"' LIMIT 2) ORDER BY timestamp_end DESC;";
				        client.query(
						query,
						function(err, result) {
							done();
							var outTxt = 'OK',outJson = [{"is_vehicle_sharing":"false"},null];
							if (err) {
								console.log('getLastTrips select error',err);
								sendOutJSON(res,400,err,outJson);
								next.ifError(err);
							}
							console.log('getLastTrips select',err);
							if((typeof result !== 'undefined') && (result.rowCount==1)){
								outJson = [result.rows[0],null];
							}else{
								if(result.rowCount==2){
									outJson = result.rows;
								}else{
									outTxt ='No trips found';
								}
							}
							sendOutJSON(res,200,outTxt,outJson);
						}
					);
				}else{
					sendOutJSON(res,400,error,'');
				}
				
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
								client.query("SELECT EXISTS(SELECT id FROM trips WHERE timestamp_end IS NULL AND car_plate = $1) as trip, EXISTS(SELECT plate FROM cars WHERE plate=$1 AND status!='operative') as status, EXISTS(SELECT id FROM reservations WHERE car_plate=$1 AND active=TRUE AND customer_id!=$2) as reservation",[plate, req.user.id],function(err,resultTripActive){
									done();
									if (err) {		    				
										console.log('Errore if exists trips ',err);
										next.ifError(err);
									}

									if(cmd == 'OPEN_TRIP' && (resultTripActive.rows[0].trip || resultTripActive.rows[0].status || resultTripActive.rows[0].reservation)){
										console.log('Errore trip active exists',err);
										sendOutJSON(res,400,'Error: reservation:'+resultTripActive.rows[0].reservation+' - status:'+ resultTripActive.rows[0].status +' - trip:'+ resultTripActive.rows[0].trip ,null);
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
	
	/* PUT */
	/**
	 * put new penalty safo
	 * @param  array   req  request
	 * @param  array   res  response
	 * @param  function next handler
	 */
	chargePenalty: function(req, res, next) {
		if(sanitizeInput(req,res)){
			pg.connect(conString, function(err, client, done) {
	            if (err) {
    				done();
    				console.log('Errore chargePenalty connect',err);
  		        	next.ifError(err);
                }
				
				var d = new Date();
				var insert_ts = d.getFullYear() + "/" + ("00" + (d.getMonth() + 1)).slice(-2) + "/" + ("00" + d.getDate()).slice(-2) + " " + ("00" + d.getHours()).slice(-2) + ":" + ("00" + d.getMinutes()).slice(-2) + ":" + ("00" + d.getSeconds()).slice(-2);
				var charged = false;
				
				var customer_id = 0;
				var vehicle_fleet_id = 1;
				var violation_category = 0;
				var trip_id = 0;
				var vehicle_license_plate = "no_plate";
				var violation_timestamp = "1970-01-01 00:00:00";
				var violation_authority = "no_v_authority";
				var violation_number = "no_v_number";
				var violation_description = "no_v_description";
				var rus_id = -1;
				var violation_request_type = -1;
				var violation_status = "N";
				
				var error = "no_error";
				try{
					json_parsed = JSON.parse(req.body);
					customer_id = json_parsed.customer_id;
					if(isNaN(customer_id)){
						error = "customer_id is not valid.";
					}else{
						if(customer_id.length<=0){
							error = "customer_id is not valid.";
						}
					}
					vehicle_fleet_id = json_parsed.vehicle_fleet_id;
					if(isNaN(vehicle_fleet_id)){
						error = "vehicle_fleet_id is not valid.";
					}else{
						if(vehicle_fleet_id.length<=0){
							error = "vehicle_fleet_id is not valid.";
						}
					}
					violation_category = json_parsed.violation_category;
					if(isNaN(violation_category)){
						error = "violation_category is not valid.";
					}else{
						if(violation_category.length<=0){
							error = "violation_category is not valid.";
						}
					}
					trip_id = json_parsed.trip_id;
					if(isNaN(trip_id)){
						error = "trip_id is not valid.";
					}else{
						if(trip_id.length<=0){
							error = "trip_id is not valid.";
						}
					}
					vehicle_license_plate = json_parsed.vehicle_license_plate;
					if(vehicle_license_plate === null || vehicle_license_plate === "null" || vehicle_license_plate.length<1){
						error = "vehicle_license_plate is not valid.";
					}
					violation_timestamp = json_parsed.violation_timestamp;
					var test_date = new Date(violation_timestamp);
					if(isNaN(test_date.getDate())){
						error = "Date is not valid!";
					}
					violation_authority = json_parsed.violation_authority;
					if(violation_authority === null || violation_authority === "null" || violation_authority.length<1){
						error = "violation_authority is not valid.";
					}
					violation_number = json_parsed.violation_number;
					if(violation_number === null || violation_number === "null" || violation_number.length<1){
						error = "violation_number is not valid.";
					}
					violation_description = json_parsed.violation_description;
					if(violation_description === null || violation_description === "null"){
						error = "violation_description is not valid.";
					}
					rus_id = json_parsed.rus_id;
					if(isNaN(rus_id)){
						error = "rus_id is not valid.";
					}
					violation_request_type = json_parsed.violation_request_type;
					if(isNaN(violation_request_type)){
						error = "violation_request_type is not valid.";
					}
					violation_status = json_parsed.violation_status;
					if(violation_status === null || violation_status === "null" || violation_status.length<1 || violation_status.length>1){
						error = "violation_status is not valid.";
					}
					
				}catch(err){
					error = "JSON is not valid";
				}
				var outJson = {"penalty_loading_result":"false"};
				if(error=="no_error"){
					var query = "INSERT INTO safo_penalty VALUES (nextval('safo_penalty_id_seq'), NULL, '"+insert_ts+"', "+charged+", NULL, "+customer_id+", "+vehicle_fleet_id+", "+violation_category+", "+trip_id+", '"+vehicle_license_plate+"', '"+violation_timestamp+"', '"+violation_authority+"', '"+violation_number+"', '"+violation_description+"', "+rus_id+", "+violation_request_type+", '"+violation_status+"');";
				    client.query(
						query,
						function(err, result) {
							done();
							var outTxt = query;
							if (err) {
								console.log('chargePenalty insert error',err);
								sendOutJSON(res,400,"KO",outJson);
								next.ifError(err);
							}else{
								if((typeof result !== 'undefined')){
									outJson = {"penalty_loading_result":"true"};
								}else{
									outJson = {"penalty_loading_result":"false"};
								}
								sendOutJSON(res,200,"OK",outJson);
							}
						}
					);
					
					//outJson=[insert_ts,charged,customer_id,vehicle_fleet_id,violation_category,trip_id,vehicle_license_plate,violation_timestamp,violation_authority,violation_number,violation_description,rus_id,violation_request_type,violation_status];
					//sendOutJSON(res,200,'OK',outJson);
				}else{
					sendOutJSON(res,400,error,{"penalty_loading_result":"false"});
				}
				
		    });
		}
	    return next();
	},
	
	
	/* PUT */
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
			            sendOutJSON(res,400,err,outJson);
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
	
	getTripsNew: function(req, res, next) {
		if(sanitizeInput(req,res)){
			pg.connect(conString, function(err, client, done) {

	            if (err) {
    				done();
    				console.log('Errore getTrips ',err);
  		        	next.ifError(err);
                }

		        var query = '',queryJoin = '',queryFrom = '',params = [],nparam,queryTrip='', isSingle = false;

		        queryJoin += ' LEFT JOIN trip_payments on trips.id = trip_payments.trip_id  ';
		        if(req.path()=='/v2/trips/current'){
		        	params[0] = req.user.id;
		        	nparam = 1;
		        	queryTrip += ' AND timestamp_end IS NULL LIMIT 1';
		        	queryJoin += ' LEFT JOIN trip_payments on trips.id = trip_payments.trip_id  ';
		        	//queryFrom += ',parking,park_enabled';
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
		        	"SELECT trips.id,trips.car_plate,extract(epoch from trips.timestamp_beginning::timestamp with time zone)::integer as timestamp_start, extract(epoch from trips.timestamp_end::timestamp with time zone)::integer as timestamp_end,trips.latitude_beginning as lat_start,trips.latitude_end as lat_end,trips.longitude_beginning as lon_start,trips.longitude_end as lon_end,trips.park_seconds, trip_payments.parking_minutes,trip_payments.total_cost, trip_payments.payed_successfully_at , trip_payments.status FROM trips "+queryJoin+" WHERE customer_id = $1 "+queryTrip, 
		        	params, 
		        	function(err, result) {
			            done();
			            if (err) {
		    				console.log('Errore getTrips select',err);
			            sendOutJSON(res,400,err+req.user.id,outJson);	
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
						        	"SELECT EXISTS(SELECT id FROM trips WHERE car_plate = $2 AND customer_id = $1 AND payable = TRUE AND timestamp_beginning >= (SELECT consumed_ts FROM (SELECT (consumed_ts - interval '180 second') as consumed_ts FROM (SELECT consumed_ts FROM reservations WHERE car_plate=$2 AND customer_id=$1 AND ts >= (now() - interval '4' hour) UNION SELECT consumed_ts FROM reservations_archive WHERE car_plate=$2 AND customer_id=$1 AND ts >= (now() - interval '4' hour)) AS reservation ORDER BY consumed_ts DESC LIMIT 1) as reservation WHERE consumed_ts IS NOT NULL) AND timestamp_beginning <= (SELECT consumed_ts FROM (SELECT (consumed_ts + interval '180 second') as consumed_ts FROM (SELECT consumed_ts FROM reservations WHERE car_plate=$2 AND customer_id=$1 AND ts >= (now() - interval '4' hour) UNION SELECT consumed_ts FROM reservations_archive WHERE car_plate=$2 AND customer_id=$1 AND ts >= (now() - interval '4' hour)) AS reservation ORDER BY consumed_ts DESC LIMIT 1) as reservation WHERE consumed_ts IS NOT NULL) AND timestamp_end IS NOT NULL AND (timestamp_end - timestamp_beginning) > '00:02:00') as trips",
						        	[req.user.id,req.params.plate], 
						        	function(err, result) {
							            done();
							            if (err) {
						    				console.log('Errore postReservations exists trips ',err);
						  		        	next.ifError(err);
						                }
										if (result.rows[0].trips){
											var limit = false;
											var limit_archive = false;
											var queryLimit = "";
										} else {
											var queryLimit = ", EXISTS(SELECT car_plate FROM reservations WHERE car_plate=$2 AND customer_id=$1 AND ts >= (now() - interval '4' hour)) as limit, EXISTS(SELECT car_plate FROM reservations_archive WHERE car_plate=$2 AND customer_id=$1 AND ts >= (now() - interval '4' hour)) as limit_archive";
										}
									client.query(
										"SELECT EXISTS(SELECT car_plate FROM reservations WHERE (customer_id=$1 OR car_plate=$2) AND active IS TRUE)as reservation, EXISTS(SELECT plate FROM cars WHERE plate=$2 AND status!='operative') as status, EXISTS(SELECT id FROM trips WHERE timestamp_end IS NULL AND car_plate=$2) as trip" + queryLimit, 
										[req.user.id,req.params.plate], 
										function(err, result) {
											done();
											if (err) {
												console.log('Errore postReservations exists reservation ',err);
												next.ifError(err);
											}
											console.log('postReservations select ',err);
											if (!result.rows[0].trips){
												var limit = result.rows[0].limit;
												var limit_archive = result.rows[0].limit_archive;
											}
											if(result.rows[0].reservation || result.rows[0].status || result.rows[0].trip || limit || limit_archive ){
												sendOutJSON(res,200,'Error: reservation:'+result.rows[0].reservation+' - status:'+ result.rows[0].status +' - trip:'+ result.rows[0].trip +' - limit:'+ limit +' - limit_archive:' + limit_archive,null);
											}else{
												var cards = JSON.stringify([req.user.card_code]);
												console.error(cards);
												client.query(
													"INSERT INTO reservations (ts,car_plate,customer_id,beginning_ts,active,length,to_send,cards) VALUES (NOW(),$1,$2,NOW(),true,1800,true,$3) RETURNING id",
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
										});
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
